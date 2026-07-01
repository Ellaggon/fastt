import { evidenceStateCopy } from "./financial-evidence-view-model"
import { operationalCategoryLabels } from "./financial-labels"
import {
	providerFinanceBlockerAction,
	providerFinanceBlockerLabel,
	providerFinanceBlockerReason,
} from "./financial-provider-finance-copy"
import type { FinancialDrawerViewModel } from "./financial-drawer-view-model"
import {
	bookingDisplayName,
	bookingSubtitle,
	providerDisplayName,
	technicalReference,
} from "./financial-human-display"

type DrawerRenderDeps = {
	escapeHtml: (value: unknown) => string
	money: (currency: unknown, value: unknown) => string
	label: (value: unknown) => string
	formatDate: (value: unknown) => string
	statusChip: (status: unknown) => string
	ownerChip: (owner: unknown) => string
	handoffStatusChip: (status: unknown) => string
	handoffStatusLabel: (status: unknown) => string
	operationalAge: (item: any) => string
	refundHandoffAge: (handoff: any) => string
}

type DrawerRenderInput = {
	viewModel: FinancialDrawerViewModel
	refundHandoff: any
	refundEvidence: any[]
	events: any[]
	canReview: boolean
	canReviewHandoff: boolean
}

function section(title: string, body: string, options: { muted?: boolean } = {}): string {
	const background = options.muted ? "bg-slate-50" : "bg-white"
	return `<section class="rounded-xl border border-slate-200 ${background} p-3">
		<div class="text-sm font-semibold text-slate-950">${title}</div>
		<div class="mt-3">${body}</div>
	</section>`
}

function humanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Información actualizada"
	if (state === "stale") return "La información cambió; revisar otra vez"
	if (state === "waiting_external") return "Esperando respuesta"
	if (state === "not_visible") return "Todavía no disponible"
	if (state === "unknown") return "Por confirmar"
	if (state === "snapshot_ready" || state === "evidence_matched") return "Información suficiente"
	if (state === "evidence_partial") return "Faltan comprobantes"
	if (state === "evidence_unknown") return "Comprobantes por confirmar"
	if (state === "handoff_pending") return "Esperando seguimiento"
	if (state === "evidence_visible" || state === "visible") return "Comprobante disponible"
	return "Por confirmar"
}

function referenceTypeLabel(value: unknown): string {
	const labels: Record<string, string> = {
		payment_evidence: "Comprobante de cobro",
		settlement_evidence: "Comprobante de liquidación",
		refund_evidence: "Comprobante de reembolso",
		invoice_reference: "Referencia de documento",
	}
	return labels[String(value || "")] || "Referencia externa"
}

function reviewEventLabel(value: unknown): string {
	const labels: Record<string, string> = {
		exception_acknowledged: "Revisión iniciada",
		exception_resolved: "Caso cerrado",
		exception_dismissed: "Caso descartado",
		reference_recorded: "Comprobante registrado",
		refund_handoff_acknowledged: "Seguimiento de reembolso iniciado",
		refund_handoff_closed: "Seguimiento de reembolso cerrado",
		refund_handoff_dismissed: "Seguimiento de reembolso descartado",
		reconciliation_reviewed: "Importes revisados",
		reconciliation_review_marked_stale: "La revisión quedó desactualizada",
	}
	return labels[String(value || "")] || "Actualización del caso"
}

function renderAttention(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const { viewModel } = input
	const { row } = viewModel
	return `<section class="rounded-xl border border-amber-200 bg-amber-50 p-4">
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Resumen</p>
				<h2 class="mt-1 text-lg font-semibold text-slate-950">${deps.escapeHtml(row.title)}</h2>
				<p class="mt-2 text-sm leading-6 text-amber-900">${deps.escapeHtml(row.description)}</p>
			</div>
			<span class="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900">${deps.escapeHtml(operationalCategoryLabels[row.operationalCategory] || "Caso financiero")}</span>
		</div>
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Responsable:</span> ${deps.escapeHtml(row.ownerLabel)}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Antigüedad:</span> ${deps.escapeHtml(row.ageLabel)}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Estado de la información:</span> ${deps.escapeHtml(humanFreshness(row.staleState))}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Próxima acción:</span> ${deps.escapeHtml(row.nextAction)}</div>
		</div>
		<div class="mt-3 rounded-lg border border-amber-200 bg-white/70 p-2 text-xs text-amber-900"><span class="font-semibold">Qué impide avanzar:</span> ${deps.escapeHtml(row.blocker)}</div>
	</section>`
}

