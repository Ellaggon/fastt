import type { CommercialLine } from "@/lib/verification/commercial-lines"
import { TRUST_GLOSSARY, type TrustLinkUiState } from "@/lib/provider-trust-map"

export type VerificationTab =
	| "identity"
	| "business"
	| "activity"
	| "safety"
	| "fiscal"
	| "payments"

export type VerificationNavigation = {
	line: CommercialLine | null
	tab: VerificationTab
	experienceId: string | null
	lines: CommercialLine[]
	tabs: VerificationTab[]
	fasttCollects: boolean
}

const lodgingTabs: VerificationTab[] = ["identity", "business", "fiscal", "payments"]
const tourTabs: VerificationTab[] = ["identity", "activity", "safety", "fiscal"]
const labels: Record<VerificationTab, string> = {
	identity: "Identidad",
	business: "Negocio",
	activity: "Actividad y licencias",
	safety: "Seguridad y permisos",
	fiscal: "Fiscal",
	payments: "Cobros",
}

export function verificationTabLabel(tab: VerificationTab) {
	return labels[tab]
}

export type VerificationPlaybookTab = {
	id: VerificationTab
	label: string
	href: string
	uiState: TrustLinkUiState | "not_evaluable" | "not_applicable"
	stateLabel: string
}

type PlaybookState = VerificationPlaybookTab["uiState"]
const stateRank: Record<PlaybookState, number> = {
	requires_changes: 0,
	action_needed: 1,
	not_started: 2,
	not_evaluable: 3,
	blocked: 3,
	in_review: 4,
	ready: 5,
	not_applicable: 6,
}

function dominantState(states: readonly TrustLinkUiState[]): PlaybookState {
	if (states.length === 0) return "not_evaluable"
	return [...states].sort((left, right) => stateRank[left] - stateRank[right])[0] ?? "not_evaluable"
}

function playbookStateLabel(state: PlaybookState) {
	switch (state) {
		case "not_evaluable":
			return "No evaluable"
		case "not_applicable":
			return "No aplica"
		case "ready":
			return TRUST_GLOSSARY.trustLink.ready
		case "in_review":
			return TRUST_GLOSSARY.trustLink.inReview
		case "requires_changes":
			return TRUST_GLOSSARY.trustLink.needsChanges
		case "blocked":
			return TRUST_GLOSSARY.trustLink.blocked
		default:
			return TRUST_GLOSSARY.trustLink.actionNeeded
	}
}

/**
 * Tour verification uses the lodging playbook rule: one step per visible tab.
 * Activity and safety fold the evidence of that panel into a single state.
 */
export function buildTourVerificationPlaybook(input: {
	tabs: readonly VerificationTab[]
	hrefFor: (tab: VerificationTab) => string
	identity: TrustLinkUiState
	registration: TrustLinkUiState | null
	fiscal: TrustLinkUiState
	payments: TrustLinkUiState
	activity: readonly TrustLinkUiState[]
	safety: readonly TrustLinkUiState[]
	contextComplete: boolean
	policyResolved?: boolean
}): VerificationPlaybookTab[] {
	const stateFor = (tab: VerificationTab): PlaybookState => {
		if (tab === "identity") {
			return dominantState(
				input.registration ? [input.identity, input.registration] : [input.identity]
			)
		}
		if (tab === "activity") {
			return dominantState(
				!input.contextComplete ? [...input.activity, "action_needed"] : input.activity
			)
		}
		if (tab === "safety")
			return !input.contextComplete || input.policyResolved === false
				? "not_evaluable"
				: input.safety.length
					? dominantState(input.safety)
					: "not_applicable"
		if (tab === "fiscal") return input.fiscal
		if (tab === "payments") return input.payments
		return "not_started"
	}
	return input.tabs.map((tab) => {
		const uiState = stateFor(tab)
		return {
			id: tab,
			label: verificationTabLabel(tab),
			href: input.hrefFor(tab),
			uiState,
			stateLabel: playbookStateLabel(uiState),
		}
	})
}

export function summarizeVerificationPlaybook(tabs: readonly VerificationPlaybookTab[]) {
	const applicable = tabs.filter((tab) => tab.uiState !== "not_applicable")
	const readyCount = applicable.filter((tab) => tab.uiState === "ready").length
	const inReviewCount = applicable.filter((tab) => tab.uiState === "in_review").length
	const actionRequiredCount = applicable.filter(
		(tab) => tab.uiState === "action_needed" || tab.uiState === "requires_changes"
	).length
	const notStartedCount = applicable.filter(
		(tab) => tab.uiState === "not_started" || tab.uiState === "blocked"
	).length
	const notEvaluableCount = applicable.filter((tab) => tab.uiState === "not_evaluable").length
	const totalCount = applicable.length
	return {
		readyCount,
		totalCount,
		inReviewCount,
		actionRequiredCount,
		notStartedCount,
		notEvaluableCount,
		readinessPercent: totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0,
	}
}

