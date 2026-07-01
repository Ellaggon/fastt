import {
	fetchFinancialJson,
	financialEndpointUrls,
	getCachedFinancialJson,
	refreshFinancialJson,
} from "../../_client/financial-data-cache"
import {
	bookingDisplayName,
	bookingSubtitle,
	buildBookingContextIndex,
	providerDisplayName,
	resolveBookingContext,
	statePillClass,
	type FinancialHumanContext,
} from "../../_client/financial-human-display"

type ProviderPayablesSegment =
	| "blocked"
	| "commission_missing"
	| "review_amounts"
	| "statement_review"
	| "ready"

type ProviderPayableItem = {
	id: string
	segment: ProviderPayablesSegment
	provider: string
	bookingId: string
	grossAmount: number | null
	commissionAmount: number | null
	taxAmount: number | null
	providerPendingAmount: number | null
	currency: string
	blocker: string
	owner: string
	nextAction: string
	blockerSummary: string
	commissionSummary: string
	taxSummary: string
	relatedBookings: string[]
	description: string
	raw: any
}

const state: {
	segment: ProviderPayablesSegment
	items: ProviderPayableItem[]
	bookingContext: Map<string, FinancialHumanContext>
} = {
	segment: "blocked",
	items: [],
	bookingContext: new Map(),
}

const segmentLabels: Record<ProviderPayablesSegment, string> = {
	blocked: "Bloqueados",
	commission_missing: "Falta comisión",
	review_amounts: "Revisar importes",
	statement_review: "Resumen pendiente",
	ready: "Sin bloqueo principal",
}

