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

type SettlementSegment =
	| "amount_mismatch"
	| "missing_payment"
	| "missing_settlement"
	| "duplicate_reference"
	| "no_difference"

type SettlementItem = {
	id: string
	segment: SettlementSegment
	bookingId: string
	confirmedAmount: number | null
	collectionAmount: number | null
	settlementAmount: number | null
	differenceAmount: number | null
	currency: string
	reviewState: string
	owner: string
	meaning: string
	missing: string
	nextAction: string
	title: string
	description: string
	raw: any
}

const state: {
	segment: SettlementSegment
	items: SettlementItem[]
	bookingContext: Map<string, FinancialHumanContext>
} = {
	segment: "amount_mismatch",
	items: [],
	bookingContext: new Map(),
}

const segmentLabels: Record<SettlementSegment, string> = {
	amount_mismatch: "Montos diferentes",
	missing_payment: "Falta cobro",
	missing_settlement: "Falta liquidación",
	duplicate_reference: "Referencia duplicada",
	no_difference: "Sin diferencia",
}

const segmentHints: Record<SettlementSegment, string> = {
	amount_mismatch: "La reserva, el cobro o la liquidación externa muestran importes distintos.",
	missing_payment: "La reserva existe, pero todavía no hay cobro registrado suficiente.",
	missing_settlement: "Hay reserva o cobro visible, pero falta liquidación externa registrada.",
	duplicate_reference: "Una misma referencia externa aparece asociada a más de una reserva.",
	no_difference: "Los importes visibles cuentan la misma historia operativa.",
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
	if (amount == null || Number.isNaN(Number(amount))) return "No visible"
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

function reviewLabel(item: any): string {
	if (item?.reviewState === "stale") return "Revisar de nuevo"
	if (item?.reviewStatus === "reviewed") return "Revisado"
	return "Pendiente de revisión"
}

function hasReason(item: any, reason: string): boolean {
	return Array.isArray(item?.mismatchReasons) && item.mismatchReasons.includes(reason)
}

function baseItem(
	item: any,
	segment: SettlementSegment
): Omit<SettlementItem, "id" | "meaning" | "missing" | "nextAction" | "title" | "description"> {
	return {
		segment,
		bookingId: String(item?.bookingId || "Sin reserva"),
		confirmedAmount: numeric(item?.contractAmount ?? item?.contract?.amount),
		collectionAmount: numeric(item?.paymentAmount ?? item?.payment?.amount),
		settlementAmount: numeric(item?.settlementAmount ?? item?.settlement?.amount),
		differenceAmount: numeric(item?.differenceAmount),
		currency: String(item?.currency || item?.contract?.currency || "USD"),
		reviewState: reviewLabel(item),
		owner: segment === "no_difference" ? "Finanzas" : "Conciliación",
		raw: item,
	}
}

function makeItem(item: any, segment: SettlementSegment): SettlementItem {
	const base = baseItem(item, segment)
	if (segment === "missing_payment") {
		return {
			...base,
			id: `missing-payment:${item.bookingId}`,
			meaning: "La reserva está confirmada, pero Fastt no ve un cobro registrado suficiente.",
			missing: "Falta comprobar o asociar el cobro de la reserva.",
			nextAction: "Pedir el comprobante de cobro o asociar el cobro visible a la reserva.",
			title: "Falta cobro registrado",
			description: "La comparación no puede avanzar porque el cobro todavía no está claro.",
		}
	}
	if (segment === "missing_settlement") {
		return {
			...base,
			id: `missing-settlement:${item.bookingId}`,
			meaning:
				"Hay reserva o cobro visible, pero no hay liquidación externa registrada para comparar.",
			missing: "Falta registrar la liquidación externa o confirmar por qué todavía no existe.",
			nextAction: "Pedir la referencia externa y registrar la evidencia visible.",
			title: "Falta liquidación externa",
			description: "El caso necesita evidencia externa antes de poder cerrarse operativamente.",
		}
	}
	if (segment === "no_difference") {
		return {
			...base,
			id: `no-difference:${item.bookingId}`,
			meaning: "La reserva, el cobro y la liquidación externa muestran importes compatibles.",
			missing: "No falta evidencia principal para esta comparación.",
			nextAction:
				base.reviewState === "Revisado"
					? "Mantener como referencia."
					: "Revisar y cerrar la observación operativa.",
			title: "Sin diferencia visible",
			description: "Los importes visibles coinciden dentro del margen operacional.",
		}
	}
	return {
		...base,
		id: `amount-mismatch:${item.bookingId}`,
		meaning: "Al menos uno de los importes visibles no coincide con la reserva confirmada.",
		missing: "Falta revisar qué importe explica la diferencia y qué comprobante debe corregirse.",
		nextAction: "Comparar reserva, cobro y liquidación externa antes de cerrar.",
		title: "Montos diferentes",
		description: "La comparación muestra una diferencia que requiere revisión humana.",
	}
}

function duplicateItems(rows: any[]): SettlementItem[] {
	return rows.map((row: any) => ({
		id: `duplicate:${row.pspProvider}:${row.externalReference}`,
		segment: "duplicate_reference",
		bookingId: Array.isArray(row.bookingIds) ? row.bookingIds.join(", ") : "Varias reservas",
		confirmedAmount: null,
		collectionAmount: null,
		settlementAmount: null,
		differenceAmount: null,
		currency: "USD",
		reviewState: "Pendiente de revisión",
		owner: "Conciliación",
		meaning: "La misma referencia externa aparece en más de una reserva o registro.",
		missing: "Falta decidir cuál caso debe conservar esa referencia.",
		nextAction: "Revisar las reservas vinculadas y corregir la asociación visible.",
		title: "Referencia externa duplicada",
		description: "La referencia externa no debe cerrar la revisión hasta aclarar su asociación.",
		raw: row,
	}))
}

function unmatchedSettlementItems(rows: any[]): SettlementItem[] {
	return rows.map((row: any) => ({
		id: `unmatched-settlement:${row.id || row.settlementReference}`,
		segment: "missing_payment",
		bookingId: "Sin reserva asociada",
		confirmedAmount: null,
		collectionAmount: null,
		settlementAmount: numeric(row.amount),
		differenceAmount: null,
		currency: String(row.currency || "USD"),
		reviewState: "Pendiente de revisión",
		owner: "Conciliación",
		meaning: "Existe una liquidación externa visible, pero todavía no está asociada a una reserva.",
		missing: "Falta asociarla a una reserva o documentar por qué queda pendiente.",
		nextAction: "Buscar la reserva correspondiente usando la referencia externa.",
		title: "Liquidación externa sin reserva asociada",
		description: "La evidencia externa existe, pero todavía no explica una reserva específica.",
		raw: row,
	}))
}

function buildItems(payload: any): SettlementItem[] {
	const items = Array.isArray(payload?.items) ? payload.items : []
	const rows = items.map((item: any) => {
		if (item?.status === "missing_payment") return makeItem(item, "missing_payment")
		if (item?.status === "missing_settlement") return makeItem(item, "missing_settlement")
		if (
			item?.status === "mismatch" ||
			item?.status === "currency_mismatch" ||
			hasReason(item, "payment_amount_mismatch") ||
			hasReason(item, "settlement_amount_mismatch")
		) {
			return makeItem(item, "amount_mismatch")
		}
		if (item?.status === "matched") return makeItem(item, "no_difference")
		return makeItem(item, "amount_mismatch")
	})
	return [
		...rows,
		...duplicateItems(
			Array.isArray(payload?.duplicateExternalReferences) ? payload.duplicateExternalReferences : []
		),
		...unmatchedSettlementItems(payload?.unmatchedEvidence?.settlementRecords || []),
	]
}

function segmentCount(segment: SettlementSegment): number {
	return state.items.filter((item) => item.segment === segment).length
}

function sortSettlementItems(items: SettlementItem[]): SettlementItem[] {
	return [...items].sort((left, right) => {
		const leftDifference = Math.abs(Number(left.differenceAmount || 0))
		const rightDifference = Math.abs(Number(right.differenceAmount || 0))
		if (leftDifference !== rightDifference) return rightDifference - leftDifference
		const leftMissing = left.settlementAmount == null || left.collectionAmount == null ? 1 : 0
		const rightMissing = right.settlementAmount == null || right.collectionAmount == null ? 1 : 0
		return rightMissing - leftMissing
	})
}

function renderSegments(): void {
	document.querySelectorAll<HTMLButtonElement>("[data-settlements-segment]").forEach((button) => {
		const segment = button.dataset.settlementsSegment as SettlementSegment
		const active = segment === state.segment
		button.textContent = `${segmentLabels[segment]} (${segmentCount(segment)})`
		button.className = active
			? "rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
			: "rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-white"
	})
}

function renderRows(): void {
	const rows = document.getElementById("settlementsRows")
	const summary = document.getElementById("settlementsSummary")
	if (!rows) return
	const visible = sortSettlementItems(state.items.filter((item) => item.segment === state.segment))
	if (summary) {
		summary.textContent = `${segmentLabels[state.segment]}: ${visible.length} caso${visible.length === 1 ? "" : "s"}. ${segmentHints[state.segment]}`
	}
	if (!visible.length) {
		const emptyMessages: Record<SettlementSegment, string> = {
			amount_mismatch: "No hay diferencias de monto visibles.",
			missing_payment: "No hay reservas con cobro faltante.",
			missing_settlement: "No hay liquidaciones externas faltantes en esta vista.",
			duplicate_reference: "No hay referencias duplicadas visibles.",
			no_difference: "No hay comparaciones sin diferencia en este segmento.",
		}
		rows.innerHTML = `<div class="px-4 py-10 text-center text-sm text-slate-500">${escapeHtml(emptyMessages[state.segment])}</div>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const subtitle = bookingSubtitle(context)
			const diff = formatMoney(item.differenceAmount, item.currency)
			const stateKind: "ready" | "blocked" = item.segment === "no_difference" ? "ready" : "blocked"
			return `
			<article class="cursor-pointer px-4 py-4 transition hover:bg-slate-50" data-settlement-id="${escapeHtml(item.id)}">
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.1fr)_150px_minmax(0,0.9fr)] lg:items-start">
					<div>
						<div class="flex items-center gap-2 text-xs font-semibold text-slate-600">
							<span class="h-2.5 w-2.5 rounded-full ${stateDotClass(stateKind)}" aria-hidden="true"></span>
							<span>${escapeHtml(item.title)}</span>
						</div>
						<h3 class="mt-2 text-base font-semibold text-slate-950">${escapeHtml(booking)}</h3>
						<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(subtitle)}</p>
						<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.description)}</p>
					</div>
					<div class="grid gap-2 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-1">
						<div><span class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Confirmado</span><p class="font-semibold text-slate-950">${escapeHtml(formatMoney(item.confirmedAmount, item.currency))}</p></div>
						<div><span class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Cobro</span><p class="font-semibold text-slate-950">${escapeHtml(formatMoney(item.collectionAmount, item.currency))}</p></div>
						<div><span class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Comprobante externo</span><p class="font-semibold text-slate-950">${escapeHtml(formatMoney(item.settlementAmount, item.currency))}</p></div>
					</div>
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Diferencia</p>
						<p class="mt-1 text-lg font-bold text-slate-950">${escapeHtml(diff)}</p>
						<p class="mt-1 text-xs text-slate-500">${escapeHtml(item.reviewState)}</p>
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

