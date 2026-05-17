export const primaryQueueOptions = [
	{ value: "all_open", label: "Needs review" },
	{ value: "refund_handoff_required", label: "Refund handoffs" },
	{ value: "missing_references", label: "Missing evidence" },
	{ value: "provider_finance_review", label: "Provider finance" },
	{ value: "snapshot_gaps", label: "Snapshot gaps" },
	{ value: "evidence_unknown", label: "Unknown evidence" },
	{ value: "multi_room_review", label: "Multi-room review" },
	{ value: "all", label: "Advanced: all records" },
	{ value: "clean_records", label: "Advanced: clean records" },
] as const

export const primarySummaryQueues = [
	{ label: "Needs review", queue: "all_open" },
	{ label: "Refund handoffs", queue: "refund_handoff_required" },
	{ label: "Missing evidence", queue: "missing_references" },
	{ label: "Provider finance", queue: "provider_finance_review" },
	{ label: "Snapshot gaps", queue: "snapshot_gaps" },
	{ label: "Unmatched evidence", queue: "all" },
] as const
