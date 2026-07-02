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
	return `<section class="financial-drawer-section p-5" ${options.muted ? 'data-muted="true"' : ""}>
		<div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">${title}</div>
		<div class="mt-4">${body}</div>
	</section>`
}

function shortOperationalDescription(input: DrawerRenderInput): string {
	const { row } = input.viewModel
	const blocker = String(row.blocker || "").trim()
	if (
		blocker &&
		blocker.toLowerCase() !== "sin acción urgente" &&
		blocker.toLowerCase() !== row.title.toLowerCase()
	) {
		return blocker
	}
	return row.description || "Revisa este caso antes de cerrarlo."
}

function evidenceDotClass(state: string): string {
	const map: Record<string, string> = {
		visible: "bg-emerald-500",
		missing: "bg-amber-500",
		duplicate: "bg-red-500",
		stale: "bg-orange-500",
		waiting_external: "bg-sky-500",
	}
	return map[state] || "bg-slate-400"
}

function referenceTypeLabel(value: unknown): string {
	const labels: Record<string, string> = {
		payment_evidence: "Comprobante de cobro",
		settlement_evidence: "Comprobante externo",
		refund_evidence: "Comprobante de reembolso",
		invoice_reference: "Referencia de documento",
	}
	return labels[String(value || "")] || "Referencia externa"
}

function missingEvidenceGroup(input: DrawerRenderInput): any | null {
	return input.viewModel.evidenceGroups.find((group) => group.state === "missing") || null
}

function recommendedReferenceType(input: DrawerRenderInput): string {
	const missing = missingEvidenceGroup(input)
	if (missing?.key === "settlement") return "settlement_evidence"
	if (missing?.key === "refund") return "refund_evidence"
	return "payment_evidence"
}

function recommendedReferenceLabel(input: DrawerRenderInput): string {
	return referenceTypeLabel(recommendedReferenceType(input))
}

function canConfirmReconciliation(input: DrawerRenderInput): boolean {
	return (
		input.viewModel.reconciliation.paymentAmount != null &&
		input.viewModel.reconciliation.settlementAmount != null
	)
}

function drawerCategoryLabel(category: string): string {
	if (category === "settlements") return "Comparación de importes"
	return operationalCategoryLabels[category] || "Caso financiero"
}

function reviewEventLabel(value: unknown): string {
	const labels: Record<string, string> = {
		exception_acknowledged: "Revisión iniciada",
		exception_resolved: "Caso cerrado",
		exception_dismissed: "Caso descartado",
		reference_added: "Comprobante registrado",
		refund_handoff_acknowledged: "Seguimiento de reembolso iniciado",
		refund_handoff_closed: "Seguimiento de reembolso cerrado",
		refund_handoff_dismissed: "Seguimiento de reembolso descartado",
		reconciliation_reviewed: "Importes revisados",
		reconciliation_review_marked_stale: "La revisión quedó desactualizada",
	}
	return labels[String(value || "")] || "Movimiento registrado"
}

function referenceForEvent(input: DrawerRenderInput, event: any): any | null {
	if (event?.financialReferenceId) {
		const match = input.viewModel.evidenceEntries.find(
			(reference) => reference.id === event.financialReferenceId
		)
		if (match) return match
	}
	const payloadType = String(event?.payloadJson?.referenceType || "")
	if (payloadType) {
		const match = input.viewModel.evidenceEntries.find(
			(reference) => reference.type === payloadType
		)
		if (match) return match
	}
	return null
}

function reviewEventText(input: DrawerRenderInput, event: any): string {
	if (String(event?.type || "") === "reference_added") {
		const reference = referenceForEvent(input, event)
		const referenceLabel = referenceTypeLabel(
			reference?.type || event?.payloadJson?.referenceType
		).toLowerCase()
		const referenceValue = reference?.referenceValue
			? ` ${technicalReference(reference.referenceValue)}`
			: ""
		return `Se registró ${referenceLabel}${referenceValue}`
	}
	return reviewEventLabel(event.type)
}

