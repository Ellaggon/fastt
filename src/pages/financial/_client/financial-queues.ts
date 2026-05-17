export const primaryQueueOptions = [
	{ value: "needs_review", label: "Needs review" },
	{ value: "reconciliation_issues", label: "Reconciliation issues" },
	{ value: "refund_handoffs", label: "Refund handoffs" },
	{ value: "provider_finance", label: "Provider finance" },
	{ value: "evidence_issues", label: "Evidence issues" },
	{ value: "waiting_external", label: "Waiting external" },
	{ value: "resolved_history", label: "Resolved / historical" },
	{ value: "advanced_all", label: "Advanced: all records" },
] as const

export const primarySummaryQueues = [
	{ label: "Needs review", queue: "needs_review" },
	{ label: "Reconciliation issues", queue: "reconciliation_issues" },
	{ label: "Refund handoffs", queue: "refund_handoffs" },
	{ label: "Provider finance", queue: "provider_finance" },
	{ label: "Evidence issues", queue: "evidence_issues" },
	{ label: "Waiting external", queue: "waiting_external" },
] as const
