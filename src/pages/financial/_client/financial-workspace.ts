// @ts-nocheck
import {
	handoffStatusLabels,
	overlaySourceLabels,
	ownerLabels,
	reconciliationStatusLabels,
	statusLabels,
} from "./financial-labels"
import { primarySummaryQueues } from "./financial-queues"
import { buildFinancialDrawerViewModel } from "./financial-drawer-view-model"
import { renderFinancialDrawerContent } from "./financial-drawer-sections"
import {
	buildDuplicateReferenceWorkItem,
	buildFinancialRowViewModel,
	buildUnmatchedEvidenceWorkItem,
} from "./financial-row-view-model"
;(function () {
	const queueFilter = document.getElementById("financialQueueFilter")
	const stateFilter = document.getElementById("financialStateFilter")
	const summary = document.getElementById("financialSummary")
	const rows = document.getElementById("financialRows")
	const listSummary = document.getElementById("financialListSummary")
	const drawer = document.getElementById("financialReviewDrawer")
	const drawerBackdrop = document.getElementById("financialReviewBackdrop")
	const drawerBody = document.getElementById("financialReviewDrawerBody")
	const drawerClose = document.getElementById("financialReviewDrawerClose")
	let operationsItems = []
	let workflowItems = []
	let reviewEvents = []
	let persistedReferences = []
	let persistedRefundHandoffs = []
	let reconciliationItems = []
	let providerFinanceItems = []
	let duplicateExternalReferences = []
	let unmatchedFinancialEvidence = { paymentTransactions: [], settlementRecords: [] }
	let combinedItems = []
	let selectedItem = null
	const reviewTerminalStatuses = new Set(["resolved", "dismissed"])
	const refundHandoffTerminalStatuses = new Set(["closed", "dismissed"])
	const money = (currency, value) => `${String(currency || "USD")} ${Number(value || 0).toFixed(2)}`
	const label = (value) =>
		String(value ?? "")
			.trim()
			.replaceAll("_", " ") || "-"
	const labelFrom = (map, value, fallback = "-") => {
		const key = String(value ?? "").trim()
		return map[key] || label(key || fallback)
	}
	const escapeHtml = (value) =>
		String(value ?? "")
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;")
	const ageDays = (value) => {
		if (!value) return null
		const date = new Date(String(value))
		if (Number.isNaN(date.getTime())) return null
		return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
	}
	const formatDate = (value) => {
		if (!value) return "-"
		const date = new Date(String(value))
		if (Number.isNaN(date.getTime())) return "-"
		return date.toISOString().slice(0, 10)
	}
	const statusLabel = (status) => {
		return labelFrom(statusLabels, status || "open")
	}
	const ownerLabel = (owner) => {
		return labelFrom(ownerLabels, owner || "none")
	}
	const statusClass = (status) => {
		const map = {
			open: "border-amber-200 bg-amber-50 text-amber-800",
			acknowledged: "border-blue-200 bg-blue-50 text-blue-800",
			waiting_external: "border-sky-200 bg-sky-50 text-sky-800",
			resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
			dismissed: "border-slate-200 bg-slate-50 text-slate-600",
		}
		return map[String(status || "open")] || "border-slate-200 bg-white text-slate-700"
	}
	const statusChip = (status) =>
		`<span class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`
	const ownerChip = (owner) =>
		`<span class="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">${escapeHtml(ownerLabel(owner))}</span>`
	const handoffStatusLabel = (status) => {
		return labelFrom(handoffStatusLabels, status || "required")
	}
	const handoffStatusClass = (status) => {
		const map = {
			required: "border-amber-200 bg-amber-50 text-amber-800",
			acknowledged: "border-blue-200 bg-blue-50 text-blue-800",
			waiting_external: "border-sky-200 bg-sky-50 text-sky-800",
			evidence_recorded: "border-emerald-200 bg-emerald-50 text-emerald-800",
			closed: "border-slate-200 bg-slate-50 text-slate-700",
			dismissed: "border-slate-200 bg-slate-50 text-slate-600",
		}
		return map[String(status || "required")] || "border-slate-200 bg-white text-slate-700"
	}
	const handoffStatusChip = (status) =>
		`<span class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${handoffStatusClass(status)}">${escapeHtml(handoffStatusLabel(status))}</span>`
	const exceptionCodes = (item) =>
		Array.isArray(item?.operation?.operationalException?.all)
			? item.operation.operationalException.all.map((entry) => String(entry?.code || ""))
			: []
	const hasAnyCode = (item, codes) =>
		String(item?.code || "")
			? codes.includes(String(item.code))
			: exceptionCodes(item).some((code) => codes.includes(code))
	const isCleanRecord = (item) =>
		!item?.workflow && !item?.operation?.operationalException?.hasOpenException
	const sourceLabel = (item) => {
		const source = String(item?.overlaySource || "")
		return overlaySourceLabels[source] || (item?.workflow ? "persisted" : "visibility only")
	}
	const itemKey = (item) =>
		String(item?.id || `${item?.bookingId || ""}::${item?.code || "clean_record"}`)
	const handoffTerminal = (handoff) =>
		refundHandoffTerminalStatuses.has(String(handoff?.status || ""))

	function operationalAge(item) {
		const opened = item?.openedAt || item?.workflow?.openedAt
		const openedAge = ageDays(opened)
		if (openedAge != null) return `${statusLabel(item?.status)} ${openedAge}d`
		const confirmedAge = ageDays(item?.operation?.confirmedAt)
		if (confirmedAge != null) return `booking confirmed ${confirmedAge}d ago`
		return "age unavailable"
	}

	function refundHandoffsFor(item) {
		return persistedRefundHandoffs.filter((handoff) => handoff.bookingId === item.bookingId)
	}

	function refundHandoffFor(item) {
		const handoffs = refundHandoffsFor(item)
		return handoffs.find((handoff) => !handoffTerminal(handoff)) || handoffs[0] || null
	}

	function refundHandoffAge(handoff) {
		const openedAge = ageDays(handoff?.openedAt)
		if (openedAge == null) return "age unavailable"
		return `${handoffStatusLabel(handoff.status)} ${openedAge}d`
	}

	function refundHandoffDerivedSuppressed(item) {
		const handoff = refundHandoffFor(item)
		return (
			String(item?.code || "") === "refund_handoff_required" && handoff && handoffTerminal(handoff)
		)
	}

	function reconciliationFor(item) {
		return reconciliationItems.find((entry) => entry.bookingId === item.bookingId) || null
	}

	function rowViewFor(item) {
		return buildFinancialRowViewModel({
			item,
			reconciliation: reconciliationFor(item),
			referenceCounts: referenceCounts(item),
			ageLabel: operationalAge(item),
			sourceKind: sourceLabel(item),
		})
	}

	function queueMatches(item, queue) {
		const row = rowViewFor(item)
		if (queue === "advanced_all" || queue === "all") return true
		if (queue === "needs_review" || queue === "all_open")
			return !reviewTerminalStatuses.has(String(item?.status || "open")) && !isCleanRecord(item)
		if (queue === "resolved_history") return row.queue === "resolved_history"
		if (queue === "refund_handoffs" || queue === "refund_handoff_required")
			return row.queue === "refund_handoffs"
		if (queue === "provider_finance" || queue === "provider_finance_review")
			return row.queue === "provider_finance"
		if (queue === "reconciliation_issues") return row.queue === "reconciliation_issues"
		if (queue === "evidence_issues") return row.queue === "evidence_issues"
		if (queue === "waiting_external") return row.queue === "waiting_external"
		if (queue === "clean_records") return isCleanRecord(item)
		if (queue === "missing_references") {
			return hasAnyCode(item, [
				"missing_payment_reference",
				"missing_settlement_reference",
				"missing_refund_reference",
			])
		}
		if (queue === "snapshot_gaps") {
			return hasAnyCode(item, ["incomplete_contract_snapshot", "legacy_snapshot_compatibility"])
		}
		return hasAnyCode(item, [queue])
	}

	function applyFilters(items) {
		const queue = String(queueFilter?.value || "needs_review")
		const state = String(stateFilter?.value || "all")
		return items.filter((item) => {
			if (refundHandoffDerivedSuppressed(item)) return false
			const stateMatches =
				state === "all" ||
				Boolean(item?.providerFinance) ||
				item?.operation?.evidenceAlignment?.state === state
			return stateMatches && queueMatches(item, queue)
		})
	}

	function countQueue(items, queue) {
		return items.filter((item) => queueMatches(item, queue)).length
	}

	function mergeItems() {
		const operationByBooking = new Map(
			operationsItems.map((item) => [String(item.bookingId), item])
		)
		const merged = workflowItems.map((workflow) => ({
			...workflow,
			workflow,
			operation: operationByBooking.get(String(workflow.bookingId)) || null,
		}))
		const workflowKeys = new Set(merged.map(itemKey))
		for (const operation of operationsItems) {
			const exceptions = operation?.operationalException?.all || []
			if (exceptions.length) {
				for (const issue of exceptions) {
					if (
						issue.code === "refund_handoff_required" &&
						persistedRefundHandoffs.some(
							(handoff) => handoff.bookingId === issue.bookingId && handoffTerminal(handoff)
						)
					) {
						continue
					}
					const candidate = {
						...issue,
						id: `operation:${issue.bookingId}:${issue.code}`,
						status: "open",
						overlaySource: "derived_only",
						persistedId: null,
						openedAt: null,
						operation,
						workflow: null,
					}
					if (!workflowKeys.has(itemKey(candidate))) merged.push(candidate)
				}
			} else {
				const candidate = {
					id: `clean:${operation.bookingId}`,
					bookingId: operation.bookingId,
					providerId: operation?.providerId || "",
					code: "clean_record",
					severity: "review",
					status: "open",
					basis: "contract_snapshot",
					reason: "Financial evidence is visible with no open review exception.",
					nextOwner: "none",
					overlaySource: "visibility_only",
					persistedId: null,
					openedAt: null,
					operation,
					workflow: null,
				}
				merged.push(candidate)
			}
		}
		for (const financeItem of providerFinanceItems) {
			if (!Array.isArray(financeItem?.queues) || !financeItem.queues.length) continue
			const operation = operationByBooking.get(String(financeItem.bookingId)) || {
				bookingId: financeItem.bookingId,
				providerId: financeItem.providerId,
				currency: financeItem.currency,
				contractTotal: financeItem.grossAmount,
				contract: {
					productName: "Provider finance",
					variantName: "Payable visibility",
					version: "snapshot",
				},
				evidenceAlignment: { state: "snapshot_ready" },
				taxFeeVisibility: { lines: 0 },
				snapshotIntegrity: {
					hasRoomSnapshots: true,
					hasTaxFeeSnapshots: true,
					multiRoomAllocationCount: financeItem?.contract?.roomSnapshotCount || 0,
				},
				transactions: { financialEvidence: {}, references: {} },
				refund: { state: "not_applicable" },
			}
			merged.push({
				id: `provider-finance:${financeItem.bookingId}`,
				bookingId: financeItem.bookingId,
				providerId: financeItem.providerId,
				code: "provider_finance_review",
				severity: "review",
				status: "open",
				basis: "provider_finance_snapshot_visibility",
				reason:
					(financeItem.blockingDetails || [])
						.map((detail) => detail.reason)
						.filter(Boolean)
						.join(" ") || "Provider finance visibility needs operational review.",
				nextOwner: financeItem.operationalOwner || "provider_finance",
				overlaySource: "visibility_only",
				persistedId: null,
				openedAt: null,
				operation,
				workflow: null,
				providerFinance: financeItem,
			})
		}
		for (const signal of duplicateExternalReferences) {
			const issue = buildDuplicateReferenceWorkItem(signal)
			issue.operation = operationByBooking.get(String(issue.bookingId)) || {
				bookingId: issue.bookingId,
				providerId: issue.providerId,
				currency: "",
				contractTotal: null,
				contract: { productName: "Evidence issue", variantName: "Duplicate reference" },
				evidenceAlignment: { state: "evidence_partial" },
				snapshotIntegrity: { hasRoomSnapshots: true, hasTaxFeeSnapshots: true },
				taxFeeVisibility: { lines: 0 },
				transactions: { financialEvidence: {}, references: {} },
				refund: { state: "not_applicable" },
			}
			merged.push(issue)
		}
		for (const row of unmatchedFinancialEvidence?.paymentTransactions || []) {
			const issue = buildUnmatchedEvidenceWorkItem("payment", row)
			issue.operation = {
				bookingId: issue.bookingId,
				providerId: issue.providerId,
				currency: row.currency,
				contractTotal: row.amount,
				contract: { productName: "Evidence issue", variantName: "Unmatched payment" },
				evidenceAlignment: { state: "evidence_partial" },
				snapshotIntegrity: { hasRoomSnapshots: true, hasTaxFeeSnapshots: true },
				taxFeeVisibility: { lines: 0 },
				transactions: {
					financialEvidence: { paymentIntentShadow: "evidence_visible" },
					references: {},
				},
				refund: { state: "not_applicable" },
			}
			merged.push(issue)
		}
		for (const row of unmatchedFinancialEvidence?.settlementRecords || []) {
			const issue = buildUnmatchedEvidenceWorkItem("settlement", row)
			issue.operation = {
				bookingId: issue.bookingId,
				providerId: issue.providerId,
				currency: row.currency,
				contractTotal: row.amount,
				contract: { productName: "Evidence issue", variantName: "Unmatched settlement" },
				evidenceAlignment: { state: "evidence_partial" },
				snapshotIntegrity: { hasRoomSnapshots: true, hasTaxFeeSnapshots: true },
				taxFeeVisibility: { lines: 0 },
				transactions: {
					financialEvidence: { paymentIntentShadow: "evidence_visible" },
					references: {},
				},
				refund: { state: "not_applicable" },
			}
			merged.push(issue)
		}
		combinedItems = merged
	}

	function renderSummary(items) {
		if (!summary) return
		const metrics = primarySummaryQueues.map((metric) => ({
			...metric,
			value: countQueue(items, metric.queue),
		}))
		summary.innerHTML = metrics
			.map(
				(
					metric
				) => `<button type="button" data-queue="${metric.queue}" class="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-white">
					<span class="text-slate-950">${metric.value}</span>
					<span class="ml-1">${metric.label}</span>
				</button>`
			)
			.join("")
		summary.querySelectorAll("[data-queue]").forEach((button) => {
			button.addEventListener("click", () => {
				if (queueFilter)
					queueFilter.value = String(button.getAttribute("data-queue") || "needs_review")
				renderFinancialView()
			})
		})
	}

	function renderRows(items) {
		if (!rows) return
		rows.innerHTML = ""
		if (!Array.isArray(items) || !items.length) {
			rows.innerHTML =
				'<tr><td colspan="6" class="px-3 py-8 text-center text-slate-500">No items match this queue. Change filters to inspect clean or historical records.</td></tr>'
			return
		}
		for (const item of items) {
			const operation = item.operation || {}
			const tr = document.createElement("tr")
			tr.className = "border-t border-slate-200 align-top hover:bg-white"
			const counts = referenceCounts(item)
			const rowView = rowViewFor(item)
			const handoff = refundHandoffFor(item)
			const ownerMarkup =
				handoff && hasAnyCode(item, ["refund_handoff_required"])
					? `${ownerChip(handoff.nextOwner)}<div class="mt-2 text-xs text-slate-500">${escapeHtml(refundHandoffAge(handoff))}</div>`
					: `${ownerChip(rowView.owner)}<div class="mt-2 text-xs text-slate-500">${escapeHtml(rowView.ageLabel)}</div>`
			tr.innerHTML = `
				<td class="px-3 py-3 text-slate-700">
					<div class="font-medium ${item.code === "clean_record" ? "text-emerald-700" : "text-slate-950"}">${escapeHtml(rowView.title)}</div>
					<div class="mt-1 max-w-xs text-xs leading-5 text-slate-500">${escapeHtml(rowView.description)}</div>
					<div class="mt-2 flex flex-wrap gap-1">
						${statusChip(item.status)}
						${handoff ? handoffStatusChip(handoff.status) : ""}
						<span class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">${escapeHtml(rowView.sourceKind)}</span>
					</div>
				</td>
				<td class="px-3 py-3 text-slate-700">
					${
						item.bookingId
							? `<a class="font-medium text-slate-950 hover:text-blue-700" href="/booking/${encodeURIComponent(String(item.bookingId || ""))}">${escapeHtml(item.bookingId || "-")}</a>`
							: `<div class="font-medium text-slate-950">Unmatched evidence</div>`
					}
					<div class="mt-1 text-xs text-slate-500">${escapeHtml(operation?.contract?.productName || "Property")} · ${escapeHtml(operation?.contract?.variantName || "Allocation")}</div>
					<div class="mt-1 text-xs text-slate-500">${escapeHtml(money(operation.currency, operation.contractTotal))} · ${escapeHtml(operation?.contract?.version || "snapshot")}</div>
				</td>
				<td class="px-3 py-3 text-slate-700">
					<div class="flex flex-wrap gap-1">${ownerMarkup}</div>
				</td>
				<td class="px-3 py-3 text-slate-700">
					<div>${escapeHtml(label(operation?.transactions?.financialEvidence?.paymentIntentShadow || rowView.staleState || "not_visible"))}</div>
					<div class="mt-1 text-xs text-slate-500">${escapeHtml(rowView.evidenceSummary)}</div>
					<div class="mt-1 text-xs text-slate-500">reference recorded / evidence visible</div>
				</td>
				<td class="px-3 py-3 text-slate-700">
					<div class="max-w-xs text-sm text-slate-900">${escapeHtml(rowView.blocker)}</div>
					<div class="mt-1 text-xs text-slate-500">Snapshot integrity: ${Number(operation?.taxFeeVisibility?.lines || 0)} tax/fee line(s) · Rooms: ${Number(operation?.snapshotIntegrity?.multiRoomAllocationCount || 0)} · ${operation?.snapshotIntegrity?.hasRoomSnapshots ? "Room snapshot ok" : "Room snapshot gap"} · ${operation?.snapshotIntegrity?.hasTaxFeeSnapshots ? "Tax snapshot ok" : "Tax snapshot gap"}</div>
				</td>
				<td class="px-3 py-3 text-right">
					<div class="mb-2 max-w-48 text-right text-xs leading-5 text-slate-500">${escapeHtml(rowView.nextAction)}</div>
					<button type="button" data-review-key="${escapeHtml(itemKey(item))}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Open review</button>
				</td>`
			rows.appendChild(tr)
		}
		rows.querySelectorAll("[data-review-key]").forEach((button) => {
			button.addEventListener("click", () => {
				const key = String(button.getAttribute("data-review-key") || "")
				const item = combinedItems.find((entry) => itemKey(entry) === key)
				if (item) openDrawer(item)
			})
		})
	}

	function eventsFor(item) {
		return reviewEvents.filter((event) => {
			if (item.persistedId && event.financialExceptionId === item.persistedId) return true
			return event.bookingId === item.bookingId
		})
	}

	function referencesFor(item) {
		return persistedReferences.filter((reference) => reference.bookingId === item.bookingId)
	}

	function shadowEvidenceEntries(item) {
		const refs = item?.operation?.transactions?.references || {}
		return [
			...(refs.payment || []).map((value) => ({
				type: "payment_evidence",
				referenceValue: value,
				source: "shadow visibility",
			})),
			...(refs.settlement || []).map((value) => ({
				type: "settlement_evidence",
				referenceValue: value,
				source: "shadow visibility",
			})),
			...(refs.refund || []).map((value) => ({
				type: "refund_evidence",
				referenceValue: value,
				source: "shadow visibility",
			})),
		]
	}

	function referenceCounts(item) {
		const entries = [...referencesFor(item), ...shadowEvidenceEntries(item)]
		return {
			payment: entries.filter((entry) => entry.type === "payment_evidence").length,
			settlement: entries.filter((entry) => entry.type === "settlement_evidence").length,
			refund: entries.filter((entry) => entry.type === "refund_evidence").length,
			invoice: entries.filter((entry) => entry.type === "invoice_reference").length,
		}
	}

	function openDrawer(item) {
		selectedItem = item
		const canReview = Boolean(item.persistedId) && !reviewTerminalStatuses.has(String(item.status))
		const handoff = refundHandoffFor(item)
		const refundEvidence = referencesFor(item).filter(
			(reference) => reference.type === "refund_evidence"
		)
		const evidenceEntries = [
			...referencesFor(item).map((reference) => ({ ...reference, isPersisted: true })),
			...shadowEvidenceEntries(item).map((reference) => ({ ...reference, isPersisted: false })),
		]
		const match = reconciliationFor(item)
		const duplicateSignals = duplicateExternalReferences.filter((signal) =>
			(signal.bookingIds || []).includes(item.bookingId)
		)
		const rowView = rowViewFor(item)
		const drawerView = buildFinancialDrawerViewModel({
			row: rowView,
			reconciliationMatch: match,
			evidenceEntries,
			duplicateSignals,
		})
		if (drawerBody) {
			drawerBody.innerHTML = renderFinancialDrawerContent(
				{
					viewModel: drawerView,
					refundHandoff: handoff,
					refundEvidence,
					events: eventsFor(item),
					canReview,
					canReviewHandoff: Boolean(handoff) && !handoffTerminal(handoff),
				},
				{
					escapeHtml,
					money,
					label,
					formatDate,
					statusChip,
					ownerChip,
					handoffStatusChip,
					handoffStatusLabel,
					operationalAge,
					refundHandoffAge,
				}
			)
			drawerBody.querySelectorAll("[data-review-action]").forEach((button) => {
				button.addEventListener(
					"click",
					() => void submitReviewAction(String(button.getAttribute("data-review-action") || ""))
				)
			})
			drawerBody.querySelectorAll("[data-reference-action]").forEach((button) => {
				button.addEventListener("click", () => void submitReference())
			})
			drawerBody.querySelectorAll("[data-refund-handoff-action]").forEach((button) => {
				button.addEventListener(
					"click",
					() =>
						void submitRefundHandoffAction(
							String(button.getAttribute("data-refund-handoff-action") || "")
						)
				)
			})
			drawerBody.querySelectorAll("[data-reconciliation-action]").forEach((button) => {
				button.addEventListener("click", () => void submitReconciliationReview())
			})
		}
		drawer?.classList.remove("translate-x-full")
		drawerBackdrop?.classList.remove("hidden")
	}

	function closeDrawer() {
		selectedItem = null
		drawer?.classList.add("translate-x-full")
		drawerBackdrop?.classList.add("hidden")
	}

	async function submitReviewAction(action) {
		if (!selectedItem?.persistedId) return
		const note = String(document.getElementById("financialResolutionNote")?.value || "").trim()
		const endpoint = `/api/internal/financial/exceptions/${encodeURIComponent(selectedItem.persistedId)}/${action}`
		const body = action === "acknowledge" ? {} : { resolutionNote: note }
		if (action !== "acknowledge" && !note) {
			alert("Resolution note is required.")
			return
		}
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json", "accept": "application/json" },
			body: JSON.stringify(body),
		})
		if (!response.ok) {
			alert("Review action could not be saved.")
			return
		}
		await fetchWorkspace()
		const refreshed = combinedItems.find((entry) => itemKey(entry) === itemKey(selectedItem))
		if (refreshed) openDrawer(refreshed)
		else closeDrawer()
	}

	async function submitReference() {
		if (!selectedItem?.bookingId) return
		const type = String(document.getElementById("financialReferenceType")?.value || "").trim()
		const referenceValue = String(
			document.getElementById("financialReferenceValue")?.value || ""
		).trim()
		const externalSystem =
			String(document.getElementById("financialReferenceSystem")?.value || "").trim() || null
		const amountInput = String(
			document.getElementById("financialReferenceAmount")?.value || ""
		).trim()
		const currency =
			String(document.getElementById("financialReferenceCurrency")?.value || "")
				.trim()
				.toUpperCase() || null
		const note = String(document.getElementById("financialReferenceNote")?.value || "").trim()
		if (!referenceValue) {
			alert("Reference value is required.")
			return
		}
		const amount = amountInput ? Number(amountInput) : null
		if (amountInput && !Number.isFinite(amount)) {
			alert("Amount must be numeric when provided.")
			return
		}
		const response = await fetch("/api/internal/financial/references", {
			method: "POST",
			headers: { "Content-Type": "application/json", "accept": "application/json" },
			body: JSON.stringify({
				bookingId: selectedItem.bookingId,
				type,
				referenceValue,
				externalSystem,
				amount,
				currency,
				note,
				linkedExceptionId: selectedItem.persistedId || null,
				source: "operator_entry",
				basis: "external_reference",
			}),
		})
		if (!response.ok) {
			alert("Reference could not be recorded.")
			return
		}
		alert("Reference recorded. Evidence visible for review.")
		await fetchWorkspace()
		const refreshed = combinedItems.find((entry) => itemKey(entry) === itemKey(selectedItem))
		if (refreshed) openDrawer(refreshed)
		else closeDrawer()
	}

	async function submitRefundHandoffAction(action) {
		const handoff = refundHandoffFor(selectedItem)
		if (!handoff?.id) return
		const note = String(document.getElementById("refundHandoffNote")?.value || "").trim()
		if (action !== "acknowledge" && !note) {
			alert("Refund handoff note is required.")
			return
		}
		const response = await fetch(
			`/api/internal/financial/refund-handoffs/${encodeURIComponent(handoff.id)}/${action}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "accept": "application/json" },
				body: JSON.stringify(action === "acknowledge" ? {} : { resolutionNote: note }),
			}
		)
		if (!response.ok) {
			alert("Refund handoff review could not be saved.")
			return
		}
		await fetchWorkspace()
		const refreshed = combinedItems.find((entry) => itemKey(entry) === itemKey(selectedItem))
		if (refreshed) openDrawer(refreshed)
		else closeDrawer()
	}

	async function submitReconciliationReview() {
		if (!selectedItem?.bookingId) return
		const reviewNote = String(
			document.getElementById("reconciliationReviewNote")?.value || ""
		).trim()
		const response = await fetch("/api/internal/financial/reconciliation-matches/review", {
			method: "POST",
			headers: { "Content-Type": "application/json", "accept": "application/json" },
			body: JSON.stringify({
				bookingId: selectedItem.bookingId,
				reviewNote: reviewNote || null,
			}),
		})
		if (!response.ok) {
			alert("Reconciliation review marker could not be saved.")
			return
		}
		await fetchWorkspace()
		const refreshed = combinedItems.find((entry) => itemKey(entry) === itemKey(selectedItem))
		if (refreshed) openDrawer(refreshed)
		else closeDrawer()
	}

	function renderFinancialView() {
		mergeItems()
		const filteredItems = applyFilters(combinedItems)
		renderSummary(combinedItems)
		renderRows(filteredItems)
		if (listSummary) {
			const openCount = countQueue(combinedItems, "needs_review")
			const shownCount = filteredItems.length
			listSummary.textContent = `${openCount} open review item(s). Showing ${shownCount} queue item(s).`
		}
	}

	async function fetchWorkspace() {
		async function readWorkspaceJson(response, fallback) {
			if (response.ok) return response.json()
			if (response.status === 404) return fallback
			throw new Error("financial_workspace_load_failed")
		}
		const [
			operationsResponse,
			exceptionsResponse,
			eventsResponse,
			referencesResponse,
			handoffsResponse,
			reconciliationResponse,
			providerFinanceResponse,
		] = await Promise.all([
			fetch("/api/internal/financial/operations", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/exceptions?status=all&limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/review-events?limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/references?limit=500", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/refund-handoffs?status=all&limit=500", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/reconciliation-queue?limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/provider-finance", {
				headers: { accept: "application/json" },
			}),
		])
		const emptyPayload = { items: [], degraded: true }
		const operationsPayload = await readWorkspaceJson(operationsResponse, emptyPayload)
		const exceptionsPayload = await readWorkspaceJson(exceptionsResponse, emptyPayload)
		const eventsPayload = await readWorkspaceJson(eventsResponse, emptyPayload)
		const referencesPayload = await readWorkspaceJson(referencesResponse, emptyPayload)
		const handoffsPayload = await readWorkspaceJson(handoffsResponse, emptyPayload)
		const reconciliationPayload = await readWorkspaceJson(reconciliationResponse, emptyPayload)
		const providerFinancePayload = await readWorkspaceJson(providerFinanceResponse, emptyPayload)
		operationsItems = Array.isArray(operationsPayload?.items) ? operationsPayload.items : []
		workflowItems = Array.isArray(exceptionsPayload?.items) ? exceptionsPayload.items : []
		reviewEvents = Array.isArray(eventsPayload?.items) ? eventsPayload.items : []
		persistedReferences = Array.isArray(referencesPayload?.items) ? referencesPayload.items : []
		persistedRefundHandoffs = Array.isArray(handoffsPayload?.items) ? handoffsPayload.items : []
		reconciliationItems = Array.isArray(reconciliationPayload?.items)
			? reconciliationPayload.items
			: []
		duplicateExternalReferences = Array.isArray(reconciliationPayload?.duplicateExternalReferences)
			? reconciliationPayload.duplicateExternalReferences
			: []
		unmatchedFinancialEvidence =
			reconciliationPayload?.unmatchedEvidence &&
			typeof reconciliationPayload.unmatchedEvidence === "object"
				? reconciliationPayload.unmatchedEvidence
				: { paymentTransactions: [], settlementRecords: [] }
		providerFinanceItems = Array.isArray(providerFinancePayload?.items)
			? providerFinancePayload.items
			: []
		renderFinancialView()
	}

	async function fetchOperations() {
		try {
			await fetchWorkspace()
		} catch {
			operationsItems = []
			workflowItems = []
			reviewEvents = []
			persistedReferences = []
			persistedRefundHandoffs = []
			reconciliationItems = []
			providerFinanceItems = []
			duplicateExternalReferences = []
			unmatchedFinancialEvidence = { paymentTransactions: [], settlementRecords: [] }
			combinedItems = []
			renderSummary([])
			renderRows([])
			if (listSummary) listSummary.textContent = "No se pudo cargar financial operations."
		}
	}

	queueFilter?.addEventListener("change", renderFinancialView)
	stateFilter?.addEventListener("change", renderFinancialView)
	drawerClose?.addEventListener("click", closeDrawer)
	drawerBackdrop?.addEventListener("click", closeDrawer)
	void fetchOperations()
})()
