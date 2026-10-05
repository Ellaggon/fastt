import { centerTourRequirementsRail } from "@/lib/playbook/tour-preparation-requirements-rail.client.ts"

const DISCLOSURE_SELECTOR = "[data-tour-preparation-disclosure]"
const STAGE_TOGGLE_SELECTOR = "[data-tour-preparation-stage-toggle]"
const REQUIREMENTS_TOGGLE_SELECTOR = "[data-tour-preparation-requirements-toggle]"
const TOTAL_SELECTOR = ".verification-wizard-progress-label__phase--total"
const BREAKDOWN_SELECTOR = ".verification-wizard-progress-label__phase--breakdown"

type ExpandedMode = "none" | "stages" | "requirements"

/** Match panel collapse so the other label reads as a deliberate handoff. */
const CLOSE_LABEL_HOLD_MS = 360
/** Keep in sync with `verification-wizard-progress-label-*` duration in global.css. */
const ALTERNATE_LABEL_CYCLE_MS = 7500
/** Keyframes show breakdown / hide total from 46% → 88%. */
const ALTERNATE_BREAKDOWN_VISIBLE_MS = ALTERNATE_LABEL_CYCLE_MS * 0.46

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getExpandedMode(root: HTMLElement): ExpandedMode {
	const mode = root.dataset.expandedMode
	if (mode === "stages" || mode === "requirements") return mode
	return "none"
}

function readPhaseOpacities(root: HTMLElement) {
	const total = root.querySelector<HTMLElement>(TOTAL_SELECTOR)
	const breakdown = root.querySelector<HTMLElement>(BREAKDOWN_SELECTOR)
	if (!total || !breakdown) return null
	return {
		total: Number.parseFloat(getComputedStyle(total).opacity),
		breakdown: Number.parseFloat(getComputedStyle(breakdown).opacity),
	}
}

function syncActiveInteractiveLine(root: HTMLElement) {
	const expanded = getExpandedMode(root)
	if (expanded === "stages") {
		root.dataset.activeLine = "stages"
		return
	}
	if (expanded === "requirements") {
		root.dataset.activeLine = "requirements"
		return
	}
	if (prefersReducedMotion()) {
		root.dataset.activeLine = "both"
		return
	}
	const opacities = readPhaseOpacities(root)
	if (!opacities) {
		root.dataset.activeLine = "none"
		return
	}
	const { total, breakdown } = opacities
	if (breakdown > total && breakdown >= 0.4) {
		root.dataset.activeLine = "stages"
	} else if (total > breakdown && total >= 0.4) {
		root.dataset.activeLine = "requirements"
	} else {
		root.dataset.activeLine = "none"
	}
}

function syncToggleClickability(
	root: HTMLElement,
	toggle: HTMLButtonElement,
	visibleWhen: (totalOpacity: number, breakdownOpacity: number) => boolean
) {
	if (prefersReducedMotion()) {
		toggle.disabled = false
		toggle.style.pointerEvents = "auto"
		toggle.style.cursor = "pointer"
		return
	}
	if (getExpandedMode(root) !== "none") {
		toggle.disabled = false
		toggle.style.pointerEvents = "auto"
		toggle.style.cursor = "pointer"
		return
	}
	const total = root.querySelector<HTMLElement>(TOTAL_SELECTOR)
	const breakdown = root.querySelector<HTMLElement>(BREAKDOWN_SELECTOR)
	if (!total || !breakdown) return
	const totalOpacity = Number.parseFloat(getComputedStyle(total).opacity)
	const breakdownOpacity = Number.parseFloat(getComputedStyle(breakdown).opacity)
	const clickable = visibleWhen(totalOpacity, breakdownOpacity)
	toggle.disabled = !clickable
	toggle.style.pointerEvents = clickable ? "auto" : "none"
	toggle.style.cursor = clickable ? "pointer" : "default"
}

function setExpandedMode(
	root: HTMLElement,
	stageToggle: HTMLButtonElement,
	requirementsToggle: HTMLButtonElement | null,
	mode: ExpandedMode
) {
	root.dataset.expandedMode = mode
	stageToggle.setAttribute("aria-expanded", mode === "stages" ? "true" : "false")
	if (requirementsToggle) {
		requirementsToggle.setAttribute("aria-expanded", mode === "requirements" ? "true" : "false")
	}
}

function resumeAlternateLabelAnimations(phases: HTMLElement[], currentTimeMs: number, attempt = 0) {
	const animations = phases.flatMap((phase) => phase.getAnimations())
	if (animations.length === 0 && attempt < 8) {
		window.requestAnimationFrame(() =>
			resumeAlternateLabelAnimations(phases, currentTimeMs, attempt + 1)
		)
		return
	}
	for (const animation of animations) {
		animation.currentTime = currentTimeMs
	}
}

