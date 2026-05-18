export const primaryQueueOptions = [
	{ value: "needs_action_today", label: "Needs attention" },
	{ value: "waiting_external", label: "Waiting on someone else" },
	{ value: "blocked", label: "Stuck until fixed" },
	{ value: "ready_to_close", label: "Can be closed" },
	{ value: "recently_closed", label: "Closed recently" },
	{ value: "needs_review", label: "Other open work" },
	{ value: "reconciliation_issues", label: "Proof does not line up" },
	{ value: "refund_handoffs", label: "Refund follow-up" },
	{ value: "provider_finance", label: "Provider payable checks" },
	{ value: "evidence_issues", label: "Proof needs attention" },
	{ value: "resolved_history", label: "Closed work" },
	{ value: "advanced_all", label: "All records (advanced)" },
] as const

export const primarySummaryQueues = [
	{ label: "Needs attention", queue: "needs_action_today" },
	{ label: "Waiting on someone else", queue: "waiting_external" },
	{ label: "Stuck until fixed", queue: "blocked" },
	{ label: "Can be closed", queue: "ready_to_close" },
	{ label: "Closed recently", queue: "recently_closed" },
] as const