function detailRow(label: string, value: unknown): string {
	return `<div class="fastt-drawer-soft-card p-4"><p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">${escapeHtml(label)}</p><p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function openDrawer(item: SettlementItem): void {
	const drawer = document.getElementById("settlementsDrawer")
	const backdrop = document.getElementById("settlementsDrawerBackdrop")
	const body = document.getElementById("settlementsDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	body.innerHTML = `
		<section class="space-y-4">
			<div class="fastt-drawer-attention p-5">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">${escapeHtml(item.title)}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-700">${escapeHtml(item.description)}</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				${detailRow("Reserva", bookingDisplayName(item.bookingId, context))}
				${detailRow("Alojamiento", bookingSubtitle(context))}
				${detailRow("Reserva confirmada", formatMoney(item.confirmedAmount, item.currency))}
				${detailRow("Cobro registrado", formatMoney(item.collectionAmount, item.currency))}
				${detailRow("Liquidación registrada", formatMoney(item.settlementAmount, item.currency))}
				${detailRow("Diferencia", formatMoney(item.differenceAmount, item.currency))}
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Qué significa</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.meaning)}</p>
			</div>
			<div class="fastt-drawer-section p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Qué falta</p>
				<p class="mt-2 text-sm leading-6 text-slate-700">${escapeHtml(item.missing)}</p>
			</div>
			<div class="fastt-drawer-secondary-card p-4">
				<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Próxima acción</p>
				<p class="mt-2 text-sm font-semibold text-slate-950">${escapeHtml(item.nextAction)}</p>
			</div>
			<details class="fastt-drawer-section p-4">
				<summary class="cursor-pointer text-sm font-semibold text-slate-700">Detalle técnico</summary>
				<pre class="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">${escapeHtml(JSON.stringify(item.raw, null, 2))}</pre>
			</details>
		</section>`
	backdrop.classList.remove("hidden")
	drawer.classList.remove("translate-x-full")
}

function closeDrawer(): void {
	document.getElementById("settlementsDrawerBackdrop")?.classList.add("hidden")
	document.getElementById("settlementsDrawer")?.classList.add("translate-x-full")
}

async function loadSettlements(): Promise<void> {
	try {
		const cached = getCachedFinancialJson(financialEndpointUrls.reconciliationQueue)
		const cachedOperations = getCachedFinancialJson(financialEndpointUrls.operations)
		if (cached) {
			state.bookingContext = buildBookingContextIndex(cachedOperations)
			state.items = buildItems(cached)
			renderSegments()
			renderRows()
			void Promise.all([
				refreshFinancialJson(financialEndpointUrls.reconciliationQueue),
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
			fetchFinancialJson(financialEndpointUrls.reconciliationQueue),
			fetchFinancialJson(financialEndpointUrls.operations).catch(() => ({ items: [] })),
		])
		state.bookingContext = buildBookingContextIndex(operationsPayload)
		state.items = buildItems(payload)
		renderSegments()
		renderRows()
	} catch {
		const rows = document.getElementById("settlementsRows")
		const summary = document.getElementById("settlementsSummary")
		if (summary) summary.textContent = "No se pudo cargar la comparación de liquidaciones."
		if (rows) {
			rows.innerHTML = `<div class="px-4 py-8 text-center text-sm text-rose-700">Intenta recargar la página. No se ejecutó ningún movimiento.</div>`
		}
	}
}

export function initSettlementsWorkspace(): void {
	const rows = document.getElementById("settlementsRows")
	if (!rows || rows.dataset.settlementsReady === "true") return
	rows.dataset.settlementsReady = "true"
	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const segmentButton = target.closest("[data-settlements-segment]") as HTMLButtonElement | null
		if (segmentButton?.dataset.settlementsSegment) {
			state.segment = segmentButton.dataset.settlementsSegment as SettlementSegment
			renderSegments()
			renderRows()
			return
		}
		const row = target.closest("[data-settlement-id]") as HTMLElement | null
		if (row?.dataset.settlementId) {
			const item = state.items.find((entry) => entry.id === row.dataset.settlementId)
			if (item) openDrawer(item)
		}
	})
	document.getElementById("settlementsDrawerClose")?.addEventListener("click", closeDrawer)
	document.getElementById("settlementsDrawerBackdrop")?.addEventListener("click", closeDrawer)
	void loadSettlements()
}
