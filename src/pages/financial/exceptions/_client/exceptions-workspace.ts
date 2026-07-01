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
	resolveBookingContext,
	stateDotClass,
	type FinancialHumanContext,
} from "../../_client/financial-human-display"

type ExceptionSegment =
	| "needs_review"
	| "missing_data"
	| "reference_issue"
	| "review_overdue"
	| "closed"

type ExceptionItem = {
	id: string
	segment: ExceptionSegment
	caseLabel: string
	bookingId: string
	whatHappened: string
	impact: string
	owner: string
	ageLabel: string
	nextAction: string
	status: string
	raw: any
}

const state: {
	segment: ExceptionSegment
	items: ExceptionItem[]
	bookingContext: Map<string, FinancialHumanContext>
} = {
	segment: "needs_review",
	items: [],
	bookingContext: new Map(),
}

const segmentLabels: Record<ExceptionSegment, string> = {
	needs_review: "Requieren revisión",
	missing_data: "Datos faltantes",
	reference_issue: "Referencia inconsistente",
	review_overdue: "Revisión vencida",
	closed: "Cerradas",
}

const segmentHints: Record<ExceptionSegment, string> = {
	needs_review: "Casos que necesitan lectura humana antes de avanzar.",
	missing_data: "Faltan datos confirmados de la reserva o del comprobante.",
	reference_issue: "Hay referencias ausentes, duplicadas o difíciles de asociar.",
	review_overdue: "La revisión quedó desactualizada o requiere una nueva lectura.",
	closed: "Casos cerrados o descartados que quedan como historial operativo.",
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function daysSince(value: unknown): number | null {
	if (!value) return null
	const date = new Date(String(value))
	if (Number.isNaN(date.getTime())) return null
	return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

function ageLabel(value: unknown): string {
	const days = daysSince(value)
	if (days == null) return "Por revisar"
	return `${days} ${days === 1 ? "día" : "días"}`
}

function ownerLabel(owner: unknown): string {
	const labels: Record<string, string> = {
		financial_operations: "Finanzas",
		reconciliation_ops: "Revisión de importes",
		provider_ops: "Operación proveedor",
		support: "Soporte",
		external_finance: "Respuesta externa",
	}
	return labels[String(owner || "financial_operations")] || "Finanzas"
}

function exceptionCodes(item: any): string[] {
	if (Array.isArray(item?.operation?.operationalException?.all)) {
		return item.operation.operationalException.all
			.map((entry: any) => String(entry?.code || ""))
			.filter(Boolean)
	}
	return String(item?.code || "") ? [String(item.code)] : []
}

function segmentFor(item: any): ExceptionSegment {
	const status = String(item?.status || "")
	const codes = exceptionCodes(item)
	if (["resolved", "dismissed", "closed"].includes(status)) return "closed"
	if (String(item?.reviewState || "") === "stale") return "review_overdue"
	if (codes.some((code) => code.includes("reference"))) return "reference_issue"
	if (codes.some((code) => code.includes("snapshot") || code.includes("missing")))
		return "missing_data"
	return "needs_review"
}

function titleFor(item: any): string {
	const codes = exceptionCodes(item)
	if (codes.includes("incomplete_contract_snapshot")) return "Datos de reserva incompletos"
	if (codes.includes("missing_payment_reference")) return "Falta referencia de cobro"
	if (codes.includes("missing_settlement_reference")) return "Falta referencia de liquidación"
	if (codes.includes("missing_refund_reference")) return "Falta referencia de reembolso"
	if (String(item?.reviewState || "") === "stale") return "Revisión desactualizada"
	return item?.title || item?.reason || "Caso financiero por revisar"
}

function impactFor(segment: ExceptionSegment): string {
	if (segment === "missing_data")
		return "El caso no puede explicarse completamente hasta completar datos."
	if (segment === "reference_issue")
		return "La referencia debe aclararse antes de cerrar la revisión."
	if (segment === "review_overdue")
		return "La información cambió y la revisión anterior ya no alcanza."
	if (segment === "closed") return "No requiere trabajo diario; queda como historial."
	return "Puede bloquear una revisión financiera si no se atiende."
}

function nextActionFor(segment: ExceptionSegment): string {
	if (segment === "closed") return "Mantener como referencia."
	if (segment === "missing_data") return "Completar datos o registrar por qué siguen faltando."
	if (segment === "reference_issue")
		return "Revisar la referencia externa y asociarla al caso correcto."
	if (segment === "review_overdue") return "Revisar de nuevo con la información más reciente."
	return "Abrir el detalle y decidir si corresponde seguimiento, cierre o descarte."
}

function passiveStateLabel(segment: ExceptionSegment): string {
	const labels: Record<ExceptionSegment, string> = {
		needs_review: "Necesita revisión humana",
		missing_data: "Faltan datos",
		reference_issue: "Referencia inconsistente",
		review_overdue: "Revisión desactualizada",
		closed: "Cerrada",
	}
	return labels[segment]
}

function passiveStateKind(
	segment: ExceptionSegment
): "blocked" | "waiting" | "ready" | "closed" | "neutral" {
	if (segment === "closed") return "closed"
	if (segment === "review_overdue" || segment === "missing_data") return "blocked"
	if (segment === "reference_issue") return "waiting"
	return "neutral"
}

function buildItem(item: any): ExceptionItem {
	const segment = segmentFor(item)
	const bookingId = String(item?.bookingId || item?.operation?.bookingId || "Sin reserva")
	return {
		id: String(item?.persistedId || item?.id || `${bookingId}:${titleFor(item)}`),
		segment,
		caseLabel: titleFor(item),
		bookingId,
		whatHappened: String(
			item?.description || item?.reason || "El caso necesita revisión operativa."
		),
		impact: impactFor(segment),
		owner: ownerLabel(item?.owner || item?.nextOwner || item?.workflow?.owner),
		ageLabel: ageLabel(item?.openedAt || item?.workflow?.openedAt || item?.createdAt),
		nextAction: nextActionFor(segment),
		status: String(item?.status || "open"),
		raw: item,
	}
}

function buildItems(payloads: any[]): ExceptionItem[] {
	const rawItems = payloads.flatMap((payload) =>
		Array.isArray(payload?.items) ? payload.items : []
	)
	const seen = new Set<string>()
	return rawItems.map(buildItem).filter((item) => {
		const key = `${item.id}:${item.caseLabel}`
		if (seen.has(key)) return false
		seen.add(key)
		return item.segment !== "closed" || item.status !== "clean_record"
	})
}

function segmentCount(segment: ExceptionSegment): number {
	return state.items.filter((item) => item.segment === segment).length
}

function ageDays(label: string): number {
	const match = label.match(/\d+/)
	return match ? Number(match[0]) : 0
}

function sortExceptionItems(items: ExceptionItem[]): ExceptionItem[] {
	return [...items].sort((left, right) => {
		const severity: Record<ExceptionSegment, number> = {
			review_overdue: 4,
			missing_data: 3,
			reference_issue: 2,
			needs_review: 1,
			closed: 0,
		}
		const severityDiff = severity[right.segment] - severity[left.segment]
		if (severityDiff !== 0) return severityDiff
		return ageDays(right.ageLabel) - ageDays(left.ageLabel)
	})
}

function renderSegments(): void {
	document.querySelectorAll<HTMLButtonElement>("[data-exceptions-segment]").forEach((button) => {
		const segment = button.dataset.exceptionsSegment as ExceptionSegment
		const active = segment === state.segment
		button.textContent = `${segmentLabels[segment]} (${segmentCount(segment)})`
		button.className = active
			? "rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
			: "rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-white"
	})
}

function renderRows(): void {
	const rows = document.getElementById("financialExceptionsRows")
	const summary = document.getElementById("financialExceptionsSummary")
	if (!rows) return
	const visible = sortExceptionItems(state.items.filter((item) => item.segment === state.segment))
	if (summary) {
		summary.textContent = `${segmentLabels[state.segment]}: ${visible.length} caso${visible.length === 1 ? "" : "s"}. ${segmentHints[state.segment]}`
	}
	if (!visible.length) {
		const emptyMessages: Record<ExceptionSegment, string> = {
			needs_review: "No hay excepciones que requieran revisión.",
			missing_data: "No hay casos con datos faltantes.",
			reference_issue: "No hay referencias inconsistentes visibles.",
			review_overdue: "No hay revisiones desactualizadas.",
			closed: "No hay excepciones cerradas en esta vista.",
		}
		rows.innerHTML = `<div class="px-4 py-10 text-center text-sm text-slate-500">${escapeHtml(emptyMessages[state.segment])}</div>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const passiveState = passiveStateLabel(item.segment)
			const stateKind = passiveStateKind(item.segment)
			return `
			<article class="cursor-pointer px-4 py-4 transition hover:bg-slate-50" data-exception-id="${escapeHtml(item.id)}">
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.95fr)] lg:items-start">
					<div>
						<div class="flex items-center gap-2 text-xs font-semibold text-slate-600">
							<span class="h-2.5 w-2.5 rounded-full ${stateDotClass(stateKind)}" aria-hidden="true"></span>
							<span>${escapeHtml(passiveState)}</span>
						</div>
						<h3 class="mt-2 text-base font-semibold text-slate-950">${escapeHtml(item.caseLabel)}</h3>
						<p class="mt-1 text-sm font-medium text-slate-700">${escapeHtml(booking)}</p>
						<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.whatHappened)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Qué pasa</p>
						<p class="mt-1 text-sm font-semibold leading-6 text-slate-950">${escapeHtml(passiveState)}</p>
						<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(item.impact)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Responsable</p>
						<p class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(item.owner)}</p>
						<p class="mt-1 text-xs text-slate-500">${escapeHtml(item.ageLabel)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Próxima acción</p>
						<p class="mt-1 text-sm font-semibold leading-6 text-slate-900">${escapeHtml(item.nextAction)}</p>
					</div>
				</div>
			</article>`
		})
		.join("")
}

function detailRow(label: string, value: unknown): string {
	return `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">${escapeHtml(label)}</p><p class="mt-2 text-sm leading-6 text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function openDrawer(item: ExceptionItem): void {
	const drawer = document.getElementById("financialExceptionsDrawer")
	const backdrop = document.getElementById("financialExceptionsDrawerBackdrop")
	const body = document.getElementById("financialExceptionsDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	body.innerHTML = `
		<section class="space-y-4">
			<div class="rounded-3xl bg-slate-950 p-5 text-white">
				<p class="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-bold">${escapeHtml(item.caseLabel)}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-300">${escapeHtml(item.impact)}</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				${detailRow("Reserva", bookingDisplayName(item.bookingId, context))}
				${detailRow("Alojamiento", bookingSubtitle(context))}
				${detailRow("Responsable", item.owner)}
				${detailRow("Antigüedad", item.ageLabel)}
				${detailRow("Estado", item.status)}
			</div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Qué ocurrió</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.whatHappened)}</p>
			</div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Próxima acción</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.nextAction)}</p>
			</div>
			<details class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
				<summary class="cursor-pointer text-sm font-semibold text-slate-700">Detalle técnico</summary>
				<pre class="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">${escapeHtml(JSON.stringify(item.raw, null, 2))}</pre>
			</details>
		</section>`
	drawer.classList.remove("translate-x-full")
	backdrop.classList.remove("hidden")
}

function closeDrawer(): void {
	document.getElementById("financialExceptionsDrawer")?.classList.add("translate-x-full")
	document.getElementById("financialExceptionsDrawerBackdrop")?.classList.add("hidden")
}

function wireRows(): void {
	document.querySelectorAll<HTMLElement>("[data-exception-id]").forEach((row) => {
		row.addEventListener("click", () => {
			const id = row.dataset.exceptionId || ""
			const item = state.items.find((candidate) => candidate.id === id)
			if (item) openDrawer(item)
		})
	})
}

function render(): void {
	renderSegments()
	renderRows()
	wireRows()
}

async function load(): Promise<void> {
	try {
		const cachedOperations = getCachedFinancialJson(financialEndpointUrls.operations)
		const cachedExceptions = getCachedFinancialJson(financialEndpointUrls.exceptions)
		if (cachedOperations || cachedExceptions) {
			state.bookingContext = buildBookingContextIndex(cachedOperations)
			state.items = buildItems([
				cachedOperations || { items: [] },
				cachedExceptions || { items: [] },
			])
			render()
			void Promise.all([
				refreshFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
				refreshFinancialJson(financialEndpointUrls.exceptions).catch(() => ({ items: [] })),
			]).then(([operationsPayload, exceptionsPayload]) => {
				state.bookingContext = buildBookingContextIndex(operationsPayload)
				state.items = buildItems([operationsPayload, exceptionsPayload])
				render()
			})
			return
		}
		const [operationsPayload, exceptionsPayload] = await Promise.all([
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
			fetchFinancialJson(financialEndpointUrls.exceptions).catch(() => ({ items: [] })),
		])
		state.bookingContext = buildBookingContextIndex(operationsPayload)
		state.items = buildItems([operationsPayload, exceptionsPayload])
		render()
	} catch {
		const rows = document.getElementById("financialExceptionsRows")
		const summary = document.getElementById("financialExceptionsSummary")
		if (summary) summary.textContent = "No se pudieron cargar las excepciones."
		if (rows) {
			rows.innerHTML = `<div class="px-4 py-8 text-center text-sm text-slate-500">No se pudieron cargar las excepciones financieras.</div>`
		}
	}
}

export function initFinancialExceptionsWorkspace(): void {
	const rows = document.getElementById("financialExceptionsRows")
	if (!rows || rows.dataset.financialExceptionsReady === "true") return
	rows.dataset.financialExceptionsReady = "true"
	document.querySelectorAll<HTMLButtonElement>("[data-exceptions-segment]").forEach((button) => {
		button.addEventListener("click", () => {
			state.segment = button.dataset.exceptionsSegment as ExceptionSegment
			render()
		})
	})
	document.getElementById("financialExceptionsDrawerClose")?.addEventListener("click", closeDrawer)
	document
		.getElementById("financialExceptionsDrawerBackdrop")
		?.addEventListener("click", closeDrawer)
	void load()
}
