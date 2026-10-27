import { safeVerificationReturn } from "@/lib/auth/returnTo"
import { experienceRequirementsHref } from "@/lib/verification/experience-requirements-navigation"
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
const tourTabs: VerificationTab[] = ["identity", "business", "fiscal"]
const labels: Record<VerificationTab, string> = {
	identity: "Identidad",
	business: "Negocio",
	activity: "Actividad y licencias",
	safety: "Seguridad y permisos",
	fiscal: "Datos fiscales",
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
	/** Presentation only: these fields never grant publishing authorization. */
	reason?: string
	responsible?: "provider" | "fastt" | "none"
	scope?: "business" | "experience"
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

/** Tour playbook tabs follow KYC slots, not account-level «En revisión». */
export function trustStateFromKycSlotState(
	state: "missing" | "pending" | "verified" | "rejected" | undefined
): TrustLinkUiState {
	switch (state) {
		case "verified":
			return "ready"
		case "pending":
			return "in_review"
		case "rejected":
			return "requires_changes"
		case "missing":
			return "action_needed"
		default:
			return "not_started"
	}
}

function playbookStateLabel(state: PlaybookState) {
	switch (state) {
		case "not_evaluable":
			return "Requisitos por definir"
		case "not_applicable":
			return "Sin requisitos adicionales"
		case "ready":
			return "Verificado"
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

export function verificationAreaReason(uiState: PlaybookState, missingOperation = false) {
	if (missingOperation)
		return "Completa el papel operativo, los departamentos y las actividades para determinar los respaldos."
	if (uiState === "not_evaluable")
		return "Fastt debe definir los requisitos aplicables a esta experiencia. No necesitas enviar documentos hasta que se indiquen."
	if (uiState === "not_applicable")
		return "No se requieren respaldos adicionales para la operación declarada. Si cambia, se volverá a evaluar."
	if (uiState === "in_review") return "La información enviada está en revisión por Fastt."
	if (uiState === "ready") return "La información requerida está verificada."
	if (uiState === "requires_changes") return "Revisa el motivo indicado y corrige la información."
	return "Completa los requisitos indicados en esta sección."
}

/** Operator review is independent of the personal identity document. */
export function tourBusinessVerificationState(input: {
	legalNameComplete: boolean
	holderType: "persona_natural" | "entidad" | null
	holderCountry: string | null
	holderInReview: boolean
	accountStatus: string | null
	registration: TrustLinkUiState | null
}): PlaybookState {
	if (!input.legalNameComplete || !input.holderType || !input.holderCountry) return "action_needed"
	if (input.holderInReview) return "in_review"
	if (input.registration === "requires_changes" || input.accountStatus === "rejected")
		return "requires_changes"
	if (input.holderType === "entidad" && input.registration === null) return "not_evaluable"
	if (input.registration === "action_needed") return "action_needed"
	if (input.registration === "in_review" || input.accountStatus === "pending") return "in_review"
	if (input.accountStatus === "approved") return input.registration ?? "ready"
	return "not_started"
}

export function buildTourVerificationPlaybook(input: {
	tabs: readonly VerificationTab[]
	hrefFor: (tab: VerificationTab) => string
	identity: TrustLinkUiState
	registration: TrustLinkUiState | null
	business?: PlaybookState
	fiscal: TrustLinkUiState
	payments: TrustLinkUiState
	activity: readonly TrustLinkUiState[]
	safety: readonly TrustLinkUiState[]
	contextComplete: boolean
	policyResolved?: boolean
}): VerificationPlaybookTab[] {
	const stateFor = (tab: VerificationTab): PlaybookState => {
		if (tab === "identity") return input.identity
		if (tab === "business") return input.business ?? input.registration ?? "not_started"
		if (tab === "activity" || tab === "safety") {
			if (!input.contextComplete) return tab === "activity" ? "action_needed" : "not_evaluable"
			if (input.policyResolved !== true) return "not_evaluable"
			const evidence = tab === "activity" ? input.activity : input.safety
			return evidence.length ? dominantState(evidence) : "not_applicable"
		}
		if (tab === "fiscal") return input.fiscal
		if (tab === "payments") return input.payments
		return "not_started"
	}
	return input.tabs.map((tab) => {
		const uiState = stateFor(tab)
		const experienceScoped = tab === "activity" || tab === "safety"
		const missingOperation = experienceScoped && !input.contextComplete
		return {
			id: tab,
			label: verificationTabLabel(tab),
			href: input.hrefFor(tab),
			uiState,
			stateLabel: missingOperation ? "Completar operación" : playbookStateLabel(uiState),
			reason: verificationAreaReason(uiState, missingOperation),
			responsible: missingOperation
				? ("provider" as const)
				: uiState === "not_evaluable" || uiState === "in_review"
					? ("fastt" as const)
					: uiState === "ready" || uiState === "not_applicable"
						? ("none" as const)
						: ("provider" as const),
			scope: experienceScoped ? ("experience" as const) : ("business" as const),
		}
	})
}

/** Stable operational summary, not a percentage of heterogeneous tabs. */
export function verificationOperationalSummary(tabs: readonly VerificationPlaybookTab[]) {
	const summaryNames: Partial<Record<VerificationTab, string>> = {
		identity: "Identidad",
		business: "negocio",
		fiscal: "datos fiscales",
		activity: "Licencias",
		safety: "seguridad",
	}
	const names = (items: readonly VerificationPlaybookTab[]) =>
		new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(
			items.map((tab) => summaryNames[tab.id] ?? tab.label)
		)
	const ready = tabs.filter((tab) => tab.uiState === "ready")
	const pending = tabs.filter(
		(tab) => tab.uiState === "not_evaluable" && tab.responsible === "fastt"
	)
	const reviewing = tabs.filter((tab) => tab.uiState === "in_review")
	const actionable = tabs.filter((tab) => tab.responsible === "provider")
	const parts = [
		ready.length ? `${names(ready)}: verificación completa.` : "",
		pending.length ? `${names(pending)}: Fastt debe definir los requisitos.` : "",
		reviewing.length ? `${names(reviewing)}: en revisión por Fastt.` : "",
		actionable.length ? `${names(actionable)}: requiere tu atención.` : "",
	].filter(Boolean)
	return {
		text: parts.join(" ") || "Sin requisitos adicionales para la operación declarada.",
		completedCount: ready.length,
		totalCount: tabs.length,
		noProviderAction:
			tabs.length > 0 &&
			tabs.every((tab) => tab.responsible === "fastt" || tab.responsible === "none"),
	}
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

export function verificationTabsFor(line: CommercialLine): VerificationTab[] {
	return line === "lodging" ? lodgingTabs : tourTabs
}

/** Document deep links take precedence over obsolete tab aliases. */
export function resolveVerificationTab(url: URL, line: CommercialLine | null): VerificationTab {
	const type = url.searchParams.get("type")
	const documentTab =
		type === "government_id"
			? "identity"
			: type === "business_registration"
				? "business"
				: type === "tax_document"
					? "fiscal"
					: null
	const candidate =
		documentTab ??
		url.searchParams.get("tab") ??
		(url.pathname.endsWith("/payments")
			? "payments"
			: url.pathname.endsWith("/fiscal")
				? "fiscal"
				: type
					? "business"
					: "identity")
	const tabs = line ? verificationTabsFor(line) : lodgingTabs
	return tabs.includes(candidate as VerificationTab) ? (candidate as VerificationTab) : "identity"
}

/** Explicit stale selections never fall back to another experience. */
export function resolveVerificationExperience(
	requested: string | null,
	ids: readonly string[]
): string | null {
	if (requested !== null) return ids.includes(requested) ? requested : null
	return ids.length === 1 ? ids[0] : null
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
	const tabs = line ? verificationTabsFor(line) : lodgingTabs
	const tab = resolveVerificationTab(input.url, line)
	const requestedExperience = input.url.searchParams.get("experience")
	const experienceId =
		line === "tour" ? resolveVerificationExperience(requestedExperience, input.experienceIds) : null
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
	const tabs = verificationTabsFor(line)
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
	const returnTo = safeVerificationReturn(input.url.searchParams.get("returnTo"))
	if (returnTo) params.set("returnTo", returnTo)
	url.search = params.toString()
	return `${url.pathname}${url.search}`
}

/** Carries navigation context through browser form posts and their 303 redirects. */
export function copyVerificationNavigationQuery(
	target: URL,
	source: URL,
	destinationTab?: VerificationTab
): URL {
	const returnTo = safeVerificationReturn(source.searchParams.get("returnTo"))
	if (returnTo) target.searchParams.set("returnTo", returnTo)
	const line = source.searchParams.get("line")
	if (line !== "lodging" && line !== "tour") return target
	target.searchParams.set("line", line)
	// Legacy entry adapters and experience evidence forms still carry their area.
	const allowed = line === "lodging" ? lodgingTabs : [...tourTabs, "activity", "safety", "payments"]
	const tab = source.searchParams.get("tab")
	if (tab && allowed.includes(tab as VerificationTab)) target.searchParams.set("tab", tab)
	for (const key of ["experience", "lodgingTab", "tourTab"]) {
		const value = source.searchParams.get(key)
		if (!value || value.length >= 180) continue
		if (key === "lodgingTab" && !lodgingTabs.includes(value as VerificationTab)) continue
		if (
			key === "tourTab" &&
			![...tourTabs, "activity", "safety", "payments"].includes(value as VerificationTab)
		)
			continue
		target.searchParams.set(key, value)
	}
	if (destinationTab && allowed.includes(destinationTab)) {
		target.searchParams.set("tab", destinationTab)
		target.searchParams.set(`${line}Tab`, destinationTab)
	}
	return target
}

/** Route tour evidence to its declared area; the archive remains available without a type. */
export function tourDocumentWorkspaceHref(input: {
	url: URL
	navigation: VerificationNavigation
	requirements: readonly {
		layer: string
		documentType: string | null
		uploadValue: string | null
		presentationArea: "activity" | "safety" | null
		scopes: { productIds: string[] }
	}[]
}): string | null {
	const type = input.url.searchParams.get("type")?.trim()
	if (input.navigation.line !== "tour" || !type) return null
	const matches = input.requirements.filter(
		(item) =>
			item.layer === "tour" &&
			(item.uploadValue === type || item.documentType === type) &&
			(!input.navigation.experienceId ||
				!item.scopes.productIds.length ||
				item.scopes.productIds.includes(input.navigation.experienceId))
	)
	const areas = new Set(matches.map((item) => item.presentationArea).filter(Boolean))
	// Without an unambiguous requirement, open Activity to select/review context,
	// never infer a document's coverage or manufacture a safety requirement.
	const tab = ["government_id", "business_registration", "tax_document"].includes(type)
		? resolveVerificationTab(input.url, "tour")
		: areas.size === 1 && areas.has("safety")
			? "safety"
			: "activity"
	const target = new URL(
		verificationNavigationHref({ url: input.url, navigation: input.navigation, line: "tour", tab }),
		input.url
	)
	for (const key of ["type", "renewDocumentId", "result", "error"]) {
		const value = input.url.searchParams.get(key)
		if (value) target.searchParams.set(key, value)
	}
	if (tab === "activity" || tab === "safety") {
		target.searchParams.set("tab", tab)
		return input.navigation.experienceId &&
			(input.url.searchParams.has("experience") ||
				input.url.pathname === `/product/${encodeURIComponent(input.navigation.experienceId)}`)
			? experienceRequirementsHref(input.navigation.experienceId, target)
			: "/catalog/tours?scope=tour"
	}
	return target.pathname + target.search
}

/** Legacy section entries and form responses share the canonical workspace. */
export function verificationSectionUrl(source: URL, tab: VerificationTab): URL {
	const target = copyVerificationNavigationQuery(
		new URL("/provider/settings/verification", source),
		source,
		tab
	)
	// A legacy entry may not yet declare a line; the workspace resolves it.
	target.searchParams.set("tab", tab)
	for (const key of ["result", "error"]) {
		const value = source.searchParams.get(key)
		if (value) target.searchParams.set(key, value)
	}
	return target
}

/** Visible return belongs only to evidence for the originating tour offer. */
export function tourEvidenceReturnHref(
	url: URL,
	navigation: VerificationNavigation | null
): string | null {
	if (
		navigation?.line !== "tour" ||
		!navigation.experienceId ||
		!["activity", "safety"].includes(navigation.tab)
	)
		return null
	const href = safeVerificationReturn(url.searchParams.get("returnTo"))
	if (!href || !href.startsWith("/rates/plans/")) return null
	const origin = new URL(href, url)
	return origin.searchParams.get("productId") === navigation.experienceId ? href : null
}
