import { filterFinancialRows } from "@/pages/financial/_client/financial-filters"
import { renderFinancialRowHtml } from "@/pages/financial/_client/financial-renderers"
import {
	buildFinancialRowViewModel,
	type FinancialRowViewModel,
} from "@/pages/financial/_client/financial-row-view-model"

type OperationalCase = {
	id: string
	persona: "new_operator" | "financial_ops" | "reconciliation_ops" | "provider_ops" | "support"
	urgency: "high" | "medium" | "low"
	expectedQueue:
		| "needs_action_today"
		| "waiting_external"
		| "blocked"
		| "ready_to_close"
		| "recently_closed"
	expectedHumanSignal: string
	item: any
	reconciliation?: any
	referenceCounts?: Record<string, number>
}

const now = new Date("2026-05-18T12:00:00.000Z")
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()

function operation(params: {
	bookingId: string
	providerId: string
	contractTotal?: number
	state?: string
	references?: Record<string, string[]>
	hasOpenException?: boolean
	codes?: string[]
}) {
	return {
		bookingId: params.bookingId,
		providerId: params.providerId,
		confirmedAt: daysAgo(12),
		currency: "USD",
		contractTotal: params.contractTotal ?? 320,
		contract: {
			productName: "Casa Ladera",
			variantName: "Two-night stay",
			version: "contract-v4",
		},
		evidenceAlignment: { state: params.state ?? "evidence_partial" },
		operationalException: {
			hasOpenException: Boolean(params.hasOpenException),
			all: (params.codes || []).map((code) => ({
				code,
				bookingId: params.bookingId,
				providerId: params.providerId,
			})),
		},
		snapshotIntegrity: {
			hasRoomSnapshots: true,
			hasTaxFeeSnapshots: true,
			multiRoomAllocationCount: 1,
		},
		transactions: {
			financialEvidence: {},
			references: params.references || {},
		},
		refund: { state: "not_applicable" },
	}
}

function reviewItem(params: {
	id: string
	bookingId: string
	providerId: string
	code?: string
	status?: string
	nextOwner?: string
	reason?: string
	openedDaysAgo?: number
	operation: any
	persisted?: boolean
}) {
	return {
		id: params.id,
		persistedId: params.persisted ? params.id : null,
		bookingId: params.bookingId,
		providerId: params.providerId,
		code: params.code,
		status: params.status || "open",
		nextOwner: params.nextOwner || "financial_operations",
		reason: params.reason,
		openedAt: daysAgo(params.openedDaysAgo ?? 3),
		overlaySource: params.persisted ? "persisted_overlay" : "derived_only",
		operation: params.operation,
		workflow: params.persisted ? { openedAt: daysAgo(params.openedDaysAgo ?? 3) } : null,
	}
}

function providerFinanceItem(params: {
	bookingId: string
	providerId: string
	owner?: string
	blockingDetails?: any[]
	statementState?: string
	readyForPayable?: boolean
}) {
	return {
		id: `provider-finance:${params.bookingId}`,
		bookingId: params.bookingId,
		providerId: params.providerId,
		code: "provider_finance_review",
		status: "open",
		nextOwner: params.owner || "provider_finance",
		openedAt: daysAgo(5),
		operation: operation({
			bookingId: params.bookingId,
			providerId: params.providerId,
			contractTotal: 480,
			state: "snapshot_ready",
		}),
		providerFinance: {
			bookingId: params.bookingId,
			providerId: params.providerId,
			currency: "USD",
			grossAmount: 480,
			commissionAmount: 72,
			taxAmount: 18,
			netPayable: 390,
			operationalOwner: params.owner || "provider_finance",
			nextOperationalAction: "Review the proof comparison before continuing this provider check.",
			blockingDetails: params.blockingDetails || [],
			reconciliation: {
				readyForPayable: params.readyForPayable ?? false,
				blockingStatus: "mismatch",
			},
			statement: {
				state: params.statementState || "fresh",
				freshness: params.statementState || "fresh",
				includedBookings: 7,
				excludedBookings: 1,
				staleReasons: params.statementState === "stale" ? ["payable_net_amount_stale"] : [],
			},
			snapshotLifecycle: {
				freshness: params.statementState || "fresh",
				staleReasons: params.statementState === "stale" ? ["payable_net_amount_stale"] : [],
			},
		},
	}
}

