export const financialSegmentTabPanelClass =
	"fastt-tabs-outside-panel inline-flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-[var(--fastt-radius-pill)] bg-sky-50 p-1 text-sm font-semibold text-slate-600 ring-1 ring-sky-100"

export const financialSegmentTabItemClass =
	"fastt-tabs-outside-panel__item px-3 py-2 text-sm font-semibold whitespace-nowrap"

export const financialUi = {
	buttonPrimarySm:
		"fastt-button h-auto rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-950",
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
	return active
		? financialSegmentTabItemClass
		: `${financialSegmentTabItemClass} text-slate-600 hover:bg-sky-100/80 hover:text-sky-950`
}

export function applyFinancialSegmentTabState(button: HTMLElement, active: boolean): void {
	button.className = financialSummaryClass(active)
	button.setAttribute("data-active", active ? "true" : "false")
}

export function financialSegmentMarkup(label: string, count: number): string {
	return `${label} <span class="ml-1 text-xs opacity-70">${count}</span>`
}

export function financialMetricCard(label: string, value: string): string {
	return `<div class="${financialUi.metricCard}"><div class="text-xs text-slate-500">${label}</div><div class="mt-1 text-sm text-slate-900">${value}</div></div>`
}