function renderAttention(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const { viewModel } = input
	const { row } = viewModel
	const item = viewModel.item
	const operation = viewModel.operation
	const bookingLabel = bookingDisplayName(item.bookingId, { operation, ...item })
	const productLabel = bookingSubtitle({ operation, ...item })
	const amountLabel =
		row.amount == null ? "Importe no disponible" : deps.money(row.amountCurrency, row.amount)
	return `<section class="financial-drawer-attention p-5">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700/80">Caso abierto</p>
				<h2 class="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">${deps.escapeHtml(row.title)}</h2>
				<p class="mt-2 max-w-md text-sm leading-6 text-slate-700">${deps.escapeHtml(shortOperationalDescription(input))}</p>
				<p class="mt-3 text-xs leading-5 text-slate-500">${deps.escapeHtml(bookingLabel)} · ${deps.escapeHtml(productLabel)}</p>
			</div>
			<div class="shrink-0 text-right">
				<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">${deps.escapeHtml(row.amountLabel)}</p>
				<p class="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">${deps.escapeHtml(amountLabel)}</p>
			</div>
		</div>
		<div class="mt-4 flex flex-wrap gap-2 text-xs">
			<span class="rounded-full bg-white/70 px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-900/[0.06]">${deps.escapeHtml(drawerCategoryLabel(row.operationalCategory))}</span>
			<span class="rounded-full bg-white/70 px-3 py-1 text-slate-600 ring-1 ring-slate-900/[0.06]">Responsable: ${deps.escapeHtml(row.ownerLabel)}</span>
			<span class="rounded-full bg-white/70 px-3 py-1 text-slate-600 ring-1 ring-slate-900/[0.06]">${deps.escapeHtml(row.ageLabel)}</span>
		</div>
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
		"Contexto",
		`<details class="rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-900/[0.04]">
			<summary class="cursor-pointer text-sm font-semibold text-slate-800">Ver datos de reserva y proveedor</summary>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div><div class="text-xs text-slate-500">Reserva</div><div class="mt-1 text-sm font-semibold text-slate-900">${deps.escapeHtml(bookingLabel)}</div></div>
				<div><div class="text-xs text-slate-500">Proveedor</div><div class="mt-1 text-sm font-semibold text-slate-900">${deps.escapeHtml(providerLabel)}</div></div>
				<div class="sm:col-span-2"><div class="text-xs text-slate-500">Estadía y huésped</div><div class="mt-1 text-sm leading-5 text-slate-700">${deps.escapeHtml(productLabel)}</div></div>
			</div>
		</details>`
	)
}

function referenceTypeForGroup(groupKey: string): string | null {
	const map: Record<string, string> = {
		payment: "payment_evidence",
		settlement: "settlement_evidence",
		refund: "refund_evidence",
	}
	return map[groupKey] || null
}

function referenceSummaryForGroup(
	input: DrawerRenderInput,
	groupKey: string,
	deps: DrawerRenderDeps
): string {
	const referenceType = referenceTypeForGroup(groupKey)
	if (!referenceType) return ""
	const reference = input.viewModel.evidenceEntries.find((entry) => entry.type === referenceType)
	if (!reference) return ""
	const parts = [
		technicalReference(reference.referenceValue),
		reference.amount == null ? "" : deps.money(reference.currency, reference.amount),
		reference.externalSystem || "",
	].filter(Boolean)
	return parts.length ? parts.join(" · ") : ""
}

function renderEvidence(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const groupHtml = input.viewModel.evidenceGroups
		.filter((group) => group.key !== "reference")
		.map((group) => {
			const referenceSummary = referenceSummaryForGroup(input, group.key, deps)
			return `<li class="rounded-2xl bg-slate-50/70 px-4 py-3 ring-1 ring-slate-900/[0.04]">
				<div class="flex items-center justify-between gap-3">
					<div>
						<div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
							<span class="h-2.5 w-2.5 rounded-full ${evidenceDotClass(group.state)}" aria-hidden="true"></span>
							<span>${deps.escapeHtml(group.label)}</span>
						</div>
						<div class="mt-1 text-xs leading-5 text-slate-500">${deps.escapeHtml(referenceSummary || group.description)}</div>
					</div>
					<span class="shrink-0 text-xs font-semibold text-slate-600">${deps.escapeHtml(evidenceStateCopy(group.state))}</span>
				</div>
			</li>`
		})
		.join("")
	const referenceHtml = input.viewModel.evidenceEntries.length
		? `<details class="mt-3 rounded-2xl bg-white/55 p-4 ring-1 ring-slate-900/[0.04]">
				<summary class="cursor-pointer text-xs font-semibold text-slate-500">Ver detalle de referencias</summary>
				<ul class="mt-3 space-y-2">${input.viewModel.evidenceEntries
					.map(
						(reference) => `<li class="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-900/[0.04]">
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
					.join("")}</ul>
			</details>`
		: ""
	return section("Comprobantes", `<ul class="space-y-2">${groupHtml}</ul>${referenceHtml}`)
}

function renderReconciliation(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const reconciliation = input.viewModel.reconciliation
	if (!reconciliation.visible) {
		return section(
			"Comparación de importes",
			`<p class="text-sm text-slate-500">${deps.escapeHtml(reconciliation.explanation)}</p>`
		)
	}
	const canCompare = reconciliation.paymentAmount != null && reconciliation.settlementAmount != null
	const comparisonExplanation =
		reconciliation.paymentAmount != null && reconciliation.settlementAmount == null
			? "El cobro ya está registrado. Falta el comprobante externo para completar la comparación."
			: reconciliation.explanation
	const differenceLabel = canCompare
		? deps.money(reconciliation.currency, reconciliation.differenceAmount)
		: "Disponible cuando registres el comprobante externo"
	const comparisonNote = canCompare
		? reconciliation.providerFinanceBlocker
		: "Todavía no se puede interpretar la diferencia porque falta el comprobante externo."
	const reviewActionHtml = canCompare
		? `<details id="financialReconciliationReview" class="mt-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/[0.04]">
			<summary class="cursor-pointer text-xs font-semibold text-slate-700">Confirmar revisión de importes</summary>
			<label class="mt-3 block text-xs font-semibold text-slate-600" for="reconciliationReviewNote">Nota de revisión</label>
			<textarea id="reconciliationReviewNote" class="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Nota opcional sobre la diferencia encontrada">${deps.escapeHtml(input.viewModel.reconciliationMatch?.reviewNote || "")}</textarea>
			<p class="mt-2 text-xs text-slate-500">Esta acción solo confirma la revisión de los importes; no mueve dinero.</p>
			<button type="button" data-reconciliation-action="review" class="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Confirmar revisión</button>
		</details>`
		: `<div class="mt-3 rounded-2xl bg-amber-50/70 p-4 text-xs leading-5 text-amber-900 ring-1 ring-amber-900/[0.06]">
			<span class="font-semibold">Disponible cuando registres el comprobante externo.</span>
		</div>`
	return section(
		"Comparación de importes",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(comparisonExplanation)}</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/[0.04]"><div class="text-xs text-slate-500">Reserva confirmada</div><div class="mt-1 text-sm font-medium text-slate-900">${deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.contractAmount))}</div></div>
			<div class="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/[0.04]"><div class="text-xs text-slate-500">Cobro registrado</div><div class="mt-1 text-sm font-medium text-slate-900">${reconciliation.paymentAmount == null ? "No visible" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.paymentAmount))}</div></div>
			<div class="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/[0.04]"><div class="text-xs text-slate-500">Comprobante externo</div><div class="mt-1 text-sm font-medium text-slate-900">${reconciliation.settlementAmount == null ? "No visible" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.settlementAmount))}</div></div>
			<div class="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/[0.04]"><div class="text-xs text-slate-500">Diferencia</div><div class="mt-1 text-sm font-medium text-slate-900">${deps.escapeHtml(differenceLabel)}</div></div>
		</div>
		<div class="mt-3 rounded-2xl bg-slate-50/70 p-4 text-xs leading-5 text-slate-500 ring-1 ring-slate-900/[0.04]">${deps.escapeHtml(comparisonNote)}</div>
		${reviewActionHtml}`
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
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Comparación de importes</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.reconciliationDependency)}</div></div>
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
	if (!input.events.length) return ""
	return section(
		"Historial",
		`<ol class="space-y-3">${input.events
			.map(
				(event) => `<li class="border-l border-slate-200 pl-3">
					<div class="text-sm font-semibold text-slate-900">${deps.escapeHtml(reviewEventText(input, event))}</div>
					<div class="text-xs text-slate-500">${deps.escapeHtml(deps.formatDate(event.createdAt))} · Operador</div>
				</li>`
			)
			.join("")}</ol>`
	)
}

function renderActions(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const item = input.viewModel.item
	const missing = missingEvidenceGroup(input)
	const canCompare = canConfirmReconciliation(input)
	const referenceType = recommendedReferenceType(input)
	const referenceLabel = recommendedReferenceLabel(input)
	const option = (value: string, labelText: string): string =>
		`<option value="${value}" ${referenceType === value ? "selected" : ""}>${labelText}</option>`
	const primaryActionHtml = missing
		? `<div id="financialReferenceActions" class="space-y-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<div class="text-base font-semibold tracking-[-0.01em] text-slate-950">Registrar ${deps.escapeHtml(referenceLabel.toLowerCase())}</div>
					<p class="mt-1 max-w-md text-sm leading-6 text-slate-600">Completa el comprobante que falta para seguir revisando este caso.</p>
				</div>
				<button type="button" data-open-panel="financialReferenceModal" aria-label="Registrar comprobante" class="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800">${deps.escapeHtml(`Registrar ${referenceLabel.toLowerCase()}`)}</button>
			</div>
			<p class="rounded-2xl bg-slate-50/70 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-slate-900/[0.04]">La referencia queda disponible para revisión. Esta acción no cierra el caso y no mueve dinero.</p>
		</div>`
		: canCompare
			? `<div class="financial-drawer-soft-card p-4">
				<div class="flex items-start justify-between gap-4">
					<div>
						<div class="text-sm font-semibold text-slate-950">Confirmar revisión de importes</div>
						<p class="mt-1 max-w-md text-xs leading-5 text-slate-500">Los comprobantes necesarios ya están disponibles. Deja una nota si hubo diferencia o contexto operativo.</p>
					</div>
					<button type="button" data-open-panel="financialReconciliationReview" class="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800">Confirmar revisión</button>
				</div>
			</div>`
			: `<div class="financial-drawer-soft-card p-4">
				<div class="text-sm font-semibold text-slate-950">Revisar opciones del caso</div>
				<p class="mt-2 text-xs leading-5 text-slate-500">No hay una acción primaria única. Revisa las opciones secundarias solo si corresponde cerrar, descartar o iniciar revisión.</p>
				<button type="button" data-open-panel="financialSecondaryActions" class="mt-3 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800">Ver opciones</button>
			</div>`
	const referenceModalHtml = missing
		? `<div id="financialReferenceModal" data-financial-floating-panel class="fixed inset-0 z-[100] hidden items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
			<div class="financial-floating-modal-card w-full max-w-[720px] text-slate-900">
				<header class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
					<div>
						<div class="text-lg font-semibold text-slate-950">${deps.escapeHtml(`Registrar ${referenceLabel.toLowerCase()}`)}</div>
						<p class="mt-1 text-sm text-slate-500">Comprobante para revisión operativa</p>
					</div>
					<button type="button" data-close-panel="financialReferenceModal" class="financial-reference-button p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
						<svg aria-hidden="true" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 6 6 18"></path>
							<path d="m6 6 12 12"></path>
						</svg>
					</button>
				</header>
				<div class="p-5">
					<section class="space-y-4">
						<div>
							<h2 class="font-semibold text-slate-950">Datos del comprobante</h2>
							<p class="mt-1 text-sm leading-6 text-slate-500">Copia el identificador que aparece en Stripe, banco o sistema externo. Guardarlo no cierra el caso ni mueve dinero.</p>
						</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Tipo de comprobante</span><select id="financialReferenceType" class="financial-reference-field h-11 w-full bg-white px-3 text-sm text-slate-800">${option("payment_evidence", "Comprobante de cobro")}${option("settlement_evidence", "Comprobante externo")}${option("refund_evidence", "Comprobante de reembolso")}${option("invoice_reference", "Referencia de documento")}</select></label>
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Identificador externo</span><input id="financialReferenceValue" class="financial-reference-field h-11 w-full px-3 text-sm text-slate-800 placeholder:text-slate-400" placeholder="Ej. R2D2, CH_9F2A..." /></label>
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Sistema externo</span><input id="financialReferenceSystem" class="financial-reference-field h-11 w-full px-3 text-sm text-slate-800 placeholder:text-slate-400" placeholder="Stripe, banco, proveedor..." /></label>
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Importe</span><input id="financialReferenceAmount" type="number" step="0.01" class="financial-reference-field h-11 w-full px-3 text-sm text-slate-800 placeholder:text-slate-400" placeholder="Opcional" /></label>
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Moneda</span><input id="financialReferenceCurrency" class="financial-reference-field h-11 w-full px-3 text-sm uppercase text-slate-800 placeholder:text-slate-400" placeholder="USD" maxlength="8" /></label>
						<label class="block space-y-1.5 text-sm"><span class="font-medium">Nota</span><input id="financialReferenceNote" class="financial-reference-field h-11 w-full px-3 text-sm text-slate-800 placeholder:text-slate-400" placeholder="Contexto opcional" /></label>
					</div>
					<div class="financial-reference-soft-box bg-slate-50 p-4 text-sm text-slate-600">
						La referencia queda disponible para comparar importes y revisar el caso. No ejecuta cobros, pagos ni reembolsos.
					</div>
					</section>
				</div>
				<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
					<p class="text-xs leading-5 text-slate-500">Solo registra evidencia para revisión. No ejecuta cobros ni pagos.</p>
					<div class="flex shrink-0 gap-2">
						<button type="button" data-close-panel="financialReferenceModal" class="financial-reference-button h-10 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Cancelar</button>
						<button type="button" data-reference-action="record" class="financial-reference-button h-10 bg-slate-950 px-4 text-sm font-semibold text-white">Guardar comprobante</button>
					</div>
				</footer>
			</div>
		</div>`
		: ""
	return section(
		"Acción recomendada",
		`${primaryActionHtml}${referenceModalHtml}
		<details id="financialSecondaryActions" class="mt-5 border-t border-slate-200/70 pt-4">
			<summary class="cursor-pointer text-sm font-medium text-slate-500 transition hover:text-slate-800">Opciones de cierre y revisión</summary>
			<div class="financial-drawer-secondary-card mt-4 p-4">
				<label class="block text-sm font-semibold text-slate-900" for="financialResolutionNote">Nota de cierre</label>
				<textarea id="financialResolutionNote" class="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500" placeholder="Obligatoria para cerrar o descartar">${deps.escapeHtml(item.resolutionNote || "")}</textarea>
				<p class="mt-2 text-xs leading-5 text-slate-500">Usa estas opciones solo cuando ya revisaste el caso o necesitas dejarlo marcado para seguimiento.</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<button type="button" data-review-action="acknowledge" ${input.canReview ? "" : "disabled"} class="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/[0.06] disabled:cursor-not-allowed disabled:opacity-40">Iniciar revisión</button>
					<button type="button" data-review-action="resolve" ${input.canReview ? "" : "disabled"} class="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-900/[0.08] disabled:cursor-not-allowed disabled:opacity-40">Cerrar caso</button>
					<button type="button" data-review-action="dismiss" ${input.canReview ? "" : "disabled"} class="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-900/[0.06] disabled:cursor-not-allowed disabled:opacity-40">Descartar</button>
				</div>
				${item.persistedId ? "" : '<p class="mt-3 text-xs text-slate-500">Este caso es solo informativo. Las acciones estarán disponibles cuando exista una revisión registrada.</p>'}
			</div>
		</details>`
	)
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
	}
	return `<div class="space-y-5">${input.viewModel.sections
		.map((id) => renderers[id]?.() || "")
		.filter(Boolean)
		.join("")}</div>`
}
