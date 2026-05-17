import { evidenceStateCopy } from "./financial-evidence-view-model"
import { providerFinanceBlockerLabel } from "./financial-provider-finance-copy"
import type { FinancialDrawerViewModel } from "./financial-drawer-view-model"

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

function renderAttention(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const { viewModel } = input
	const { row } = viewModel
	return `<section class="rounded-xl border border-amber-200 bg-amber-50 p-4">
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Attention summary</p>
				<h2 class="mt-1 text-lg font-semibold text-slate-950">${deps.escapeHtml(row.title)}</h2>
				<p class="mt-2 text-sm leading-6 text-amber-900">${deps.escapeHtml(row.description)}</p>
			</div>
			<span class="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900">${deps.escapeHtml(deps.label(row.queue))}</span>
		</div>
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Owner:</span> ${deps.escapeHtml(row.ownerLabel)}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Aging:</span> ${deps.escapeHtml(row.ageLabel)}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Freshness:</span> ${deps.escapeHtml(deps.label(row.staleState))}</div>
			<div class="rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><span class="font-semibold text-amber-900">Next action:</span> ${deps.escapeHtml(row.nextAction)}</div>
		</div>
		<div class="mt-3 rounded-lg border border-amber-200 bg-white/70 p-2 text-xs text-amber-900"><span class="font-semibold">Primary blocker:</span> ${deps.escapeHtml(row.blocker)}</div>
	</section>`
}

