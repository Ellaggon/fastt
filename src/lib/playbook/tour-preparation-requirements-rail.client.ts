export function centerTourRequirementsRail(root: HTMLElement) {
	const scroller = root.querySelector<HTMLElement>("[data-requirements-scroller]")
	const active = root.querySelector<HTMLElement>('[data-requirement-active="true"]')
	if (!scroller || !active) return

	const target = active.offsetLeft - scroller.clientWidth / 2 + active.clientWidth / 2
	const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
	const left = Math.max(0, Math.min(maxScroll, target))

	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
	scroller.scrollTo({
		left,
		behavior: reducedMotion ? "auto" : "smooth",
	})
}