export function verificationTabsFor(
	line: CommercialLine,
	fasttCollects: boolean
): VerificationTab[] {
	return line === "lodging" ? lodgingTabs : fasttCollects ? [...tourTabs, "payments"] : tourTabs
}

function tabFromLegacyUrl(url: URL): VerificationTab {
	if (url.pathname.endsWith("/payments")) return "payments"
	if (url.pathname.endsWith("/fiscal")) return "fiscal"
	if (url.searchParams.get("type") === "government_id") return "identity"
	if (
		url.searchParams.get("type") ||
		url.hash === "#kyc-slots" ||
		url.hash.startsWith("#kyc-slot-")
	)
		return "business"
	return "identity"
}

/** Server-side source of truth: a URL cannot select another provider's experience. */
export function resolveVerificationNavigation(input: {
	url: URL
	lines: readonly CommercialLine[]
	experienceIds: readonly string[]
	fasttCollects: boolean
}): VerificationNavigation {
	const lines = [...new Set(input.lines)]
	const requestedLine = input.url.searchParams.get("line")
	const line = lines.includes(requestedLine as CommercialLine)
		? (requestedLine as CommercialLine)
		: (lines[0] ?? null)
	const tabs = line ? verificationTabsFor(line, input.fasttCollects) : lodgingTabs
	const requestedTab = input.url.searchParams.get("tab")
	const legacyTab = tabFromLegacyUrl(input.url)
	const candidate = requestedTab ?? legacyTab
	const tab = tabs.includes(candidate as VerificationTab)
		? (candidate as VerificationTab)
		: candidate === "business" && line === "tour"
			? "activity"
			: "identity"
	const requestedExperience = input.url.searchParams.get("experience")
	const experienceId =
		line === "tour" && requestedExperience && input.experienceIds.includes(requestedExperience)
			? requestedExperience
			: null
	return { line, tab, experienceId, lines, tabs, fasttCollects: input.fasttCollects }
}

/** Keeps the selected tour and both lines' last tabs across line switches. */
export function verificationNavigationHref(input: {
	url: URL
	navigation: VerificationNavigation
	line: CommercialLine
	tab?: VerificationTab
	experienceId?: string | null
}): string {
	const url = new URL("/provider/settings/verification", input.url)
	const params = new URLSearchParams()
	const line = input.line
	const tabs = verificationTabsFor(line, input.navigation.fasttCollects)
	const remembered = input.url.searchParams.get(`${line}Tab`)
	const requestedTab =
		input.tab ?? (input.navigation.line === line ? input.navigation.tab : remembered)
	const tab = tabs.includes(requestedTab as VerificationTab)
		? (requestedTab as VerificationTab)
		: "identity"
	params.set("line", line)
	params.set("tab", tab)
	params.set(`${line}Tab`, tab)
	const otherLine = line === "tour" ? "lodging" : "tour"
	const otherTab =
		input.navigation.line === otherLine
			? input.navigation.tab
			: input.url.searchParams.get(`${otherLine}Tab`)
	if (otherTab) params.set(`${otherLine}Tab`, otherTab)
	const experienceId =
		input.experienceId === undefined
			? (input.navigation.experienceId ?? input.url.searchParams.get("experience"))
			: input.experienceId
	if (experienceId) params.set("experience", experienceId)
	url.search = params.toString()
	return `${url.pathname}${url.search}`
}

/** Carries navigation context through browser form posts and their 303 redirects. */
export function copyVerificationNavigationQuery(target: URL, source: URL): URL {
	const line = source.searchParams.get("line")
	if (line !== "lodging" && line !== "tour") return target
	target.searchParams.set("line", line)
	const allowed = line === "lodging" ? lodgingTabs : [...tourTabs, "payments"]
	const tab = source.searchParams.get("tab")
	if (tab && allowed.includes(tab as VerificationTab)) target.searchParams.set("tab", tab)
	for (const key of ["experience", "lodgingTab", "tourTab"]) {
		const value = source.searchParams.get(key)
		if (value && value.length < 180) target.searchParams.set(key, value)
	}
	return target
}