/** After collapse, flash the other line briefly (mirrors close-stages → requisitos). */
function restartAlternatingLabel(root: HTMLElement, closedMode: Exclude<ExpandedMode, "none">) {
	if (prefersReducedMotion()) return
	const total = root.querySelector<HTMLElement>(TOTAL_SELECTOR)
	const breakdown = root.querySelector<HTMLElement>(BREAKDOWN_SELECTOR)
	if (!total || !breakdown) return

	const flashPhase = closedMode === "requirements" ? "breakdown" : "total"
	const phases = [total, breakdown]
	root.dataset.restartPhase = flashPhase
	root.classList.add("tour-preparation-disclosure--restart-alternate")
	for (const phase of phases) {
		phase.getAnimations().forEach((animation) => animation.cancel())
	}

	window.setTimeout(() => {
		root.classList.remove("tour-preparation-disclosure--restart-alternate")
		delete root.dataset.restartPhase
		for (const phase of phases) {
			phase.style.removeProperty("visibility")
			phase.style.removeProperty("animation-delay")
			phase.style.animation = "none"
		}
		void root.offsetHeight
		for (const phase of phases) {
			phase.style.removeProperty("animation")
		}
		const resumeAt = flashPhase === "breakdown" ? ALTERNATE_BREAKDOWN_VISIBLE_MS : 0
		window.requestAnimationFrame(() => {
			resumeAlternateLabelAnimations(phases, resumeAt)
		})
	}, CLOSE_LABEL_HOLD_MS)
}

function centerStagesRail(root: HTMLElement) {
	const active = root.querySelector<HTMLElement>(".tour-stage-rail__step--active")
	active?.scrollIntoView({
		inline: "center",
		block: "nearest",
		behavior: prefersReducedMotion() ? "auto" : "smooth",
	})
}

function centerRequirementsRails(root: HTMLElement) {
	root.querySelectorAll<HTMLElement>("[data-tour-requirements-rail]").forEach((rail) => {
		centerTourRequirementsRail(rail)
	})
}

function bindTourPreparationDisclosure(root: HTMLElement) {
	if (root.dataset.tourPreparationBound === "true") return
	const stageToggle = root.querySelector<HTMLButtonElement>(STAGE_TOGGLE_SELECTOR)
	if (!stageToggle) return
	const requirementsToggle = root.querySelector<HTMLButtonElement>(REQUIREMENTS_TOGGLE_SELECTOR)
	root.dataset.tourPreparationBound = "true"

	let syncTimer = 0
	const syncAll = () => {
		syncToggleClickability(
			root,
			stageToggle,
			(total, breakdown) => breakdown >= 0.45 && breakdown > total
		)
		if (requirementsToggle) {
			syncToggleClickability(
				root,
				requirementsToggle,
				(total, breakdown) => total >= 0.45 && total > breakdown
			)
		}
		syncActiveInteractiveLine(root)
	}

	const scheduleSync = () => {
		window.clearInterval(syncTimer)
		syncAll()
		if (prefersReducedMotion() || getExpandedMode(root) !== "none") return
		syncTimer = window.setInterval(syncAll, 80)
	}

	scheduleSync()
	window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", scheduleSync)

	const openMode = (mode: ExpandedMode) => {
		const current = getExpandedMode(root)
		const next = current === mode ? "none" : mode
		setExpandedMode(root, stageToggle, requirementsToggle, next)
		syncActiveInteractiveLine(root)
		if (next === "none") {
			if (current === "stages" || current === "requirements") {
				restartAlternatingLabel(root, current)
			}
			window.setTimeout(() => scheduleSync(), CLOSE_LABEL_HOLD_MS + 50)
			return
		}
		window.clearInterval(syncTimer)
		stageToggle.disabled = false
		stageToggle.style.pointerEvents = "auto"
		stageToggle.style.cursor = "pointer"
		if (requirementsToggle) {
			requirementsToggle.disabled = false
			requirementsToggle.style.pointerEvents = "auto"
			requirementsToggle.style.cursor = "pointer"
		}
		window.requestAnimationFrame(() => {
			if (next === "stages") centerStagesRail(root)
			if (next === "requirements") centerRequirementsRails(root)
		})
	}

	stageToggle.addEventListener("click", () => {
		if (stageToggle.disabled && getExpandedMode(root) === "none") return
		openMode("stages")
	})

	requirementsToggle?.addEventListener("click", () => {
		if (requirementsToggle.disabled && getExpandedMode(root) === "none") return
		openMode("requirements")
	})
}

export function initTourPreparationDisclosures() {
	document.querySelectorAll<HTMLElement>(DISCLOSURE_SELECTOR).forEach(bindTourPreparationDisclosure)
}
