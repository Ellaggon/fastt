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
import { financialSegmentClass, financialUi } from "../../_client/financial-ui-classes"

type RefundSegment =
	| "needs_review"
	| "waiting_response"
	| "missing_proof"
	| "proof_received"
	| "ready_to_close"

type RefundAction = "acknowledge" | "close" | "dismiss"

type RefundItem = {
	id: string
	segment: RefundSegment
	bookingId: string
	reason: string
	refundType: string
	expectedAmount: number | null
	currency: string
	proof: string
	owner: string
	ageLabel: string
	whatHappened: string
	cancellation: string
	policyApplied: string
	history: string[]
	nextAction: string
	notes: string
	status: string
	raw: any
}

const state: {
	segment: RefundSegment
	items: RefundItem[]
	selectedItem: RefundItem | null
	bookingContext: Map<string, FinancialHumanContext>
} = {
	segment: "needs_review",
	items: [],
	selectedItem: null,
	bookingContext: new Map(),
}

const segmentLabels: Record<RefundSegment, string> = {
	needs_review: "Requieren revisión",
	waiting_response: "Esperando respuesta",
	missing_proof: "Comprobante faltante",
	proof_received: "Comprobante recibido",
	ready_to_close: "Listos para cerrar",
}

const segmentHints: Record<RefundSegment, string> = {
	needs_review: "Casos que necesitan una decisión o primer seguimiento.",
	waiting_response: "Casos donde el equipo debe esperar una respuesta externa.",
	missing_proof: "Casos que aún no tienen comprobante de reembolso visible.",
	proof_received: "Casos con comprobante recibido y listos para revisión final.",
	ready_to_close: "Casos revisados o descartados que ya no requieren trabajo diario.",
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

function reasonLabel(reason: unknown): string {
	const labels: Record<string, string> = {
		cancellation: "Cancelación",
		modification: "Modificación",
		goodwill: "Cortesía comercial",
		provider_issue: "Incidencia del proveedor",
		unknown: "Motivo por revisar",
	}
	return labels[String(reason || "unknown")] || "Motivo por revisar"
}

function refundTypeLabel(type: unknown): string {
	const labels: Record<string, string> = {
		full: "Reembolso total",
		partial: "Reembolso parcial",
		unknown: "Tipo por revisar",
	}
	return labels[String(type || "unknown")] || "Tipo por revisar"
}

function ownerLabel(owner: unknown): string {
	const labels: Record<string, string> = {
		financial_operations: "Finanzas",
		external_finance: "Respuesta externa",
		provider_followup: "Seguimiento proveedor",
		support: "Soporte",
		none: "Sin responsable activo",
	}
	return labels[String(owner || "support")] || "Soporte"
}

function proofLabel(status: unknown): string {
	if (status === "evidence_recorded" || status === "closed") return "Comprobante recibido"
	return "Comprobante faltante"
}

function segmentFor(row: any): RefundSegment {
	if (row?.status === "waiting_external") return "waiting_response"
	if (row?.status === "evidence_recorded") return "proof_received"
	if (row?.status === "closed" || row?.status === "dismissed") return "ready_to_close"
	if (proofLabel(row?.status) === "Comprobante faltante") return "missing_proof"
	return "needs_review"
}

function nextActionFor(row: any): string {
	if (row?.status === "required") return "Revisar el caso e iniciar seguimiento si corresponde."
	if (row?.status === "acknowledged") return "Pedir o registrar el comprobante pendiente."
	if (row?.status === "waiting_external")
		return "Esperar respuesta externa y actualizar el caso cuando llegue."
	if (row?.status === "evidence_recorded")
		return "Revisar el comprobante y cerrar la revisión si está claro."
	if (row?.status === "closed") return "Caso cerrado para seguimiento operativo."
	if (row?.status === "dismissed") return "Caso descartado; mantener como referencia."
	return "Revisar el caso y documentar la siguiente acción."
}

function basisLabel(basis: unknown): string {
	const labels: Record<string, string> = {
		booking_cancelled: "Política por cancelación de reserva",
		reservation_modification: "Política por modificación de reserva",
		operator_review: "Revisión manual del operador",
	}
	return labels[String(basis || "operator_review")] || "Revisión manual del operador"
}

function historyFor(row: any): string[] {
	const entries: string[] = []
	if (row?.openedAt)
		entries.push(`Seguimiento creado: ${new Date(row.openedAt).toLocaleDateString("es")}`)
	if (row?.acknowledgedAt)
		entries.push(`Seguimiento iniciado: ${new Date(row.acknowledgedAt).toLocaleDateString("es")}`)
	if (row?.closedAt)
		entries.push(`Revisión cerrada: ${new Date(row.closedAt).toLocaleDateString("es")}`)
	if (!entries.length) entries.push("Sin historial visible todavía.")
	return entries
}

function buildItem(row: any): RefundItem {
	const reason = reasonLabel(row?.reason)
	const type = refundTypeLabel(row?.refundType)
	return {
		id: String(row?.id || crypto.randomUUID()),
		segment: segmentFor(row),
		bookingId: String(row?.bookingId || "Sin reserva"),
		reason,
		refundType: type,
		expectedAmount: numeric(row?.expectedAmount),
		currency: String(row?.currency || "USD"),
		proof: proofLabel(row?.status),
		owner: ownerLabel(row?.nextOwner),
		ageLabel: ageLabel(row?.openedAt),
		whatHappened: `${reason}. El caso requiere seguimiento operativo de ${type.toLowerCase()}.`,
		cancellation:
			row?.reason === "cancellation" ? "Reserva cancelada" : "No es una cancelación directa",
		policyApplied: basisLabel(row?.basis),
		history: historyFor(row),
		nextAction: nextActionFor(row),
		notes: String(row?.notes || ""),
		status: String(row?.status || "required"),
		raw: row,
	}
}

function buildItems(payload: any): RefundItem[] {
	const items = Array.isArray(payload?.items) ? payload.items : []
	return items.map(buildItem)
}

function segmentCount(segment: RefundSegment): number {
	return state.items.filter((item) => item.segment === segment).length
}

function ageDays(label: string): number {
	const match = label.match(/\d+/)
	return match ? Number(match[0]) : 0
}

function sortRefundItems(items: RefundItem[]): RefundItem[] {
	return [...items].sort((left, right) => {
		const leftBlocked = left.proof.includes("faltante") || left.proof.includes("Faltante") ? 1 : 0
		const rightBlocked =
			right.proof.includes("faltante") || right.proof.includes("Faltante") ? 1 : 0
		if (leftBlocked !== rightBlocked) return rightBlocked - leftBlocked
		return ageDays(right.ageLabel) - ageDays(left.ageLabel)
	})
}

function renderSegments(): void {
	document.querySelectorAll<HTMLButtonElement>("[data-refunds-segment]").forEach((button) => {
		const segment = button.dataset.refundsSegment as RefundSegment
		const active = segment === state.segment
		button.textContent = `${segmentLabels[segment]} (${segmentCount(segment)})`
		button.className = financialSegmentClass(active)
	})
}

function renderRows(): void {
	const rows = document.getElementById("refundsRows")
	const summary = document.getElementById("refundsSummary")
	if (!rows) return
	const visible = sortRefundItems(state.items.filter((item) => item.segment === state.segment))
	if (summary) {
		summary.textContent = `${segmentLabels[state.segment]}: ${visible.length} caso${visible.length === 1 ? "" : "s"}. ${segmentHints[state.segment]}`
	}
	if (!visible.length) {
		const emptyMessages: Record<RefundSegment, string> = {
			needs_review: "No hay reembolsos que requieran revisión.",
			waiting_response: "No hay reembolsos esperando respuesta externa.",
			missing_proof: "No hay reembolsos con comprobante faltante.",
			proof_received: "No hay reembolsos con comprobante recibido para revisar.",
			ready_to_close: "No hay reembolsos listos para cerrar.",
		}
		rows.innerHTML = `<div class="${financialUi.emptyState}">${escapeHtml(emptyMessages[state.segment])}</div>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const stateKind: "blocked" | "ready" =
				item.proof.includes("faltante") || item.proof.includes("Faltante") ? "blocked" : "ready"
			return `
			<article class="cursor-pointer px-4 py-4 transition hover:bg-slate-50" data-refund-id="${escapeHtml(item.id)}">
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_160px_minmax(0,0.85fr)_minmax(0,0.95fr)] lg:items-start">
					<div>
						<div class="flex items-center gap-2 text-xs font-semibold text-slate-600">
							<span class="h-2.5 w-2.5 rounded-full ${stateDotClass(stateKind)}" aria-hidden="true"></span>
							<span>${escapeHtml(item.proof)}</span>
						</div>
						<h3 class="mt-2 text-base font-semibold text-slate-950">${escapeHtml(booking)} · ${escapeHtml(item.reason)}</h3>
						<p class="mt-1 text-xs text-slate-500">${escapeHtml(item.refundType)} · ${escapeHtml(item.cancellation)}</p>
						<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.whatHappened)}</p>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Importe esperado</p>
						<p class="mt-1 text-lg font-bold text-slate-950">${escapeHtml(formatMoney(item.expectedAmount, item.currency))}</p>
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
	return `<div class="fastt-drawer-soft-card p-4"><p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">${escapeHtml(label)}</p><p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function canAct(item: RefundItem): boolean {
	return item.status !== "closed" && item.status !== "dismissed"
}

function openDrawer(item: RefundItem): void {
	state.selectedItem = item
	const drawer = document.getElementById("refundsDrawer")
	const backdrop = document.getElementById("refundsDrawerBackdrop")
	const body = document.getElementById("refundsDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	const disabled = canAct(item) ? "" : "disabled"
	body.innerHTML = `
		<section class="space-y-4">
			<div class="fastt-drawer-attention p-5">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">${escapeHtml(item.reason)}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-700">${escapeHtml(item.whatHappened)}</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				${detailRow("Reserva", bookingDisplayName(item.bookingId, context))}
				${detailRow("Alojamiento", bookingSubtitle(context))}
				${detailRow("Cancelación", item.cancellation)}
				${detailRow("Política aplicada", item.policyApplied)}
				${detailRow("Importe", formatMoney(item.expectedAmount, item.currency))}
				${detailRow("Comprobante", item.proof)}
				${detailRow("Responsable", item.owner)}
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Historial</p>
				<ul class="mt-2 space-y-1 text-sm text-slate-700">${item.history.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
			</div>
			<div class="fastt-drawer-secondary-card p-4">
				<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Próxima acción</p>
				<p class="mt-2 text-sm font-semibold text-slate-950">${escapeHtml(item.nextAction)}</p>
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Acciones</p>
				<p class="mt-2 text-sm text-slate-600">Estas acciones solo actualizan la revisión operativa; no ejecutan reembolsos.</p>
				<label class="mt-3 block text-sm font-semibold text-slate-900" for="refundsReviewNote">Nota de seguimiento</label>
				<textarea id="refundsReviewNote" class="${financialUi.reviewTextarea}" placeholder="Obligatoria para cerrar o descartar">${escapeHtml(item.notes)}</textarea>
				<div class="mt-3 flex flex-wrap gap-2">
					<button type="button" data-refund-action="acknowledge" ${disabled} class="${financialUi.buttonSecondarySm}">Iniciar seguimiento</button>
					<button type="button" data-refund-action="close" ${disabled} class="${financialUi.buttonSuccessSm}">Marcar revisión como cerrada</button>
					<button type="button" data-refund-action="dismiss" ${disabled} class="${financialUi.buttonSecondarySm}">Descartar caso</button>
				</div>
				<p id="refundsActionMessage" class="mt-3 text-sm text-slate-500"></p>
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
	document.getElementById("refundsDrawerBackdrop")?.classList.add("hidden")
	document.getElementById("refundsDrawer")?.classList.add("translate-x-full")
	state.selectedItem = null
}