function renderWhy(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	return section(
		"Por qué requiere atención",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(input.viewModel.whyThisNeedsReview)}</p>`
	)
}

function renderContext(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const item = input.viewModel.item
	const operation = input.viewModel.operation
	const bookingLabel = bookingDisplayName(item.bookingId, { operation, ...item })
	const providerLabel = providerDisplayName(item.providerId, { operation, ...item })
	const productLabel = bookingSubtitle({ operation, ...item })
	return section(
		"Contexto operativo",
		`<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Reserva</div><div class="mt-1 text-sm font-semibold text-slate-900">${deps.escapeHtml(bookingLabel)}</div><div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(productLabel)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Proveedor</div><div class="mt-1 text-sm font-semibold text-slate-900">${deps.escapeHtml(providerLabel)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">${deps.escapeHtml(input.viewModel.row.amountLabel)}</div><div class="mt-1 text-sm font-semibold text-slate-900">${input.viewModel.row.amount == null ? "No disponible" : deps.escapeHtml(deps.money(input.viewModel.row.amountCurrency, input.viewModel.row.amount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Identificadores internos</div><div class="mt-1 text-xs text-slate-500">Disponibles en detalle técnico.</div></div>
		</div>`
	)
}

function renderEvidence(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const groupHtml = input.viewModel.evidenceGroups
		.map(
			(group) => `<li class="rounded-lg border border-slate-200 bg-slate-50 p-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<div class="text-sm font-semibold text-slate-900">${deps.escapeHtml(group.label)}</div>
						<div class="mt-1 text-xs leading-5 text-slate-600">${deps.escapeHtml(group.description)}</div>
					</div>
					<span class="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">${deps.escapeHtml(evidenceStateCopy(group.state))}</span>
				</div>
			</li>`
		)
		.join("")
	const referenceHtml = input.viewModel.evidenceEntries.length
		? `<ul class="mt-3 space-y-2">${input.viewModel.evidenceEntries
				.map(
					(reference) => `<li class="rounded-lg border border-slate-200 bg-white p-3">
						<div class="flex items-start justify-between gap-3">
							<div>
								<div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${deps.escapeHtml(referenceTypeLabel(reference.type))}</div>
								<div class="mt-1 font-mono text-xs text-slate-800">${deps.escapeHtml(technicalReference(reference.referenceValue))}</div>
							</div>
							<span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">${reference.isPersisted ? "referencia registrada" : "comprobante visible"}</span>
						</div>
						<div class="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
							<div>Sistema externo: ${deps.escapeHtml(reference.externalSystem || "-")}</div>
							<div>Registrado: ${deps.escapeHtml(deps.formatDate(reference.recordedAt))}</div>
							<div>Importe: ${reference.amount == null ? "-" : deps.escapeHtml(deps.money(reference.currency, reference.amount))}</div>
						</div>
					</li>`
				)
				.join("")}</ul>`
		: '<p class="mt-3 text-sm text-slate-500">Todavía no hay una referencia externa estable.</p>'
	return section(
		"Comprobantes y referencias externas",
		`<ul class="space-y-2">${groupHtml}</ul>${referenceHtml}`
	)
}

function renderReconciliation(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const reconciliation = input.viewModel.reconciliation
	if (!reconciliation.visible) {
		return section(
			"Revisión de importes",
			`<p class="text-sm text-slate-500">${deps.escapeHtml(reconciliation.explanation)}</p>`
		)
	}
	return section(
		"Revisión de importes",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(reconciliation.explanation)}</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Importe confirmado de la reserva</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.contractAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Cobro registrado</div><div class="mt-1 text-sm text-slate-900">${reconciliation.paymentAmount == null ? "-" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.paymentAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Liquidación registrada</div><div class="mt-1 text-sm text-slate-900">${reconciliation.settlementAmount == null ? "-" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.settlementAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Diferencia visible</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.differenceAmount))}</div></div>
		</div>
		<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">${deps.escapeHtml(reconciliation.providerFinanceBlocker)}</div>
		<label class="mt-3 block text-xs font-semibold text-slate-600" for="reconciliationReviewNote">Nota de revisión</label>
		<textarea id="reconciliationReviewNote" class="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Nota opcional sobre la diferencia encontrada">${deps.escapeHtml(input.viewModel.reconciliationMatch?.reviewNote || "")}</textarea>
		<p class="mt-2 text-xs text-slate-500">Esta acción solo confirma la revisión de los importes; no mueve dinero.</p>
		<button type="button" data-reconciliation-action="review" class="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Confirmar revisión</button>`
	)
}

