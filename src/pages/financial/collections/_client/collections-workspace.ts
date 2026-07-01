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
	maskExternalReference,
	resolveBookingContext,
	statePillClass,
	technicalReference,
	type FinancialHumanContext,
} from "../../_client/financial-human-display"

type CollectionSegment = "requires_proof" | "unmatched" | "duplicate" | "in_review"

type CollectionItem = {
	id: string
	segment: CollectionSegment
	bookingId: string
	amount: number | null
	currency: string
	externalReference: string
	processor: string
	proof: string
	owner: string
	nextAction: string
	title: string
	description: string
	occurredAt?: string | null
	raw: any
}

const state: {
	segment: CollectionSegment
	items: CollectionItem[]
	bookingContext: Map<string, FinancialHumanContext>
} = {
	segment: "requires_proof",
	items: [],
	bookingContext: new Map(),
}

const segmentLabels: Record<CollectionSegment, string> = {
	requires_proof: "Requieren comprobante",
	unmatched: "Sin reserva asociada",
	duplicate: "Referencias duplicadas",
	in_review: "En revisión",
}

const segmentHints: Record<CollectionSegment, string> = {
	requires_proof: "Cobros asociados a reservas donde falta comprobante suficiente.",
	unmatched: "Cobros visibles que todavía no están asociados a una reserva.",
	duplicate: "La misma referencia externa aparece más de una vez.",
	in_review: "Cobros con comprobante visible que requieren revisión humana.",
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

function firstPaymentTransaction(item: any): any | null {
	const transactions = Array.isArray(item?.payment?.transactions) ? item.payment.transactions : []
	return (
		transactions.find((row: any) => String(row?.type || "") === "capture") ||
		transactions[0] ||
		null
	)
}

function paymentReference(item: any): string {
	const payment = firstPaymentTransaction(item)
	if (payment?.externalReference) return String(payment.externalReference)
	const reference = Array.isArray(item?.references)
		? item.references.find((row: any) => String(row?.type || "") === "payment_evidence")
		: null
	return reference?.referenceValue ? String(reference.referenceValue) : "Sin referencia visible"
}

function paymentProcessor(item: any): string {
	return String(firstPaymentTransaction(item)?.pspProvider || "Por identificar")
}

function proofLabel(item: any): string {
	const transactions = Array.isArray(item?.payment?.transactions) ? item.payment.transactions : []
	if (!transactions.length) return "Falta comprobante"
	const capture = transactions.some((row: any) => String(row?.type || "") === "capture")
	return capture ? "Cobro capturado visible" : "Comprobante parcial"
}

function collectionAmount(item: any): number | null {
	if (item?.paymentAmount != null) return Number(item.paymentAmount)
	if (item?.contractAmount != null) return Number(item.contractAmount)
	return null
}

function itemHasReason(item: any, reason: string): boolean {
	return Array.isArray(item?.mismatchReasons) && item.mismatchReasons.includes(reason)
}

function fromReconciliationItems(items: any[]): CollectionItem[] {
	return items.flatMap((item: any) => {
		const base = {
			bookingId: String(item?.bookingId || "Sin reserva"),
			amount: collectionAmount(item),
			currency: String(item?.currency || item?.contract?.currency || "USD"),
			externalReference: paymentReference(item),
			processor: paymentProcessor(item),
			proof: proofLabel(item),
			raw: item,
		}
		const rows: CollectionItem[] = []
		if (item?.status === "missing_payment" || itemHasReason(item, "missing_capture_reference")) {
			rows.push({
				...base,
				id: `requires-proof:${item.bookingId}`,
				segment: "requires_proof",
				owner: "Conciliación",
				nextAction: "Pedir o registrar el comprobante de cobro.",
				title: "Falta comprobante de cobro",
				description:
					"La reserva existe, pero todavía no hay comprobante suficiente para explicar el cobro.",
			})
		}
		if (
			item?.status !== "missing_payment" &&
			(item?.reviewStatus !== "reviewed" || item?.reviewState === "stale") &&
			Array.isArray(item?.payment?.transactions) &&
			item.payment.transactions.length > 0
		) {
			rows.push({
				...base,
				id: `in-review:${item.bookingId}`,
				segment: "in_review",
				owner: "Finanzas",
				nextAction:
					item?.reviewState === "stale"
						? "Revisar los comprobantes nuevos antes de cerrar."
						: "Comparar el cobro visible con la reserva.",
				title: item?.reviewState === "stale" ? "Revisión desactualizada" : "Cobro en revisión",
				description:
					"Hay comprobante visible, pero el caso todavía necesita una decisión operacional.",
			})
		}
		return rows
	})
}

function fromUnmatchedPayments(rows: any[]): CollectionItem[] {
	return rows.map((row: any) => ({
		id: `unmatched:${row.id || row.externalReference}`,
		segment: "unmatched",
		bookingId: "Sin reserva asociada",
		amount: row.amount == null ? null : Number(row.amount),
		currency: String(row.currency || "USD"),
		externalReference: String(row.externalReference || "Sin referencia visible"),
		processor: String(row.pspProvider || "Por identificar"),
		proof: "Cobro visible",
		owner: "Conciliación",
		nextAction: "Asociar a una reserva o documentar por qué queda pendiente.",
		title: "Cobro sin reserva asociada",
		description: "Existe un cobro visible, pero Fastt todavía no puede conectarlo con una reserva.",
		occurredAt: row.occurredAt || null,
		raw: row,
	}))
}

function fromDuplicateReferences(rows: any[]): CollectionItem[] {
	return rows.map((row: any) => ({
		id: `duplicate:${row.pspProvider}:${row.externalReference}`,
		segment: "duplicate",
		bookingId: Array.isArray(row.bookingIds) ? row.bookingIds.join(", ") : "Varias reservas",
		amount: null,
		currency: "USD",
		externalReference: String(row.externalReference || "Sin referencia visible"),
		processor: String(row.pspProvider || "Por identificar"),
		proof: `${Number(row.count || 0)} apariciones`,
		owner: "Conciliación",
		nextAction: "Revisar cuál reserva debe conservar la referencia.",
		title: "Referencia externa duplicada",
		description:
			"La misma referencia aparece en más de un cobro o reserva. Debe revisarse antes de cerrar.",
		raw: row,
	}))
}

function buildItems(payload: any): CollectionItem[] {
	return [
		...fromReconciliationItems(Array.isArray(payload?.items) ? payload.items : []),
		...fromUnmatchedPayments(payload?.unmatchedEvidence?.paymentTransactions || []),
		...fromDuplicateReferences(
			Array.isArray(payload?.duplicateExternalReferences) ? payload.duplicateExternalReferences : []
		),
	]
}

function segmentCount(segment: CollectionSegment): number {
	return state.items.filter((item) => item.segment === segment).length
}

function renderSegments(): void {
	document.querySelectorAll<HTMLButtonElement>("[data-collections-segment]").forEach((button) => {
		const segment = button.dataset.collectionsSegment as CollectionSegment
		const active = segment === state.segment
		button.textContent = `${segmentLabels[segment]} (${segmentCount(segment)})`
		button.className = active
			? "rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
			: "rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500"
	})
}

function renderRows(): void {
	const rows = document.getElementById("collectionsRows")
	const summary = document.getElementById("collectionsSummary")
	if (!rows) return
	const visible = state.items.filter((item) => item.segment === state.segment)
	if (summary) {
		summary.textContent = `${segmentLabels[state.segment]}: ${visible.length} caso${visible.length === 1 ? "" : "s"}. ${segmentHints[state.segment]}`
	}
	if (!visible.length) {
		rows.innerHTML = `<tr><td colspan="5" class="px-3 py-8 text-center text-sm text-slate-500">No hay cobros en este segmento.</td></tr>`
		return
	}
	rows.innerHTML = visible
		.map((item) => {
			const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
			const booking = bookingDisplayName(item.bookingId, context)
			const subtitle = bookingSubtitle(context)
			const reference = maskExternalReference(item.externalReference, item.processor)
			const stateClass = item.proof.includes("Falta")
				? statePillClass("blocked")
				: statePillClass("neutral")
			return `
			<tr class="cursor-pointer border-t border-slate-200 align-top transition hover:bg-slate-50" data-collection-id="${escapeHtml(item.id)}">
				<td class="px-3 py-4">
					<div class="font-semibold text-slate-950">${escapeHtml(booking)}</div>
					<div class="mt-1 text-xs text-slate-500">${escapeHtml(subtitle)}</div>
					<div class="mt-2 text-sm font-medium text-slate-800">${escapeHtml(item.title)}</div>
				</td>
				<td class="px-3 py-4 text-base font-semibold text-slate-950">${escapeHtml(formatMoney(item.amount, item.currency))}</td>
				<td class="px-3 py-4"><span class="rounded-full border px-2 py-1 text-xs font-semibold ${stateClass}">${escapeHtml(item.proof)}</span><div class="mt-2 text-xs text-slate-500">${escapeHtml(reference)}</div></td>
				<td class="px-3 py-4 text-slate-700">${escapeHtml(item.owner)}</td>
				<td class="px-3 py-4 text-xs font-semibold leading-5 text-slate-800">${escapeHtml(item.nextAction)}</td>
			</tr>`
		})
		.join("")
}

function detailRow(label: string, value: unknown): string {
	return `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">${escapeHtml(label)}</p><p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(value || "Por revisar")}</p></div>`
}

function openDrawer(item: CollectionItem): void {
	const drawer = document.getElementById("collectionsDrawer")
	const backdrop = document.getElementById("collectionsDrawerBackdrop")
	const body = document.getElementById("collectionsDrawerBody")
	if (!drawer || !backdrop || !body) return
	const context = resolveBookingContext(item.bookingId, item.raw, state.bookingContext)
	body.innerHTML = `
		<section class="space-y-4">
			<div class="rounded-3xl bg-slate-950 p-5 text-white">
				<p class="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">${escapeHtml(segmentLabels[item.segment])}</p>
				<h2 class="mt-2 text-2xl font-bold">${escapeHtml(item.title)}</h2>
				<p class="mt-3 text-sm leading-6 text-slate-300">${escapeHtml(item.description)}</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				${detailRow("Reserva", bookingDisplayName(item.bookingId, context))}
				${detailRow("Alojamiento", bookingSubtitle(context))}
				${detailRow("Importe", formatMoney(item.amount, item.currency))}
				${detailRow("Referencia", maskExternalReference(item.externalReference, item.processor))}
				${detailRow("Procesador", item.processor)}
				${detailRow("ID interno", "Disponible en detalle técnico")}
				${detailRow("Comprobante", item.proof)}
				${detailRow("Responsable", item.owner)}
			</div>
			<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
				<p class="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Próxima acción</p>
				<p class="mt-2 text-sm font-semibold text-amber-950">${escapeHtml(item.nextAction)}</p>
			</div>
			<details class="rounded-2xl border border-slate-200 bg-white p-4">
				<summary class="cursor-pointer text-sm font-semibold text-slate-700">Detalle técnico</summary>
				<pre class="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">${escapeHtml(JSON.stringify({ ...item.raw, technicalReference: technicalReference(item.externalReference) }, null, 2))}</pre>
			</details>
		</section>`
	backdrop.classList.remove("hidden")
	drawer.classList.remove("translate-x-full")
}

function closeDrawer(): void {
	document.getElementById("collectionsDrawerBackdrop")?.classList.add("hidden")
	document.getElementById("collectionsDrawer")?.classList.add("translate-x-full")
}

async function loadCollections(): Promise<void> {
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
		const rows = document.getElementById("collectionsRows")
		const summary = document.getElementById("collectionsSummary")
		if (summary) summary.textContent = "No se pudo cargar la revisión de cobros."
		if (rows) {
			rows.innerHTML = `<tr><td colspan="5" class="px-3 py-8 text-center text-sm text-rose-700">Intenta recargar la página. No se ejecutó ningún cobro.</td></tr>`
		}
	}
}

export function initCollectionsWorkspace(): void {
	const rows = document.getElementById("collectionsRows")
	if (!rows || rows.dataset.collectionsReady === "true") return
	rows.dataset.collectionsReady = "true"
	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const segmentButton = target.closest("[data-collections-segment]") as HTMLButtonElement | null
		if (segmentButton?.dataset.collectionsSegment) {
			state.segment = segmentButton.dataset.collectionsSegment as CollectionSegment
			renderSegments()
			renderRows()
			return
		}
		const row = target.closest("[data-collection-id]") as HTMLElement | null
		if (row?.dataset.collectionId) {
			const item = state.items.find((entry) => entry.id === row.dataset.collectionId)
			if (item) openDrawer(item)
		}
	})
	document.getElementById("collectionsDrawerClose")?.addEventListener("click", closeDrawer)
	document.getElementById("collectionsDrawerBackdrop")?.addEventListener("click", closeDrawer)
	void loadCollections()
}