function renderWhy(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	return section(
		"Why this needs review",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(input.viewModel.whyThisNeedsReview)}</p>`
	)
}

function renderContext(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const item = input.viewModel.item
	const operation = input.viewModel.operation
	return section(
		"Operational context",
		`<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Booking id</div><div class="mt-1 break-all font-mono text-xs text-slate-900">${deps.escapeHtml(item.bookingId)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Provider id</div><div class="mt-1 break-all font-mono text-xs text-slate-900">${deps.escapeHtml(item.providerId)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Operational amount</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(operation?.currency || item?.providerFinance?.currency, operation?.contractAmount || item?.providerFinance?.grossAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Product / variant</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(operation?.productName || operation?.variantName || "-")}</div></div>
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
								<div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${deps.escapeHtml(reference.type)}</div>
								<div class="mt-1 font-mono text-xs text-slate-800">${deps.escapeHtml(reference.referenceValue)}</div>
							</div>
							<span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">${reference.isPersisted ? "reference recorded" : "evidence visible"}</span>
						</div>
						<div class="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
							<div>System: ${deps.escapeHtml(reference.externalSystem || "-")}</div>
							<div>Recorded: ${deps.escapeHtml(deps.formatDate(reference.recordedAt))}</div>
							<div>Source: ${deps.escapeHtml(deps.label(reference.source || "shadow visibility"))}</div>
							<div>Amount: ${reference.amount == null ? "-" : deps.escapeHtml(deps.money(reference.currency, reference.amount))}</div>
						</div>
					</li>`
				)
				.join("")}</ul>`
		: '<p class="mt-3 text-sm text-slate-500">No stable reference visible yet.</p>'
	return section("Evidence", `<ul class="space-y-2">${groupHtml}</ul>${referenceHtml}`)
}

function renderReconciliation(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const reconciliation = input.viewModel.reconciliation
	if (!reconciliation.visible) {
		return section(
			"Reconciliation",
			`<p class="text-sm text-slate-500">${deps.escapeHtml(reconciliation.explanation)}</p>`
		)
	}
	return section(
		"Reconciliation",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(reconciliation.explanation)}</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Contract amount</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.contractAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Payment evidence amount</div><div class="mt-1 text-sm text-slate-900">${reconciliation.paymentAmount == null ? "-" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.paymentAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Settlement evidence amount</div><div class="mt-1 text-sm text-slate-900">${reconciliation.settlementAmount == null ? "-" : deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.settlementAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Visible difference</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(reconciliation.currency, reconciliation.differenceAmount))}</div></div>
		</div>
		<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">${deps.escapeHtml(reconciliation.providerFinanceBlocker)}</div>
		<label class="mt-3 block text-xs font-semibold text-slate-600" for="reconciliationReviewNote">Review note</label>
		<textarea id="reconciliationReviewNote" class="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Optional note for this evidence comparison">${deps.escapeHtml(input.viewModel.reconciliationMatch?.reviewNote || "")}</textarea>
		<p class="mt-2 text-xs text-slate-500">Marks this comparison as reviewed only; it does not reconcile funds or move money.</p>
		<button type="button" data-reconciliation-action="review" class="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Mark comparison reviewed</button>`
	)
}

function renderRefund(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const handoff = input.refundHandoff
	const derivedState = input.viewModel.operation?.refund?.state || "not_applicable"
	if (!handoff) {
		return section(
			"Refund handoff",
			`<div class="flex items-start justify-between gap-3">
				<p class="text-sm text-slate-600">Derived visibility: ${deps.escapeHtml(deps.label(derivedState))}</p>
				<span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">derived only</span>
			</div>
			<p class="mt-3 text-xs text-slate-500">No persisted refund handoff is open for this booking. GET views do not create handoffs automatically.</p>`
		)
	}
	return section(
		"Refund handoff",
		`<div class="flex items-start justify-between gap-3">
			<p class="text-sm text-slate-600">Operational handoff visibility only. Review closed does not mean refund execution.</p>
			${deps.handoffStatusChip(handoff.status)}
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Owner</div><div class="mt-1">${deps.ownerChip(handoff.nextOwner)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Age</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.refundHandoffAge(handoff))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Expected amount</div><div class="mt-1 text-sm text-slate-900">${handoff.expectedAmount == null ? "-" : deps.escapeHtml(deps.money(handoff.currency, handoff.expectedAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Refund evidence</div><div class="mt-1 text-sm text-slate-900">${input.refundEvidence.length ? "Refund evidence visible" : "No refund evidence visible"}</div></div>
		</div>
		<label class="mt-3 block text-sm font-semibold text-slate-900" for="refundHandoffNote">Refund handoff note</label>
		<textarea id="refundHandoffNote" class="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Required for close or dismiss">${deps.escapeHtml(handoff.notes || "")}</textarea>
		<p class="mt-2 text-xs text-slate-500">Review closed means operational refund review closed, not refund execution.</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<button type="button" data-refund-handoff-action="acknowledge" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Acknowledge handoff</button>
			<button type="button" data-refund-handoff-action="close" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">Close review</button>
			<button type="button" data-refund-handoff-action="dismiss" ${input.canReviewHandoff ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Dismiss handoff</button>
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
						<div class="mt-1 text-xs leading-5 text-amber-800">${deps.escapeHtml(detail.reason)}</div>
						<div class="mt-2 text-xs font-semibold text-amber-900">Next action: ${deps.escapeHtml(detail.nextOperationalAction)}</div>
					</li>`
				)
				.join("")
		: '<li class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">No blocking reason visible.</li>'
	return section(
		"Provider finance",
		`<p class="text-sm leading-6 text-slate-700">${deps.escapeHtml(copy.blocker)}</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-4">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Gross</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(finance.currency, finance.grossAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Commission</div><div class="mt-1 text-sm text-slate-900">${finance.commissionAmount == null ? "snapshot missing" : deps.escapeHtml(deps.money(finance.currency, finance.commissionAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Tax</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(deps.money(finance.currency, finance.taxAmount))}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Net payable visibility</div><div class="mt-1 text-sm text-slate-900">${finance.netPayable == null ? "snapshot missing" : deps.escapeHtml(deps.money(finance.currency, finance.netPayable))}</div></div>
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Owner</div><div class="mt-1">${deps.ownerChip(finance.operationalOwner || "provider_finance")}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Reconciliation dependency</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.reconciliationDependency)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Statement freshness</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.statementFreshness)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Next operational action</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(copy.nextAction)}</div></div>
		</div>
		<ul class="mt-3 space-y-2">${detailHtml}</ul>
		${copy.freshnessNote ? `<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><span class="font-semibold text-slate-800">Freshness note:</span> ${deps.escapeHtml(copy.freshnessNote)}</div>` : ""}
		<p class="mt-3 text-xs text-slate-500">Visibility only: this does not initiate provider disbursement, create accounting entries, or move funds.</p>`
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
		: "<li>No stale reason visible.</li>"
	return section(
		"Provider statement visibility",
		`<p class="text-sm text-slate-700">Statement draft visibility is a read artifact for operational review. It is not a ledger, invoice, balance, or accounting statement.</p>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Statement draft</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.state)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Freshness</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.freshness)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Included bookings</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.includedBookings)}</div></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs text-slate-500">Excluded bookings</div><div class="mt-1 text-sm text-slate-900">${deps.escapeHtml(statement.excludedBookings)}</div></div>
		</div>
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs font-semibold text-slate-700">Dependencies</div><ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">${dependencyHtml}</ul></div>
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><div class="text-xs font-semibold text-slate-700">Stale reasons</div><ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">${staleHtml}</ul></div>
		</div>
		<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><span class="font-semibold">Next action:</span> ${deps.escapeHtml(statement.nextAction)}</div>`
	)
}

function renderTimeline(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	if (!input.events.length)
		return section(
			"Timeline",
			'<p class="text-sm text-slate-500">No review events recorded yet.</p>'
		)
	return section(
		"Timeline",
		`<ol class="space-y-3">${input.events
			.map(
				(event) => `<li class="border-l border-slate-200 pl-3">
					<div class="text-sm font-semibold text-slate-900">${deps.escapeHtml(deps.label(event.type))}</div>
					<div class="text-xs text-slate-500">${deps.escapeHtml(deps.formatDate(event.createdAt))} · ${deps.escapeHtml(deps.label(event.actorType || "operator"))}</div>
				</li>`
			)
			.join("")}</ol>`
	)
}

function renderActions(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const item = input.viewModel.item
	return section(
		"Actions",
		`<div>
			<div class="text-sm font-semibold text-slate-950">Record evidence</div>
			<p class="mt-1 text-xs text-slate-500">Reference recorded here stays evidence visible for review; it does not close the review automatically.</p>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Type</span><select id="financialReferenceType" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="payment_evidence">Payment evidence</option><option value="refund_evidence">Refund evidence</option><option value="settlement_evidence">Settlement evidence</option><option value="invoice_reference">Invoice reference</option></select></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Reference value</span><input id="financialReferenceValue" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="External reference id" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>External system</span><input id="financialReferenceSystem" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Optional" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Amount</span><input id="financialReferenceAmount" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Optional" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Currency</span><input id="financialReferenceCurrency" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-800" placeholder="USD" maxlength="8" /></label>
				<label class="space-y-1 text-xs font-semibold text-slate-600"><span>Note</span><input id="financialReferenceNote" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" placeholder="Optional review note" /></label>
			</div>
			<button type="button" data-reference-action="record" class="mt-3 rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Record evidence</button>
		</div>
		<div class="mt-4 border-t border-slate-200 pt-4">
			<label class="block text-sm font-semibold text-slate-900" for="financialResolutionNote">Resolution note</label>
			<textarea id="financialResolutionNote" class="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800" placeholder="Required for resolve or dismiss">${deps.escapeHtml(item.resolutionNote || "")}</textarea>
			<p class="mt-2 text-xs text-slate-500">Resolved means operational review closed, not financially matched.</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button type="button" data-review-action="acknowledge" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Acknowledge</button>
				<button type="button" data-review-action="resolve" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">Resolve review</button>
				<button type="button" data-review-action="dismiss" ${input.canReview ? "" : "disabled"} class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Dismiss</button>
			</div>
			${item.persistedId ? "" : '<p class="mt-3 text-xs text-slate-500">Derived-only item: persisted review actions become available after an operator opens a persisted record.</p>'}
		</div>`
	)
}

function renderTechnical(input: DrawerRenderInput, deps: DrawerRenderDeps): string {
	const details = input.viewModel.technicalDetails.length
		? input.viewModel.technicalDetails
				.map((detail) => `<li>${deps.escapeHtml(detail)}</li>`)
				.join("")
		: "<li>No internal detail visible.</li>"
	return `<details class="rounded-xl border border-slate-200 bg-slate-50 p-3">
		<summary class="cursor-pointer text-sm font-semibold text-slate-800">Technical details</summary>
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