function renderRefund(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const handoff = input.refundHandoff
	if (!handoff) {
		return section(
			"Seguimiento de reembolso",
			`<div class="flex items-start justify-between gap-3">
				<p class="text-sm text-slate-600">No hay un seguimiento operativo abierto para este reembolso.</p>
			</div>
			<p class="mt-3 text-xs text-slate-500">La información calculada está disponible en el detalle técnico. Esta vista no crea seguimientos automáticamente.</p>`
		)
	}
	return section(
		"Seguimiento de reembolso",
		`<div class="flex items-start justify-between gap-3">
			<p class="text-sm text-slate-600">Este caso permite revisar y documentar el seguimiento. Cerrar la revisión no ejecuta un reembolso.</p>
			${deps.handoffStatusChip(handoff.status)}
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Responsable</div><div class="mt-1">${deps.ownerChip(handoff.nextOwner)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Antigüedad</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.refundHandoffAge(handoff))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Importe esperado</div><div class="mt-1 text-sm text-slate-900">${handoff.expectedAmount == null ? "-" : deps.escapeHtml(deps.money(handoff.currency, handoff.expectedAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Comprobante</div><div class="mt-1 text-sm text-slate-900">${input.refundEvidence.length ? "Comprobante disponible" : "Comprobante faltante"}</div></div>
		</div>
		<label class="mt-3 block text-sm font-semibold text-slate-900" for="refundHandoffNote">Nota de seguimiento</label>
		<textarea id="refundHandoffNote" class="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Obligatoria para cerrar o descartar">${deps.escapeHtml(handoff.notes || "")}</textarea>
		<p class="mt-2 text-xs text-slate-500">Cerrar este caso finaliza la revisión operativa, no ejecuta el reembolso.</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<button type="button" data-refund-handoff-action="acknowledge" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Iniciar seguimiento</button>
			<button type="button" data-refund-handoff-action="close" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">Cerrar revisión</button>
			<button type="button" data-refund-handoff-action="dismiss" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Descartar caso</button>
		</div>`
	)
}