async function submitRefundAction(action: RefundAction): Promise<void> {
	const item = state.selectedItem
	const message = document.getElementById("refundsActionMessage")
	const note =
		(document.getElementById("refundsReviewNote") as HTMLTextAreaElement | null)?.value?.trim() ||
		""
	if (!item) return
	if ((action === "close" || action === "dismiss") && !note) {
		if (message) message.textContent = "Agrega una nota antes de cerrar o descartar."
		return
	}
	if (message) message.textContent = "Guardando revisión..."
	const response = await fetch(
		`/api/internal/financial/refund-handoffs/${encodeURIComponent(item.id)}/${action}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", "accept": "application/json" },
			body: JSON.stringify(action === "acknowledge" ? {} : { resolutionNote: note }),
		}
	)
	if (!response.ok) {
		if (message) message.textContent = "No se pudo guardar la revisión."
		return
	}
	if (message) message.textContent = "Revisión actualizada."
	await loadRefunds({ force: true })
	const updated = state.items.find((entry) => entry.id === item.id)
	if (updated) openDrawer(updated)
}

async function loadRefunds(options: { force?: boolean } = {}): Promise<void> {
	try {
		const cached = options.force
			? null
			: getCachedFinancialJson(financialEndpointUrls.refundHandoffs)
		const cachedOperations = getCachedFinancialJson(financialEndpointUrls.operations)
		if (cached) {
			state.bookingContext = buildBookingContextIndex(cachedOperations)
			state.items = buildItems(cached)
			renderSegments()
			renderRows()
			void Promise.all([
				refreshFinancialJson(financialEndpointUrls.refundHandoffs),
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
			options.force
				? refreshFinancialJson(financialEndpointUrls.refundHandoffs)
				: fetchFinancialJson(financialEndpointUrls.refundHandoffs),
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
		])
		state.bookingContext = buildBookingContextIndex(operationsPayload)
		state.items = buildItems(payload)
		renderSegments()
		renderRows()
	} catch {
		const rows = document.getElementById("refundsRows")
		const summary = document.getElementById("refundsSummary")
		if (summary) summary.textContent = "No se pudo cargar el seguimiento de reembolsos."
		if (rows)
			rows.innerHTML = `<div class="px-4 py-8 text-center text-sm text-rose-700">Intenta recargar la página. No se ejecutó ningún reembolso.</div>`
	}
}

export function initRefundsWorkspace(): void {
	const rows = document.getElementById("refundsRows")
	if (!rows || rows.dataset.refundsReady === "true") return
	rows.dataset.refundsReady = "true"
	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const segmentButton = target.closest("[data-refunds-segment]") as HTMLButtonElement | null
		if (segmentButton?.dataset.refundsSegment) {
			state.segment = segmentButton.dataset.refundsSegment as RefundSegment
			renderSegments()
			renderRows()
			return
		}
		const row = target.closest("[data-refund-id]") as HTMLElement | null
		if (row?.dataset.refundId) {
			const item = state.items.find((entry) => entry.id === row.dataset.refundId)
			if (item) openDrawer(item)
			return
		}
		const actionButton = target.closest("[data-refund-action]") as HTMLButtonElement | null
		if (actionButton?.dataset.refundAction) {
			void submitRefundAction(actionButton.dataset.refundAction as RefundAction)
		}
	})
	document.getElementById("refundsDrawerClose")?.addEventListener("click", closeDrawer)
	document.getElementById("refundsDrawerBackdrop")?.addEventListener("click", closeDrawer)
	void loadRefunds()
}
