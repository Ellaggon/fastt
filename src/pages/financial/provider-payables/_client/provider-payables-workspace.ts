import {
	fetchFinancialJson,
	financialEndpointUrls,
	financialUrlWithCursor,
	getCachedFinancialJson,
	mergeFinancialPayloadById,
	refreshFinancialJson,
} from "../../_client/financial-data-cache"
import {
	filterItemsByAccommodationScope,
	getFinancialAccommodationScope,
} from "../../_client/financial-accommodation-scope"
import {
	bookingDisplayName,
	bookingSubtitle,
	buildBookingContextIndex,
	providerDisplayName,
	resolveBookingContext,
	stateDotClass,
	type FinancialHumanContext,
} from "../../_client/financial-human-display"
import {
	financialSegmentClass,
	financialSegmentMarkup,
	financialUi,
} from "../../_client/financial-ui-classes"

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
	payload: any | null
	nextCursor: string | null
	hasMore: boolean
	loadingMore: boolean
} = {
	segment: "blocked",
	items: [],
	bookingContext: new Map(),
	payload: null,
	nextCursor: null,
	hasMore: false,
	loadingMore: false,
}

const PAGE_LIMIT = 25

const segmentLabels: Record<ProviderPayablesSegment, string> = {
	blocked: "Bloqueados",
	commission_missing: "Falta comisión acordada",
	review_amounts: "Revisar importes",
	statement_review: "Resumen del proveedor pendiente",
	ready: "Sin acción urgente",
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

function formatCompactAmount(amount: unknown, currency: unknown): string {
	const value = numeric(amount)
	if (value == null) return "0"
	const code = String(currency || "USD")
	try {
		return new Intl.NumberFormat("es", {
			style: "currency",
			currency: code,
			notation: "compact",
			maximumFractionDigits: 1,
		}).format(value)
	} catch {
		return `${value.toFixed(2)} ${code}`.trim()
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

function displayBlocker(blocker: string): string {
	return blocker === "Sin bloqueo principal" ? "Sin acción urgente" : blocker
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
	return scopedItems().filter((item) => item.segment === segment).length
}

function scopedItems(): ProviderPayableItem[] {
	return filterItemsByAccommodationScope(
		state.items,
		getFinancialAccommodationScope(),
		state.bookingContext
	)
}

function sortProviderPayableItems(items: ProviderPayableItem[]): ProviderPayableItem[] {
	return [...items].sort((left, right) => {
		const leftBlocked = left.blocker === "Sin bloqueo principal" ? 0 : 1
		const rightBlocked = right.blocker === "Sin bloqueo principal" ? 0 : 1
		if (leftBlocked !== rightBlocked) return rightBlocked - leftBlocked
		return (right.providerPendingAmount || 0) - (left.providerPendingAmount || 0)
	})
}

function renderSegments(): void {
	document
		.querySelectorAll<HTMLButtonElement>("[data-provider-payables-segment]")
		.forEach((button) => {
			const segment = button.dataset.providerPayablesSegment as ProviderPayablesSegment
			const active = segment === state.segment
			button.innerHTML = financialSegmentMarkup(
				segmentLabels[segment],
				segmentCount(segment),
				active
			)
			button.className = financialSegmentClass(active)
		})
}

function renderRows(): void {
	const rows = document.getElementById("providerPayablesRows")
	const summary = document.getElementById("providerPayablesSummary")
	const summaryHint = document.getElementById("providerPayablesSummaryHint")
	if (!rows) return
	const visible = sortProviderPayableItems(
		scopedItems().filter((item) => item.segment === state.segment)
	)
	if (summary) {
		summary.textContent = `${visible.length} caso${visible.length === 1 ? "" : "s"} · ${segmentLabels[state.segment]}.`
	}
	if (summaryHint) summaryHint.textContent = segmentHints[state.segment]
	renderLoadMore()
	if (!visible.length) {
		const emptyMessages: Record<ProviderPayablesSegment, string> = {
			blocked: "No hay pagos pendientes bloqueados.",
			commission_missing: "No hay casos con comisión faltante.",
			review_amounts: "No hay importes que requieran revisión ahora.",
			statement_review: "No hay resúmenes de proveedor pendientes.",
			ready: "No hay pagos pendientes sin acción urgente en esta vista.",
		}
		rows.innerHTML = `<div class="${financialUi.emptyState}">${escapeHtml(emptyMessages[state.segment])}</div>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const subtitle = bookingSubtitle(context)
			const stateKind: "ready" | "blocked" =
				item.blocker === "Sin bloqueo principal" ? "ready" : "blocked"
			const blocker = displayBlocker(item.blocker)
			return `
			<article class="cursor-pointer px-4 py-4 transition hover:bg-slate-50" data-provider-payable-id="${escapeHtml(item.id)}">
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_160px_minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start">
					<div>
						<div class="flex items-center gap-2 text-xs font-semibold text-slate-600">
							<span class="h-2.5 w-2.5 rounded-full ${stateDotClass(stateKind)}" aria-hidden="true"></span>
							<span>${escapeHtml(blocker)}</span>
						</div>
						<h3 class="mt-2 text-base font-semibold text-slate-950">${escapeHtml(item.provider)}</h3>
						<p class="mt-1 text-sm font-medium text-slate-700">${escapeHtml(booking)}</p>
						<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(subtitle)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Pendiente proveedor</p>
						<p class="mt-1 text-lg font-bold text-slate-950">${escapeHtml(formatMoney(item.providerPendingAmount, item.currency))}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Qué lo detiene</p>
						<p class="mt-1 text-sm font-semibold leading-6 text-slate-950">${escapeHtml(blocker)}</p>
						<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(item.description)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Próxima acción</p>
						<p class="mt-1 text-sm font-semibold leading-6 text-slate-900">${escapeHtml(item.nextAction)}</p>
						<p class="mt-3 text-xs text-slate-500">Responsable: <span class="font-semibold text-slate-700">${escapeHtml(item.owner)}</span></p>
					</div>
				</div>
			</article>`
		})
		.join("")
}

function applyPayload(payload: any, operationsPayload: any): void {
	state.payload = payload
	state.nextCursor = String(payload?.pagination?.nextCursor || "") || null
	state.hasMore = Boolean(payload?.pagination?.hasMore && state.nextCursor)
	state.bookingContext = buildBookingContextIndex(operationsPayload)
	state.items = buildItems(payload)
	renderSegments()
	renderRows()
}

function renderLoadMore(): void {
	const wrap = document.getElementById("providerPayablesLoadMoreWrap")
	const button = document.getElementById("providerPayablesLoadMore") as HTMLButtonElement | null
	wrap?.classList.toggle("hidden", !state.hasMore)
	if (button) {
		button.disabled = state.loadingMore
		button.textContent = state.loadingMore ? "Cargando..." : "Cargar más pagos"
	}
}

function renderProviderFinancialSummary(payload: any): void {
	const summary = document.getElementById("providerPayablesSummary")
	const summaryHint = document.getElementById("providerPayablesSummaryHint")
	if (!summary || !payload?.summary) return
	const data = payload.summary
	const collections = data.collections || {}
	const refunds = data.refunds || {}
	const exceptions = data.exceptions || {}
	const settlements = data.settlements || {}
	const currency =
		collections.currency || refunds.currency || settlements.currency || data.currency || "USD"
	summary.textContent = [
		`${Number(collections.count || 0)} cobros · ${formatCompactAmount(collections.amount, currency)}`,
		`${Number(refunds.count || 0)} refunds · ${formatCompactAmount(refunds.amount, currency)}`,
		`${Number(exceptions.open || 0)} excepciones abiertas`,
		`${Number(settlements.count || 0)} settlements`,
	].join(" · ")
	if (summaryHint) {
		const computedAt = payload?.freshness?.computedAt
			? new Date(String(payload.freshness.computedAt))
			: null
		const freshness =
			computedAt && !Number.isNaN(computedAt.getTime())
				? `Actualizado ${computedAt.toLocaleTimeString("es", {
						hour: "2-digit",
						minute: "2-digit",
					})}.`
				: "Resumen materializado."
		summaryHint.textContent = `${freshness} El detalle se carga bajo demanda por segmento.`
	}
}

function detailRow(label: string, value: unknown): string {
	return `<div class="fastt-drawer-soft-card p-4"><p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">${escapeHtml(label)}</p><p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function openDrawer(item: ProviderPayableItem): void {
	const drawer = document.getElementById("providerPayablesDrawer")
	const backdrop = document.getElementById("providerPayablesDrawerBackdrop")
	const body = document.getElementById("providerPayablesDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	body.innerHTML = `
		<section class="space-y-4">
			<div class="fastt-drawer-attention p-5">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">${escapeHtml(displayBlocker(item.blocker))}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-700">${escapeHtml(item.blockerSummary)}</p>
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
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Comisión</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.commissionSummary)}</p>
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Impuestos</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.taxSummary)}</p>
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Reservas relacionadas</p>
				<p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(item.relatedBookings.join(", "))}</p>
			</div>
			<div class="fastt-drawer-secondary-card p-4">
				<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Próxima acción</p>
				<p class="mt-2 text-sm font-semibold text-slate-950">${escapeHtml(item.nextAction)}</p>
				<p class="mt-3 text-xs leading-5 text-slate-500">Esta vista solo explica el pendiente y sus bloqueos. No ejecuta pagos ni mueve dinero.</p>
			</div>
			<details class="fastt-drawer-section p-4">
				<summary class="cursor-pointer text-sm font-semibold text-slate-700">Detalle técnico</summary>
				<pre class="${financialUi.technicalPre}">${escapeHtml(JSON.stringify(item.raw, null, 2))}</pre>
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
		const cachedSummary = getCachedFinancialJson(financialEndpointUrls.providerSummary)
		if (cachedSummary) renderProviderFinancialSummary(cachedSummary)
		void fetchFinancialJson(financialEndpointUrls.providerSummary)
			.then(renderProviderFinancialSummary)
			.catch(() => {})
		const cached = getCachedFinancialJson(financialEndpointUrls.providerFinance)
		const cachedOperations = getCachedFinancialJson(financialEndpointUrls.operations)
		if (cached) {
			applyPayload(cached, cachedOperations)
			void Promise.all([
				refreshFinancialJson(financialEndpointUrls.providerFinance),
				fetchFinancialJson(financialEndpointUrls.operations).catch(
					() => cachedOperations || { items: [] }
				),
			])
				.then(([payload, operationsPayload]) => {
					applyPayload(payload, operationsPayload)
				})
				.catch(() => {})
			return
		}
		const [payload, operationsPayload] = await Promise.all([
			fetchFinancialJson(financialEndpointUrls.providerFinance),
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
		])
		applyPayload(payload, operationsPayload)
	} catch {
		const rows = document.getElementById("providerPayablesRows")
		const summary = document.getElementById("providerPayablesSummary")
		if (summary) summary.textContent = "No se pudo cargar pagos pendientes a proveedores."
		if (rows) {
			rows.innerHTML = `<div class="px-4 py-8 text-center text-sm text-rose-700">Intenta recargar la página. No se ejecutó ningún pago.</div>`
		}
	}
}

async function loadMoreProviderPayables(): Promise<void> {
	if (!state.nextCursor || state.loadingMore) return
	state.loadingMore = true
	renderLoadMore()
	try {
		const [payload, operationsPayload] = await Promise.all([
			fetchFinancialJson(
				financialUrlWithCursor(financialEndpointUrls.providerFinance, {
					limit: PAGE_LIMIT,
					cursor: state.nextCursor,
				}),
				{ force: true }
			),
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
		])
		applyPayload(
			mergeFinancialPayloadById(state.payload, payload, (item) => String(item?.bookingId || "")),
			operationsPayload
		)
	} finally {
		state.loadingMore = false
		renderLoadMore()
	}
}

export function initProviderPayablesWorkspace(): void {
	const rows = document.getElementById("providerPayablesRows")
	if (!rows || rows.dataset.providerPayablesReady === "true") return
	rows.dataset.providerPayablesReady = "true"
	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		if (target.closest("#providerPayablesLoadMore")) {
			void loadMoreProviderPayables()
			return
		}
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
