import type { CalendarRange } from "./calendarRangeOperations"

type MobileSheetState = "compact" | "expanded"

type MobileActionSheetOptions = {
	panel: HTMLElement | null
	backdrop?: HTMLElement | null
	handle?: HTMLElement | null
	expandButton?: HTMLElement | null
	closeButton?: HTMLElement | null
	onClose: () => void
	compactLabel?: string
	expandedLabel?: string
}

export function createMobileActionSheet(options: MobileActionSheetOptions) {
	let state: MobileSheetState = "compact"
	let startY: number | null = null
	let lastY: number | null = null
	let lastTimestamp = 0
	let velocity = 0

	const compactLabel = options.compactLabel ?? "Expandir"
	const expandedLabel = options.expandedLabel ?? "Compactar"

	function isMobile(): boolean {
		return Boolean(
			window.matchMedia?.("(max-width: 767px), (max-height: 480px) and (pointer: coarse)").matches
		)
	}

	function setKeyboardOffset(): void {
		if (!window.visualViewport || !options.panel) return
		const offset = Math.max(
			0,
			window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
		)
		options.panel.style.setProperty("--mobile-keyboard-offset", `${Math.round(offset)}px`)
	}

	function settle(): void {
		options.panel?.classList.add("mobile-sheet-settling")
		window.setTimeout(() => options.panel?.classList.remove("mobile-sheet-settling"), 220)
	}

	function setState(nextState: MobileSheetState): void {
		state = nextState
		options.panel?.setAttribute("data-sheet-state", state)
		options.panel?.classList.toggle("mobile-sheet-expanded", state === "expanded")
		if (options.expandButton) {
			options.expandButton.textContent = state === "expanded" ? expandedLabel : compactLabel
		}
		settle()
	}

	function setOpen(isOpen: boolean): void {
		options.panel?.classList.toggle("hidden", !isOpen)
		options.backdrop?.classList.toggle("hidden", !isOpen)
		document.documentElement.classList.toggle("calendar-sheet-open", isOpen)
		if (isOpen) setKeyboardOffset()
	}

	function clearDrag(): void {
		options.panel?.classList.remove("mobile-sheet-dragging")
		options.panel?.style.removeProperty("--mobile-sheet-drag")
		options.panel?.style.removeProperty("--mobile-sheet-scale")
	}

	function start(event: TouchEvent): void {
		if (!isMobile()) return
		const touch = event.touches?.[0]
		if (!touch) return
		startY = touch.clientY
		lastY = touch.clientY
		lastTimestamp = event.timeStamp || Date.now()
		velocity = 0
		options.panel?.classList.add("mobile-sheet-dragging")
	}

	function move(event: TouchEvent): void {
		if (startY == null || !options.panel) return
		const touch = event.touches?.[0]
		if (!touch) return
		const now = event.timeStamp || Date.now()
		const elapsed = Math.max(1, now - lastTimestamp)
		velocity = (touch.clientY - (lastY ?? touch.clientY)) / elapsed
		lastY = touch.clientY
		lastTimestamp = now

		const rawDelta = touch.clientY - startY
		const resistedDelta =
			rawDelta < 0 ? Math.max(-72, rawDelta * 0.52) : Math.min(150, rawDelta * 0.82)
		const scale = rawDelta > 0 ? Math.max(0.985, 1 - rawDelta / 3000) : 1
		options.panel.style.setProperty("--mobile-sheet-drag", `${Math.round(resistedDelta)}px`)
		options.panel.style.setProperty("--mobile-sheet-scale", String(scale))
	}

	function end(event: TouchEvent): void {
		if (startY == null) return
		const touch = event.changedTouches?.[0]
		const endY = touch?.clientY ?? startY
		const delta = endY - startY
		const projected = delta + velocity * 160
		clearDrag()

		if (projected > 124 || velocity > 0.72) {
			options.onClose()
		} else if (projected < -42 || velocity < -0.36) {
			setState("expanded")
		} else if (projected > 30) {
			setState("compact")
		} else {
			setState(state)
		}

		startY = null
		lastY = null
	}

	options.expandButton?.addEventListener("click", () => {
		setState(state === "expanded" ? "compact" : "expanded")
	})
	options.closeButton?.addEventListener("click", options.onClose)
	options.handle?.addEventListener("touchstart", start, { passive: true })
	options.handle?.addEventListener("touchmove", move, { passive: true })
	options.handle?.addEventListener("touchend", end, { passive: true })
	window.visualViewport?.addEventListener("resize", setKeyboardOffset)
	window.visualViewport?.addEventListener("scroll", setKeyboardOffset)

	return {
		setOpen,
		setState,
		getState: () => state,
		setKeyboardOffset,
	}
}

export function findNextSelectableDate(cards: Element[], currentDate: string): string | null {
	const nextCard = cards
		.filter((card) => card.getAttribute("tabindex") === "0")
		.map((card) => card.getAttribute("data-date"))
		.filter((date): date is string => Boolean(date && date > currentDate))
		.sort()[0]
	return nextCard ?? null
}

export function flashAppliedRange(params: {
	cards: Element[]
	range: CalendarRange | null
	classNames?: string[]
	durationMs?: number
}): void {
	if (!params.range) return
	const classNames = params.classNames ?? ["ring-2", "ring-emerald-400"]
	for (const card of params.cards) {
		const date = card.getAttribute("data-date")
		if (!date || date < params.range.from || date > params.range.to) continue
		card.classList.add(...classNames)
		window.setTimeout(
			() => card.classList.remove(...classNames),
			Math.max(300, params.durationMs ?? 1100)
		)
	}
}