const segmentHints: Record<ProviderPayablesSegment, string> = {
	blocked: "Hay un requisito operativo antes de explicar el importe pendiente.",
	commission_missing: "Falta confirmar la comisión acordada para calcular el pendiente.",
	review_amounts: "Los importes o comprobantes visibles deben revisarse primero.",
	statement_review: "El resumen del proveedor requiere revisión antes de avanzar.",
	ready: "No hay bloqueo principal visible; mantener como seguimiento operativo.",
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function formatMoney(amount: number | null, currency: string): string {
	if (amount == null || Number.isNaN(Number(amount))) return "Por revisar"
	try {
		return new Intl.NumberFormat("es", {
			style: "currency",
			currency: currency || "USD",
			maximumFractionDigits: 2,
		}).format(Number(amount))
	} catch {
		return `${Number(amount).toFixed(2)} ${currency || ""}`.trim()
	}
}

function numeric(value: unknown): number | null {
	if (value == null || value === "") return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

function ownerLabel(owner: unknown): string {
	const value = String(owner || "provider_finance")
	const labels: Record<string, string> = {
		financial_operations: "Finanzas",
		provider_finance: "Finanzas proveedor",
		reconciliation_ops: "Revisión de importes",
		provider_ops: "Operación proveedor",
	}
	return labels[value] || "Finanzas proveedor"
}

function detailCodes(item: any): string[] {
	return Array.isArray(item?.blockingDetails)
		? item.blockingDetails.map((detail: any) => String(detail?.code || "")).filter(Boolean)
		: []
}

function detailReasons(item: any): string[] {
	return Array.isArray(item?.blockingDetails)
		? item.blockingDetails.map((detail: any) => String(detail?.reason || "")).filter(Boolean)
		: []
}

function humanAction(action: unknown): string {
	const text = String(action || "Revisar los requisitos operativos del caso.")
	if (text.includes("provider finance profile"))
		return "Completar o revisar los datos financieros del proveedor."
	if (text.includes("commission snapshot")) return "Confirmar la comisión acordada para la reserva."
	if (text.includes("reconciliation")) return "Revisar importes y comprobantes antes de continuar."
	if (text.includes("statement")) return "Revisar el resumen del proveedor antes de avanzar."
	if (text.includes("payout reference")) return "Registrar la referencia externa cuando exista."
	if (text.includes("Monitor")) return "Mantener en seguimiento operativo."
	return text
}

function primaryBlocker(item: any): string {
	const codes = detailCodes(item)
	if (codes.includes("provider_profile_incomplete")) return "Datos del proveedor incompletos"
	if (codes.includes("commission_snapshot_missing")) return "Falta comisión acordada"
	if (codes.includes("provider_finance_dispute")) return "Importes pendientes de revisión"
	if (codes.includes("provider_statement_pending")) return "Resumen del proveedor pendiente"
	if (codes.includes("payout_reference_missing")) return "Falta referencia externa"
	if (codes.includes("payout_blocked") || codes.length) return "Bloqueo operativo"
	return "Sin bloqueo principal"
}

function segmentFor(item: any): ProviderPayablesSegment {
	const codes = detailCodes(item)
	if (codes.includes("commission_snapshot_missing")) return "commission_missing"
	if (codes.includes("provider_finance_dispute")) return "review_amounts"
	if (codes.includes("provider_statement_pending")) return "statement_review"
	if (codes.includes("provider_profile_incomplete") || codes.includes("payout_blocked"))
		return "blocked"
	if (item?.reconciliation?.readyForPayable === false) return "review_amounts"
	if (item?.statement?.pending || item?.statement?.state === "stale") return "statement_review"
	return "ready"
}

function blockerSummary(item: any): string {
	const blocker = primaryBlocker(item)
	const reasons = detailReasons(item)
	if (blocker === "Sin bloqueo principal")
		return "No hay bloqueo principal visible para esta reserva."
	if (reasons.length) return reasons[0]
	return `${blocker}. Revisa el detalle y completa la próxima acción antes de avanzar.`
}

function commissionSummary(item: any): string {
	if (item?.commission?.missing || item?.commissionAmount == null) {
		return "Falta confirmar la comisión acordada para esta reserva."
	}
	return "La comisión está visible para esta reserva."
}

function taxSummary(item: any): string {
	const amount = numeric(item?.taxAmount)
	if (amount == null || amount === 0)
		return "No hay impuestos visibles o están en cero para esta reserva."
	return "Los impuestos visibles ya están incluidos en el cálculo operativo."
}

function buildItem(item: any): ProviderPayableItem {
	const segment = segmentFor(item)
	return {
		id: `provider-payable:${item?.bookingId || crypto.randomUUID()}`,
		segment,
		provider: providerDisplayName(item?.providerId || "Proveedor actual", item),
		bookingId: String(item?.bookingId || "Sin reserva"),
		grossAmount: numeric(item?.grossAmount ?? item?.contract?.grossAmount),
		commissionAmount: numeric(item?.commissionAmount),
		taxAmount: numeric(item?.taxAmount ?? item?.contract?.taxAmount),
		providerPendingAmount: numeric(item?.netPayable ?? item?.payable?.netPayable),
		currency: String(item?.currency || "USD"),
		blocker: primaryBlocker(item),
		owner: ownerLabel(item?.operationalOwner),
		nextAction: humanAction(item?.nextOperationalAction),
		blockerSummary: blockerSummary(item),
		commissionSummary: commissionSummary(item),
		taxSummary: taxSummary(item),
		relatedBookings: [bookingDisplayName(item?.bookingId || "Sin reserva", item)],
		description:
			segment === "ready"
				? "El importe pendiente tiene información suficiente para seguimiento operativo."
				: "El importe pendiente necesita resolver un requisito operativo antes de avanzar.",
		raw: item,
	}
}

function buildItems(payload: any): ProviderPayableItem[] {
	const items = Array.isArray(payload?.items) ? payload.items : []
	return items.map(buildItem)
}

function segmentCount(segment: ProviderPayablesSegment): number {
	return state.items.filter((item) => item.segment === segment).length
}

function renderSegments(): void {
	document
		.querySelectorAll<HTMLButtonElement>("[data-provider-payables-segment]")
		.forEach((button) => {
			const segment = button.dataset.providerPayablesSegment as ProviderPayablesSegment
			const active = segment === state.segment
			button.textContent = `${segmentLabels[segment]} (${segmentCount(segment)})`
			button.className = active
				? "rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
				: "rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500"
		})
}

function renderRows(): void {
	const rows = document.getElementById("providerPayablesRows")
	const summary = document.getElementById("providerPayablesSummary")
	if (!rows) return
	const visible = state.items.filter((item) => item.segment === state.segment)
	if (summary) {
		summary.textContent = `${segmentLabels[state.segment]}: ${visible.length} caso${visible.length === 1 ? "" : "s"}. ${segmentHints[state.segment]}`
	}
	if (!visible.length) {
		rows.innerHTML = `<tr><td colspan="6" class="px-3 py-8 text-center text-sm text-slate-500">No hay pagos pendientes en este segmento.</td></tr>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const subtitle = bookingSubtitle(context)
			const stateClass =
				item.blocker === "Sin bloqueo principal"
					? statePillClass("ready")
					: statePillClass("blocked")
			return `
			<tr class="cursor-pointer border-t border-slate-200 align-top transition hover:bg-slate-50" data-provider-payable-id="${escapeHtml(item.id)}">
				<td class="px-3 py-4"><div class="font-semibold text-slate-950">${escapeHtml(item.provider)}</div><div class="mt-1 text-xs text-slate-500">${escapeHtml(subtitle)}</div></td>
				<td class="px-3 py-4"><div class="font-semibold text-slate-950">${escapeHtml(booking)}</div><div class="mt-1 text-xs text-slate-500">${escapeHtml(item.description)}</div></td>
				<td class="px-3 py-4 text-base font-semibold text-slate-950">${escapeHtml(formatMoney(item.providerPendingAmount, item.currency))}</td>
				<td class="px-3 py-4"><span class="rounded-full border px-2 py-1 text-xs font-semibold ${stateClass}">${escapeHtml(item.blocker)}</span></td>
				<td class="px-3 py-4 text-slate-700">${escapeHtml(item.owner)}</td>
				<td class="px-3 py-4 text-xs font-semibold leading-5 text-slate-800">${escapeHtml(item.nextAction)}</td>
			</tr>`
		})
		.join("")
}

function detailRow(label: string, value: unknown): string {
	return `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">${escapeHtml(label)}</p><p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function openDrawer(item: ProviderPayableItem): void {
	const drawer = document.getElementById("providerPayablesDrawer")
	const backdrop = document.getElementById("providerPayablesDrawerBackdrop")
	const body = document.getElementById("providerPayablesDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	body.innerHTML = `
		<section class="space-y-4">
			<div class="rounded-3xl bg-slate-950 p-5 text-white">
				<p class="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-bold">${escapeHtml(item.blocker)}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-300">${escapeHtml(item.blockerSummary)}</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				${detailRow("Proveedor", providerDisplayName(item.raw?.providerId || item.provider, context))}
				${detailRow("Reserva", bookingDisplayName(item.bookingId, context))}
				${detailRow("Alojamiento", bookingSubtitle(context))}
				${detailRow("Bruto", formatMoney(item.grossAmount, item.currency))}
				${detailRow("Comisión", formatMoney(item.commissionAmount, item.currency))}
				${detailRow("Impuestos", formatMoney(item.taxAmount, item.currency))}
				${detailRow("Pendiente proveedor", formatMoney(item.providerPendingAmount, item.currency))}
			</div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Comisión</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.commissionSummary)}</p>
			</div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Impuestos</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.taxSummary)}</p>
			</div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Reservas relacionadas</p>
				<p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(item.relatedBookings.join(", "))}</p>
			</div>
			<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Próxima acción</p>
				<p class="mt-2 text-sm font-semibold text-amber-950">${escapeHtml(item.nextAction)}</p>
				<p class="mt-3 text-xs text-amber-800">Esta vista solo explica el pendiente y sus bloqueos. No ejecuta pagos ni mueve dinero.</p>
			</div>
			<details class="rounded-2xl border border-slate-200 bg-white p-4">
				<summary class="cursor-pointer text-sm font-semibold text-slate-700">Detalle técnico</summary>
				<pre class="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">${escapeHtml(JSON.stringify(item.raw, null, 2))}</pre>
			</details>
		</section>`
	backdrop.classList.remove("hidden")
	drawer.classList.remove("translate-x-full")
}

function closeDrawer(): void {
	document.getElementById("providerPayablesDrawerBackdrop")?.classList.add("hidden")
	document.getElementById("providerPayablesDrawer")?.classList.add("translate-x-full")
}

async function loadProviderPayables(): Promise<void> {
	try {
		const cached = getCachedFinancialJson(financialEndpointUrls.providerFinance)
		const cachedOperations = getCachedFinancialJson(financialEndpointUrls.operations)
		if (cached) {
			state.bookingContext = buildBookingContextIndex(cachedOperations)
			state.items = buildItems(cached)
			renderSegments()
			renderRows()
			void Promise.all([
				refreshFinancialJson(financialEndpointUrls.providerFinance),
				fetchFinancialJson(financialEndpointUrls.operations).catch(
					() => cachedOperations || { items: [] }
				),
			])
				.then(([payload, operationsPayload]) => {
					state.bookingContext = buildBookingContextIndex(operationsPayload)
					state.items = buildItems(payload)
					renderSegments()
					renderRows()
				})
				.catch(() => {})
			return
		}
		const [payload, operationsPayload] = await Promise.all([
			fetchFinancialJson(financialEndpointUrls.providerFinance),
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
		])
		state.bookingContext = buildBookingContextIndex(operationsPayload)
		state.items = buildItems(payload)
		renderSegments()
		renderRows()
	} catch {
		const rows = document.getElementById("providerPayablesRows")
		const summary = document.getElementById("providerPayablesSummary")
		if (summary) summary.textContent = "No se pudo cargar pagos pendientes a proveedores."
		if (rows) {
			rows.innerHTML = `<tr><td colspan="6" class="px-3 py-8 text-center text-sm text-rose-700">Intenta recargar la página. No se ejecutó ningún pago.</td></tr>`
		}
	}
}

export function initProviderPayablesWorkspace(): void {
	const rows = document.getElementById("providerPayablesRows")
	if (!rows || rows.dataset.providerPayablesReady === "true") return
	rows.dataset.providerPayablesReady = "true"
	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const segmentButton = target.closest(
			"[data-provider-payables-segment]"
		) as HTMLButtonElement | null
		if (segmentButton?.dataset.providerPayablesSegment) {
			state.segment = segmentButton.dataset.providerPayablesSegment as ProviderPayablesSegment
			renderSegments()
			renderRows()
			return
		}
		const row = target.closest("[data-provider-payable-id]") as HTMLElement | null
		if (row?.dataset.providerPayableId) {
			const item = state.items.find((entry) => entry.id === row.dataset.providerPayableId)
			if (item) openDrawer(item)
		}
	})
	document.getElementById("providerPayablesDrawerClose")?.addEventListener("click", closeDrawer)
	document.getElementById("providerPayablesDrawerBackdrop")?.addEventListener("click", closeDrawer)
	void loadProviderPayables()
}
