export type ReadinessStatusVariant = "success" | "info" | "error" | "warning"

export function readinessRowClass(status: { variant: ReadinessStatusVariant }, complete = false) {
	const base = "fastt-row-card group flex flex-wrap items-center gap-3 p-4 transition"
	if (complete) return base
	if (status.variant === "error") return `${base} fastt-row-card-danger`
	if (status.variant === "warning") return `${base} fastt-row-card-alert`
	return `${base} fastt-row-card-info`
}

export function readinessIconWellClass(
	status: { variant: ReadinessStatusVariant },
	complete = false
) {
	if (complete || status.variant === "success") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
	}
	if (status.variant === "error") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700"
	}
	if (status.variant === "warning") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700"
	}
	return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700"
}