function renderProviderFinance(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const finance = input.viewModel.item?.providerFinance
	const copy = input.viewModel.providerFinance
	if (!finance || !copy) return ""
	const details = Array.isArray(finance.blockingDetails) ? finance.blockingDetails : []
	const detailHtml = details.length
		? details
				.map(
					(detail: any) => `<li class="rounded-lg border border-amber-200 bg-amber-50 p-3">
						<div class="text-sm font-semibold text-amber-900">${deps.escapeHtml(providerFinanceBlockerLabel(detail))}</div>
						<div class="mt-1 text-xs leading-5 text-amber-800">${deps.escapeHtml(providerFinanceBlockerReason(detail))}</div>
						<div class="mt-2 text-xs font-semibold text-amber-900">Próxima acción: ${deps.escapeHtml(providerFinanceBlockerAction(detail))}</div>
					</li>`
				)
				.join("")
		: '<li class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">No hay bloqueos visibles.</li>'
	return section(
		"Pago pendiente al proveedor",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(copy.blocker)}</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Importe bruto</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(finance.currency, finance.grossAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Comisión</div><div class="mt-1 text-sm text-slate-900">${finance.commissionAmount == null ? "Información faltante" : deps.escapeHtml(deps.money(finance.currency, finance.commissionAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Impuestos</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(finance.currency, finance.taxAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Pendiente al proveedor</div><div class="mt-1 text-sm font-semibold text-slate-900">${finance.netPayable == null ? "Información faltante" : deps.escapeHtml(deps.money(finance.currency, finance.netPayable))}</div></div>
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Responsable</div><div class="mt-1">${deps.ownerChip(finance.operationalOwner || "provider_finance")}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Revisión de importes</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.reconciliationDependency)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Resumen del proveedor</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.statementFreshness)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Próxima acción</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.nextAction)}</div></div>
		</div>
		<ul class="mt-3 space-y-2">${detailHtml}</ul>
		${copy.freshnessNote ? `<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><span class="font-semibold text-slate-800">Por qué debe revisarse otra vez:</span> ${deps.escapeHtml(copy.freshnessNote)}</div>` : ""}
		<p class="mt-3 text-xs text-slate-500">Esta pantalla solo informa y permite revisar. No envía pagos ni mueve dinero.</p>`
	)
}

function renderStatement(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const statement = input.viewModel.statement
	if (!statement.visible) return ""
	const dependencyHtml = statement.dependencies
		.map((dependency) => `<li>${deps.escapeHtml(dependency)}</li>`)
		.join("")
	const staleHtml = statement.staleReasons.length
		? statement.staleReasons.map((reason) => `<li>${deps.escapeHtml(reason)}</li>`).join("")
		: "<li>No hay motivos visibles para revisar otra vez.</li>"
	return section(
		"Resumen del proveedor",
		`<p class="text-sm text-slate-700">Este resumen agrupa información operativa para revisión. No confirma ni ejecuta pagos.</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Estado</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.state)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Vigencia de la información</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.freshness)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Reservas incluidas</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.includedBookings)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Reservas excluidas</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.excludedBookings)}</div></div>
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs font-semibold text-slate-700">Qué debe estar listo</div><ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">${dependencyHtml}</ul></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs font-semibold text-slate-700">Por qué requiere otra revisión</div><ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">${staleHtml}</ul></div>
		</div>
		<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><span class="font-semibold">Próxima acción:</span> ${deps.escapeHtml(statement.nextAction)}</div>`
	)
}

function renderTimeline(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	if (!input.events.length)
		return section(
			"Historial",
			'<p class="text-sm text-slate-500">Todavía no hay movimientos de revisión registrados.</p>'
		)
	return section(
		"Historial",
		`<ol class="space-y-3">${input.events
			.map(
				(event) => `<li class="border-l border-slate-200 pl-3">
					<div class="text-sm font-semibold text-slate-900">${deps.escapeHtml(reviewEventLabel(event.type))}</div>
					<div class="text-xs text-slate-500">${deps.escapeHtml(deps.formatDate(event.createdAt))} · Operador</div>
				</li>`
			)
			.join("")}</ol>`
	)
}

function renderActions(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const item = input.viewModel.item
	return section(
		"Acciones",
		`<div>
			<div class="text-sm font-semibold text-slate-950">Registrar comprobante</div>
			<p class="mt-1 text-xs text-slate-500">La referencia quedará disponible para revisión y no cerrará el caso automáticamente.</p>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Tipo</span><select id="financialReferenceType" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="payment_evidence">Comprobante de cobro</option><option value="refund_evidence">Comprobante de reembolso</option><option value="settlement_evidence">Comprobante de liquidación</option><option value="invoice_reference">Referencia de documento</option></select></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Referencia externa</span><input id="financialReferenceValue" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Identificador de la referencia" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Sistema externo</span><input id="financialReferenceSystem" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Opcional" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Importe</span><input id="financialReferenceAmount" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Opcional" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Moneda</span><input id="financialReferenceCurrency" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-800" placeholder="USD" maxlength="8" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Nota</span><input id="financialReferenceNote" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Contexto opcional para la revisión" /></label>
			</div>
			<button type="button" data-reference-action="record" class="mt-3 rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Registrar comprobante</button>
		</div>
		<div class="mt-4 border-t border-slate-200 pt-4">
			<label class="block text-sm font-semibold text-slate-900" for="financialResolutionNote">Nota de cierre</label>
			<textarea id="financialResolutionNote" class="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Obligatoria para cerrar o descartar">${deps.escapeHtml(item.resolutionNote || "")}</textarea>
			<p class="mt-2 text-xs text-slate-500">Cerrar finaliza la revisión operativa; no confirma movimientos de dinero.</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button type="button" data-review-action="acknowledge" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Iniciar revisión</button>
				<button type="button" data-review-action="resolve" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">Cerrar caso</button>
				<button type="button" data-review-action="dismiss" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Descartar</button>
			</div>
			${item.persistedId ? "" : '<p class="mt-3 text-xs text-slate-500">Este caso es solo informativo. Las acciones estarán disponibles cuando exista una revisión registrada.</p>'}
		</div>`
	)
}

function renderTechnical(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const details = input.viewModel.technicalDetails.length
		? input.viewModel.technicalDetails
				.map((detail) => `<li>${deps.escapeHtml(detail)}</li>`)
				.join("")
		: "<li>No hay detalle interno disponible.</li>"
	return `<details class="rounded-xl border border-slate-200 bg-slate-50 p-3">
		<summary class="cursor-pointer text-sm font-semibold text-slate-800">Detalle técnico</summary>
		<ul class="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-600">${details}</ul>
	</details>`
}

export function renderFinancialDrawerContent(
	input: DrawerRenderInput,
	deps: DrawerRenderDeps
): string {
	const renderers: Record<string, () => string> = {
		attention: () => renderAttention(input, deps),
		why: () => renderWhy(input, deps),
		context: () => renderContext(input, deps),
		evidence: () => renderEvidence(input, deps),
		reconciliation: () => renderReconciliation(input, deps),
		refund: () => renderRefund(input, deps),
		provider_finance: () => renderProviderFinance(input, deps),
		statement: () => renderStatement(input, deps),
		timeline: () => renderTimeline(input, deps),
		actions: () => renderActions(input, deps),
		technical: () => renderTechnical(input, deps),
	}
	return `<div class="space-y-5">${input.viewModel.sections
		.map((id) => renderers[id]?.() || "")
		.filter(Boolean)
		.join("")}</div>`
}