export const financialOperationalWorld: OperationalCase[] = [
	{
		id: "payment-proof-missing",
		persona: "financial_ops",
		urgency: "high",
		expectedQueue: "needs_action_today",
		expectedHumanSignal: "Payment proof is missing.",
		item: reviewItem({
			id: "fx-payment-proof-missing",
			bookingId: "BK-1001",
			providerId: "PV-ANDES",
			code: "missing_payment_reference",
			reason: "Payment proof is missing.",
			openedDaysAgo: 4,
			operation: operation({
				bookingId: "BK-1001",
				providerId: "PV-ANDES",
				hasOpenException: true,
				codes: ["missing_payment_reference"],
			}),
			persisted: true,
		}),
		referenceCounts: { payment: 0, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "duplicate-provider-reference",
		persona: "reconciliation_ops",
		urgency: "high",
		expectedQueue: "blocked",
		expectedHumanSignal: "The same external reference appears on more than one booking.",
		item: {
			id: "evidence-duplicate:PSP-7788",
			bookingId: "BK-1002",
			providerId: "PV-LIMA",
			code: "duplicate_external_reference",
			status: "open",
			nextOwner: "reconciliation_ops",
			openedAt: daysAgo(2),
			overlaySource: "visibility_only",
			operation: operation({
				bookingId: "BK-1002",
				providerId: "PV-LIMA",
				state: "evidence_partial",
			}),
			evidenceIssue: {
				kind: "duplicate_reference",
				title: "Duplicate external reference",
				description:
					"External reference PSP-7788 appears on multiple booking records. Confirm which booking owns this proof.",
				blocker: "The same external reference appears on more than one booking.",
				nextAction: "Confirm which booking owns this reference before closing.",
				owner: "reconciliation_ops",
				severity: "review",
			},
		},
		referenceCounts: { payment: 2, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "stale-review-after-proof-arrived",
		persona: "reconciliation_ops",
		urgency: "medium",
		expectedQueue: "blocked",
		expectedHumanSignal: "Proof changed after the last review",
		item: reviewItem({
			id: "fx-stale-review",
			bookingId: "BK-1003",
			providerId: "PV-LIMA",
			status: "acknowledged",
			reason: "A new settlement reference arrived after the last review.",
			openedDaysAgo: 9,
			operation: operation({
				bookingId: "BK-1003",
				providerId: "PV-LIMA",
				references: { payment: ["PAY-1003"], settlement: ["SET-1003-A"] },
			}),
			persisted: true,
		}),
		reconciliation: {
			bookingId: "BK-1003",
			status: "matched",
			reviewState: "stale",
			mismatchReasons: ["stale_review"],
			contractAmount: 320,
			paymentAmount: 320,
			settlementAmount: 320,
			differenceAmount: 0,
			currency: "USD",
		},
		referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "waiting-provider-response",
		persona: "financial_ops",
		urgency: "medium",
		expectedQueue: "waiting_external",
		expectedHumanSignal: "Waiting on someone else",
		item: reviewItem({
			id: "fx-waiting-provider",
			bookingId: "BK-1004",
			providerId: "PV-VALLE",
			status: "waiting_external",
			nextOwner: "provider_followup",
			reason: "Waiting for the provider to confirm the external reference.",
			openedDaysAgo: 6,
			operation: operation({
				bookingId: "BK-1004",
				providerId: "PV-VALLE",
				hasOpenException: true,
				codes: ["missing_settlement_reference"],
			}),
			persisted: true,
		}),
		referenceCounts: { payment: 1, settlement: 0, refund: 0, invoice: 0 },
	},
	{
		id: "provider-payable-blocked",
		persona: "provider_ops",
		urgency: "high",
		expectedQueue: "blocked",
		expectedHumanSignal: "Provider payable check is stuck",
		item: providerFinanceItem({
			bookingId: "BK-1005",
			providerId: "PV-ATACAMA",
			blockingDetails: [
				{
					code: "reconciliation_blocked",
					reason: "Proof must be reviewed first.",
					nextOperationalAction:
						"Review the proof comparison before continuing this provider check.",
				},
			],
		}),
		referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "statement-needs-another-look",
		persona: "provider_ops",
		urgency: "medium",
		expectedQueue: "blocked",
		expectedHumanSignal: "Statement draft needs another look",
		item: providerFinanceItem({
			bookingId: "BK-1006",
			providerId: "PV-CENTRO",
			statementState: "stale",
			readyForPayable: true,
			blockingDetails: [
				{
					code: "statement_stale",
					reason: "Statement draft needs another look.",
					nextOperationalAction:
						"Review whether the statement draft still matches the latest case information.",
				},
			],
		}),
		referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "ready-to-close",
		persona: "financial_ops",
		urgency: "low",
		expectedQueue: "ready_to_close",
		expectedHumanSignal: "Start, close, or dismiss this case.",
		item: reviewItem({
			id: "fx-ready-close",
			bookingId: "BK-1007",
			providerId: "PV-LAGO",
			status: "acknowledged",
			reason: "Operator reviewed the proof and left a clean note.",
			openedDaysAgo: 1,
			operation: operation({
				bookingId: "BK-1007",
				providerId: "PV-LAGO",
				state: "evidence_matched",
				references: { payment: ["PAY-1007"], settlement: ["SET-1007"] },
			}),
			persisted: true,
		}),
		referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
	},
	{
		id: "refund-follow-up-pending",
		persona: "support",
		urgency: "medium",
		expectedQueue: "needs_action_today",
		expectedHumanSignal: "Review the refund follow-up evidence.",
		item: reviewItem({
			id: "fx-refund-follow-up",
			bookingId: "BK-1008",
			providerId: "PV-LAGO",
			code: "refund_handoff_required",
			nextOwner: "support",
			reason: "Refund follow-up needed after cancellation support context changed.",
			openedDaysAgo: 3,
			operation: operation({
				bookingId: "BK-1008",
				providerId: "PV-LAGO",
				hasOpenException: true,
				codes: ["refund_handoff_required"],
			}),
			persisted: true,
		}),
		referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
	},
]

export const financialOperatorDrills = [
	{
		id: "new-operator-cold-start",
		persona: "new_operator",
		prompt: "Find the first case that needs attention without knowing internal queue names.",
		successSignals: ["Needs attention", "What is stopping it", "What to do next"],
	},
	{
		id: "financial-ops-15-minute-triage",
		persona: "financial_ops",
		prompt: "Separate cases you can act on from cases waiting on someone else.",
		successSignals: ["Payment proof is missing", "Waiting on someone else", "Can be closed"],
	},
	{
		id: "proof-comparison-risk-check",
		persona: "reconciliation_ops",
		prompt: "Find the riskiest proof comparison issue and name what blocks progress.",
		successSignals: ["Proof does not line up", "Duplicate external reference", "Proof changed"],
	},
	{
		id: "provider-payable-check",
		persona: "provider_ops",
		prompt: "Find which provider payable check is stuck and what other team must act first.",
		successSignals: ["Provider payable check is stuck", "Proof must be reviewed first"],
	},
]

export function rowForOperationalCase(entry: OperationalCase): FinancialRowViewModel {
	return buildFinancialRowViewModel({
		item: entry.item,
		reconciliation: entry.reconciliation || null,
		referenceCounts: entry.referenceCounts || { payment: 0, settlement: 0, refund: 0, invoice: 0 },
		ageLabel: "opened 3d ago",
		sourceKind: "visibility only",
	})
}

export function filterOperationalWorld(filters: {
	queue: string
	actor?: any
	evidenceState?: string
}): OperationalCase[] {
	const byItem = new Map(financialOperationalWorld.map((entry) => [entry.item, entry]))
	const filtered = filterFinancialRows({
		items: financialOperationalWorld.map((entry) => entry.item),
		filters: {
			queue: filters.queue,
			actor: filters.actor || "all",
			evidenceState: filters.evidenceState || "all",
		},
		rowFor: (item) => rowForOperationalCase(byItem.get(item)!),
		isTerminalReview: (item) => ["resolved", "dismissed"].includes(String(item?.status || "")),
		isSuppressed: () => false,
	})
	return filtered.map((item) => byItem.get(item)!)
}

export function renderOperationalRow(entry: OperationalCase): string {
	const row = rowForOperationalCase(entry)
	return renderFinancialRowHtml({
		item: entry.item,
		row,
		operation: entry.item.operation,
		handoff: null,
		ownerMarkup: `<span>${row.ownerLabel}</span><div>${row.ageLabel}</div>`,
		deps: {
			escapeHtml: (value) =>
				String(value ?? "")
					.replaceAll("&", "&amp;")
					.replaceAll("<", "&lt;")
					.replaceAll(">", "&gt;"),
			money: (currency, value) => `${String(currency || "USD")} ${Number(value || 0).toFixed(2)}`,
			label: (value) => String(value ?? "").replaceAll("_", " ") || "-",
			statusChip: (status) => `<span>${String(status || "open")}</span>`,
			handoffStatusChip: (status) => `<span>${String(status || "")}</span>`,
			ownerChip: (owner) => `<span>${String(owner || "")}</span>`,
			itemKey: (item) => String(item?.id || item?.bookingId || "case"),
		},
	})
}
