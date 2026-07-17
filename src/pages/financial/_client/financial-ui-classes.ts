export const financialUi = {
	summaryActive:
		"fastt-button h-auto rounded-full border border-slate-950 bg-slate-950 px-3 py-2 text-left text-xs font-semibold text-white transition",
	summaryInactive:
		"fastt-button h-auto rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-white",
	buttonPrimarySm:
		"fastt-button h-auto rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800",
	buttonSecondarySm:
		"fastt-button h-auto rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
	buttonSuccessSm:
		"fastt-button h-auto rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40",
	reviewTextarea:
		"fastt-field mt-2 min-h-20 w-full bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400",
	reviewTextareaTall:
		"fastt-field mt-2 min-h-24 w-full bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400",
	metricCard: "fastt-drawer-soft-card p-3",
	metricCardLarge: "fastt-drawer-soft-card p-4",
	inlineNotice: "fastt-notice mt-3 bg-slate-50 p-3 text-xs leading-5 text-slate-600",
	warningNotice:
		"fastt-notice mt-3 border-amber-200 bg-amber-50/70 p-4 text-xs leading-5 text-amber-900",
	emptyState: "fastt-empty-state px-4 py-10 text-center text-sm text-slate-500",
	technicalPre: "mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100",
	rowOpenButton:
		"fastt-button mt-2 h-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition group-hover:border-slate-400 sm:mt-3 sm:py-2",
}

export function financialSegmentClass(active: boolean): string {
	return financialSummaryClass(active)
}

export function financialSummaryClass(active: boolean): string {
	return active ? financialUi.summaryActive : financialUi.summaryInactive
}

export function financialSegmentMarkup(label: string, count: number, active: boolean): string {
	const countClass = active ? "font-bold text-white" : "font-bold text-slate-950"
	return `<span class="${countClass}">${count}</span><span class="ml-1">${label}</span>`
}

export function financialMetricCard(label: string, value: string): string {
	return `<div class="${financialUi.metricCard}"><div class="text-xs text-slate-500">${label}</div><div class="mt-1 text-sm text-slate-900">${value}</div></div>`
}
