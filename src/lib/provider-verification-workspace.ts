import { getIdentityVendorStatus } from "@/lib/identity-vendor"
import { getPayoutRailStatus } from "@/lib/payout-rail"
import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"
import {
	isHolderDeclarationInReview,
	readProviderHolderProfile,
} from "@/lib/provider-holder-profile"
import { listOpenComplianceAssignments } from "@/lib/provider-compliance-ops"
import {
	requiredKycDocumentTypes,
	resolveKycUploadFocusType,
	type ProviderDocumentRecord,
	type ProviderKycSlot,
} from "@/lib/provider-documents"
import type { ProviderPaymentAccountRecord } from "@/lib/provider-payment-accounts"
import type { ProviderPermissions } from "@/lib/provider-permissions"
import { resolveProviderRejectCategory } from "@/lib/provider-reject-categories"
import type { ProviderTaxConfigurationRecord } from "@/lib/provider-tax-configuration"
import {
	buildVerificationCrossLinks,
	isProviderTrustMapComplete,
	isVerificationListaReady,
	resolveVerificationNextStep,
	summarizeProviderTrustProgress,
	shouldSuppressVerificationStatusWarning,
	type ProviderTrustLink,
	type TrustLinkId,
	type VerificationCrossLink,
	type VerificationNextStep,
} from "@/lib/provider-trust-map"
import { buildProviderVerificationTrustSnapshot } from "@/lib/provider-verification-trust-snapshot"
import {
	readTourComplianceContext,
	storedTourActivityClasses,
} from "@/lib/tours/tour-compliance-context"
import {
	loadProviderVerificationResolution,
	type LoadedVerificationResolution,
} from "@/lib/verification/requirement-context"
import {
	collectionModelForCommercialLine,
	readProviderCommercialLineState,
	type CommercialLineRecord,
} from "@/lib/verification/commercial-lines"
import {
	accountKycDocumentTypes,
	holderRequiresBusinessRegistration,
	packDocumentTypes,
} from "@/lib/verification/requirement-resolver"
import {
	buildVerificationScreenSections,
	type VerificationScreen,
	type VerificationScreenItemState,
} from "@/lib/verification/screen-sections"
import {
	buildTourVerificationPlaybook,
	trustStateFromKycSlotState,
	resolveVerificationNavigation,
	summarizeVerificationPlaybook,
	verificationNavigationHref,
	type VerificationNavigation,
	type VerificationPlaybookTab,
	type VerificationTab,
} from "@/lib/verification/navigation"
import {
	buildTourVerificationReadiness,
	type TourVerificationReadiness,
} from "@/lib/provider-tour-verification"
import { and, asc, db, eq, Product } from "@/shared/infrastructure/db/compat"

export type VerificationTrustPanelId = VerificationTab

export const VERIFICATION_WORKSPACE_PATHS = [
	"/provider/settings/verification",
	"/provider/settings/verification/fiscal",
	"/provider/settings/verification/payments",
] as const

type SlaAssignment = {
	slaDueAt: Date | string | null
	slaState: "ok" | "due_soon" | "overdue" | "done"
}

export type ProviderVerificationWorkspaceModel = {
	activeSectionId: VerificationTrustPanelId
	navigation: VerificationNavigation | null
	tourPlaybook: VerificationPlaybookTab[]
	tourProducts: Array<{ id: string; name: string | null }>
	listaReady: boolean
	trustMapComplete: boolean
	trustLinks: ProviderTrustLink[]
	readyCount: number
	totalCount: number
	inReviewCount: number
	actionRequiredCount: number
	notStartedCount: number
	notEvaluableCount: number
	readinessPercent: number
	nextActionId: TrustLinkId | null
	canManageDocuments: boolean
	canEditTourContext: boolean
	canManageFiscality: boolean
	canManagePayments: boolean
	providerRoleLabel: string
	requestedType: string
	documents: ProviderDocumentRecord[]
	kycSlots: ProviderKycSlot[]
	latestVerification: {
		status?: string | null
		reason?: string | null
		createdAt?: Date | string | null
	} | null
	verificationAssignment: SlaAssignment | null
	documentAssignments: Record<string, SlaAssignment>
	fiscalAssignment: SlaAssignment | null
	paymentAssignments: Record<string, SlaAssignment>
	taxConfiguration: ProviderTaxConfigurationRecord | null
	paymentAccounts: ProviderPaymentAccountRecord[]
	defaultCurrency: string
	payoutRail: ReturnType<typeof getPayoutRailStatus>
	identityVendorStatus: ReturnType<typeof getIdentityVendorStatus>
	nextStep: VerificationNextStep
	crossLinks: VerificationCrossLink[]
	suppressStatusConsequence: boolean
	optionalDocumentsCount: number
	optionalPendingCount: number
	/**
	 * Per-tour diagnosis. Line sections on this page own the progress; this
	 * list stays inside Experiencias.
	 */
	tourVerification: TourVerificationReadiness[]
	tourContext: Awaited<ReturnType<typeof readTourComplianceContext>> | null
	commercialLine: CommercialLineRecord | null
	tourEvidenceOptions: {
		activity: Array<{ value: string; label: string; description: string }>
		safety: Array<{ value: string; label: string; description: string }>
	}
	screen: VerificationScreen | null
	legalNameComplete: boolean
	holderType: "persona_natural" | "entidad" | null
	holderDeclarationInReview: boolean
	/** Mercantile uploads kept after switching to persona natural (read-only). */
	historicalBusinessRegistrationDocuments: ProviderDocumentRecord[]
	result: string
	uploadErrorCode: string
	error: string
}

function normalizePath(pathname: string): string {
	return pathname.replace(/\/$/, "") || "/"
}

export function isVerificationWorkspacePath(pathname: string): boolean {
	return (VERIFICATION_WORKSPACE_PATHS as readonly string[]).includes(normalizePath(pathname))
}

/** The four hotel tabs stay only where that step still applies. */
export function visibleVerificationTrustLinks(
	links: readonly ProviderTrustLink[],
	screen: VerificationScreen | null,
	requiresBusinessRegistration = true
): ProviderTrustLink[] {
	if (!screen) return [...links]
	if (screen.sections.some((section) => section.id === "lodging")) return [...links]
	const asksForRegistration =
		requiresBusinessRegistration &&
		screen.sections.some((section) =>
			section.items.some((item) => item.id === "shared.business_registration")
		)
	return links.filter((link) => {
		if (link.id === "payments") return screen.paymentsCountsForSelling
		if (link.id === "business") return asksForRegistration
		return link.id === "identity" || link.id === "fiscal"
	})
}

export function resolveVerificationTrustPanelFromUrl(url: URL): VerificationTrustPanelId {
	const path = normalizePath(url.pathname)
	if (path.endsWith("/verification/payments")) return "payments"
	if (path.endsWith("/verification/fiscal")) return "fiscal"
	if (url.searchParams.get("type")) return "business"
	if (url.hash === "#kyc-slots" || url.hash.startsWith("#kyc-slot-")) return "business"
	return "identity"
}

export async function loadProviderVerificationWorkspace(params: {
	providerId: string
	sessionPermissions?: Partial<ProviderPermissions> | null
	providerRoleLabel: string
	url: URL
	verificationResolution?: LoadedVerificationResolution
}): Promise<ProviderVerificationWorkspaceModel> {
	const permissions = (params.sessionPermissions ?? {}) as Partial<ProviderPermissions>
	const canManageDocuments = Boolean(permissions.canManageDocuments)
	const canEditTourContext = Boolean(permissions.canEditProfile)
	const canManageFiscality = Boolean(permissions.canManageFiscality)
	const canManagePayments = Boolean(permissions.canManagePayments)
	const requestedType = String(params.url.searchParams.get("type") ?? "").trim()
	const result = String(params.url.searchParams.get("result") ?? "").trim()
	const uploadErrorCode = String(params.url.searchParams.get("error") ?? "").trim()
	const error = uploadErrorCode

	const loadedResolution =
		params.verificationResolution ?? (await loadProviderVerificationResolution(params.providerId))
	const holder = await readProviderHolderProfile(params.providerId)
	const holderType =
		holder?.holderType === "persona_natural" || holder?.holderType === "entidad"
			? holder.holderType
			: null
	const kycDocumentTypes = accountKycDocumentTypes({
		enforced: loadedResolution.enforced,
		resolution: loadedResolution.resolution,
		holderType,
	})
	const packTypes =
		loadedResolution.enforced && loadedResolution.resolution
			? new Set<string>(packDocumentTypes(loadedResolution.resolution))
			: null

	const [trustSnapshot, openAssignments, tourProducts, commercialLineState] = await Promise.all([
		buildProviderVerificationTrustSnapshot({
			providerId: params.providerId,
			kycDocumentTypes,
		}).catch(() => null),
		listOpenComplianceAssignments({ providerId: params.providerId }).catch(() => []),
		db
			.select({
				id: Product.id,
				name: Product.name,
				publicationState: Product.publicationState,
			})
			.from(Product)
			.where(and(eq(Product.providerId, params.providerId), eq(Product.productType, "tour")))
			.orderBy(asc(Product.creationDate))
			.catch(() => []),
		readProviderCommercialLineState(params.providerId),
	])
	const requestedExperience = params.url.searchParams.get("experience")
	const selectedExperienceId = tourProducts.some((product) => product.id === requestedExperience)
		? requestedExperience
		: (tourProducts[0]?.id ?? null)
	const displayedTours = tourProducts.filter((product) => product.id === selectedExperienceId)
	const requestedLine = params.url.searchParams.get("line")
	const selectedLine = loadedResolution.lines.includes(requestedLine as "lodging" | "tour")
		? (requestedLine as "lodging" | "tour")
		: (loadedResolution.lines[0] ?? null)
	const selectedLineCollectionModel = collectionModelForCommercialLine(
		commercialLineState.lines,
		selectedLine
	)
	const commercialLine =
		commercialLineState.lines.find((entry) => entry.line === selectedLine) ?? null
	const tourContext = selectedExperienceId
		? await readTourComplianceContext(selectedExperienceId, params.providerId)
		: null
	const appliesToSelectedTour = (requirement: {
		layer: string
		scopes: { productIds: string[] }
	}) =>
		requirement.layer !== "tour" ||
		!selectedExperienceId ||
		requirement.scopes.productIds.length === 0 ||
		requirement.scopes.productIds.includes(selectedExperienceId)
	const tourRequirements = (loadedResolution.resolution?.requirements ?? []).filter(
		(requirement) =>
			requirement.layer === "tour" &&
			Boolean(requirement.documentType && requirement.uploadValue) &&
			appliesToSelectedTour(requirement)
	)
	const tourEvidenceOptions = {
		activity: tourRequirements.filter((requirement) => requirement.id !== "tour.insurance"),
		safety: tourRequirements.filter((requirement) => requirement.id === "tour.insurance"),
	}
	const mapEvidenceOption = (requirement: (typeof tourRequirements)[number]) => ({
		value: requirement.uploadValue as string,
		label: requirement.label,
		description: requirement.appliesBecause,
	})
	const tourVerification: TourVerificationReadiness[] = await Promise.all(
		displayedTours.map(async (product) => {
			const resolved = await resolveProductCommercialDiagnosis({
				providerId: params.providerId,
				productId: product.id,
				holder,
				documents: trustSnapshot?.documents,
			})
			return buildTourVerificationReadiness({ product, diagnosis: resolved.diagnosis })
		})
	)

	const documents = trustSnapshot?.documents ?? []
	const kycSlots = trustSnapshot?.kycSlots ?? []
	const historicalBusinessRegistrationDocuments = holderRequiresBusinessRegistration(holderType)
		? []
		: documents.filter((document) => document.type === "business_registration")
	const latestVerification = trustSnapshot?.latestVerification ?? null
	const taxConfiguration = trustSnapshot?.taxConfiguration ?? null
	const paymentAccounts = trustSnapshot?.paymentAccounts ?? []
	const trustLinks = trustSnapshot?.trustLinks ?? []
	const legalNameComplete = Boolean(trustSnapshot?.legalNameComplete)
	const holderDeclarationInReview = isHolderDeclarationInReview(holder)
	const tourIdentityPlaybookState = (slotState: ReturnType<typeof trustStateFromKycSlotState>) => {
		if (!legalNameComplete) return "action_needed" as const
		if (holderDeclarationInReview) return "in_review" as const
		return slotState
	}
	const trustMapComplete = isProviderTrustMapComplete(trustLinks)
	const listaReady = isVerificationListaReady({
		trustLinks,
		legalNameComplete,
	})
	const readyCount = trustSnapshot?.readyCount ?? 0
	const totalCount = trustSnapshot?.totalCount ?? 0
	const inReviewCount = trustSnapshot?.inReviewCount ?? 0
	const actionRequiredCount = trustSnapshot?.actionRequiredCount ?? 0
	const notStartedCount = trustSnapshot?.notStartedCount ?? 0
	const readinessPercent = trustSnapshot?.readinessPercent ?? 0
	const nextActionId = trustSnapshot?.nextActionId ?? null

	const verificationAssignment =
		openAssignments.find(
			(row) => row.domain === "verification" && row.entityId === params.providerId
		) ?? null
	const fiscalAssignment =
		openAssignments.find((row) => row.domain === "fiscal" && row.entityId === params.providerId) ??
		null
	const documentAssignments = Object.fromEntries(
		openAssignments
			.filter((row) => row.domain === "documents")
			.map((row) => [row.entityId, row] as const)
	)
	const paymentAssignments = Object.fromEntries(
		openAssignments.filter((row) => row.domain === "payments").map((row) => [row.entityId, row])
	)

	const paymentsState: VerificationScreenItemState = paymentAccounts.some(
		(account) => account.status === "verified"
	)
		? "ready"
		: paymentAccounts.some((account) => account.status === "pending")
			? "in_review"
			: paymentAccounts.some((account) => account.status === "requires_attention")
				? "action_needed"
				: "not_started"
	const screen =
		loadedResolution.enforced && loadedResolution.resolution
			? buildVerificationScreenSections({
					lines: loadedResolution.lines,
					collectionModel: selectedLineCollectionModel,
					requirements: loadedResolution.resolution.requirements.filter(appliesToSelectedTour),
					legalNameComplete,
					accountStatus: latestVerification?.status ?? null,
					fiscalStatus: taxConfiguration?.status ?? null,
					paymentsState,
					documents: documents.map((document) => ({
						type: document.type,
						status: document.status,
					})),
					evidence: documents.map((document) => ({
						id: document.id,
						type: document.type,
						status: document.status,
						expiresAt: document.expiresAt,
						subjectType: document.subjectType,
						subjectReference: document.subjectReference,
						scopes: document.scopes.map((scope) => ({
							scopeType: scope.scopeType,
							productId: scope.productId,
							resourceId: scope.resourceId,
							territoryCode: scope.territoryCode,
							activityClass: scope.activityClass,
						})),
					})),
					tourOperation: selectedExperienceId
						? {
								productId: selectedExperienceId,
								territoryCodes: tourContext?.jurisdictionCode ? [tourContext.jurisdictionCode] : [],
								activityClasses: storedTourActivityClasses(tourContext?.activityClassesJson),
							}
						: null,
					slots: kycSlots.map((slot) => ({ type: slot.type, state: slot.state })),
				})
			: null
	const resolvedNavigation = screen
		? resolveVerificationNavigation({
				url: params.url,
				lines: loadedResolution.lines,
				experienceIds: tourProducts.map((product) => product.id),
				fasttCollects: screen.paymentsCountsForSelling,
			})
		: null
	const navigation =
		resolvedNavigation && resolvedNavigation.line === "tour"
			? { ...resolvedNavigation, experienceId: selectedExperienceId }
			: resolvedNavigation
	const visibleTrustLinks = visibleVerificationTrustLinks(
		trustLinks,
		screen,
		holderRequiresBusinessRegistration(holderType)
	)
	const requestedPanel = resolveVerificationTrustPanelFromUrl(params.url)
	const activeSectionId =
		navigation?.tab ??
		(visibleTrustLinks.some((link) => link.id === requestedPanel) ? requestedPanel : "identity")

	const focusTypeResolved = resolveKycUploadFocusType({
		slots: kycSlots,
		focusType: requestedType,
	})
	const uploadFocusSlot = focusTypeResolved
		? (kycSlots.find((slot) => slot.type === focusTypeResolved) ?? null)
		: null
	const taxSlot = kycSlots.find((slot) => slot.type === "tax_document") ?? null
	const focusSlot =
		uploadFocusSlot ??
		(taxSlot &&
		taxSlot.state !== "verified" &&
		taxSlot.fiscalBridge &&
		(taxSlot.fiscalBridge.suppressBlindUpload || taxSlot.fiscalBridge.allowOptionalUpload)
			? taxSlot
			: null) ??
		kycSlots.find((slot) => slot.state === "missing" || slot.state === "rejected") ??
		null

	const accountRejectCategory = resolveProviderRejectCategory(
		latestVerification?.reason,
		"verification"
	)
	const resolvedNextStep = resolveVerificationNextStep({
		trustLinks: visibleTrustLinks,
		focusSlot: focusSlot
			? {
					type: focusSlot.type,
					label: focusSlot.label,
					state: focusSlot.state,
					fiscalBridge: focusSlot.fiscalBridge
						? {
								mode: focusSlot.fiscalBridge.mode,
								fiscalHref: focusSlot.fiscalBridge.fiscalHref,
								title: focusSlot.fiscalBridge.title,
								body: focusSlot.fiscalBridge.body,
								ctaLabel: focusSlot.fiscalBridge.ctaLabel,
								suppressBlindUpload: focusSlot.fiscalBridge.suppressBlindUpload,
							}
						: null,
					rejectCategoryLabel: focusSlot.rejectCategoryLabel,
				}
			: null,
		canManageDocuments,
		legalNameComplete,
		roleLabel: params.providerRoleLabel,
		kycProgress: {
			ready: kycSlots.filter((s) => s.state === "verified").length,
			total: kycSlots.length,
		},
		accountStatus: latestVerification?.status,
		accountRejectCategoryLabel: accountRejectCategory?.matched ? accountRejectCategory.label : null,
	})
	const nextStep =
		screen &&
		!screen.paymentsCountsForSelling &&
		resolvedNextStep.consequenceLine?.includes("liquid")
			? {
					...resolvedNextStep,
					consequenceLine: "Hasta que este documento esté verificado, no puedes publicar.",
				}
			: resolvedNextStep
	const crossLinks = buildVerificationCrossLinks({
		legalNameComplete,
		nextStepLinkId: nextStep.linkId,
		fiscalReady: trustLinks.find((link) => link.id === "fiscal")?.uiState === "ready",
		paymentsReady: trustLinks.find((link) => link.id === "payments")?.uiState === "ready",
		onlyOffPage: true,
		ctaKind: nextStep.ctaKind ?? null,
	}).filter((link) => screen?.paymentsCountsForSelling !== false || link.id !== "payments")
	const hasActionableDocumentGaps = kycSlots.some(
		(slot) => slot.state === "missing" || slot.state === "rejected"
	)
	const suppressStatusConsequence = shouldSuppressVerificationStatusWarning({
		ctaKind: nextStep.ctaKind ?? null,
		anchorsKyc: nextStep.anchorsKyc,
		hasActionableDocumentGaps,
	})

	const isLinePackDocument = (type: string) =>
		packTypes
			? packTypes.has(type)
			: !(requiredKycDocumentTypes as readonly string[]).includes(type)
	const optionalDocumentsCount = documents.filter((doc) => isLinePackDocument(doc.type)).length
	const optionalPendingCount = documents.filter(
		(doc) => isLinePackDocument(doc.type) && doc.status === "pending"
	).length

	const tourSection = screen?.sections.find((section) => section.id === "tour") ?? null
	const countingTourItems = (tourSection?.items ?? []).filter((item) => item.countsTowardProgress)
	const contextComplete = Boolean(
		tourContext?.operatingRole &&
		tourContext.jurisdictionCode &&
		storedTourActivityClasses(tourContext.activityClassesJson).length > 0
	)
	const linkState = (id: TrustLinkId) =>
		trustLinks.find((link) => link.id === id)?.uiState ?? "not_started"
	const tourRequiresRegistration =
		holderRequiresBusinessRegistration(holderType) &&
		Boolean(
			screen?.sections.some((section) =>
				section.items.some((item) => item.id === "shared.business_registration")
			)
		)
	const tourIdentityFromSlots = !legalNameComplete
		? ("action_needed" as const)
		: trustStateFromKycSlotState(kycSlots.find((slot) => slot.type === "government_id")?.state)
	const tourRegistrationFromSlots = tourRequiresRegistration
		? trustStateFromKycSlotState(
				kycSlots.find((slot) => slot.type === "business_registration")?.state
			)
		: null
	const tourPlaybook =
		navigation?.line === "tour"
			? buildTourVerificationPlaybook({
					tabs: navigation.tabs,
					hrefFor: (tab) =>
						verificationNavigationHref({
							url: params.url,
							navigation,
							line: "tour",
							tab,
						}),
					identity: tourIdentityPlaybookState(tourIdentityFromSlots),
					registration: tourRegistrationFromSlots,
					fiscal: linkState("fiscal"),
					payments: linkState("payments"),
					activity: countingTourItems
						.filter(
							(item) => item.id !== "tour.insurance" && item.id !== "tour.operating_role_missing"
						)
						.map((item) => item.state),
					safety: countingTourItems
						.filter((item) => item.id === "tour.insurance")
						.map((item) => item.state),
					contextComplete,
					policyResolved: tourVerification[0]?.state !== "waiting_on_fastt",
				})
			: []
	const tourProgress = tourPlaybook.length ? summarizeVerificationPlaybook(tourPlaybook) : null
	const headerProgress =
		tourProgress ?? (screen ? summarizeProviderTrustProgress(visibleTrustLinks) : null)

	return {
		activeSectionId,
		navigation,
		tourPlaybook,
		tourProducts: tourProducts.map((product) => ({ id: product.id, name: product.name })),
		listaReady,
		trustMapComplete,
		trustLinks: visibleTrustLinks,
		readyCount: headerProgress?.readyCount ?? readyCount,
		totalCount: headerProgress?.totalCount ?? totalCount,
		inReviewCount: headerProgress?.inReviewCount ?? inReviewCount,
		actionRequiredCount: headerProgress?.actionRequiredCount ?? actionRequiredCount,
		notStartedCount: headerProgress?.notStartedCount ?? notStartedCount,
		notEvaluableCount: tourProgress?.notEvaluableCount ?? 0,
		readinessPercent: headerProgress?.readinessPercent ?? readinessPercent,
		screen,
		nextActionId,
		canManageDocuments,
		canEditTourContext,
		canManageFiscality,
		canManagePayments,
		providerRoleLabel: params.providerRoleLabel,
		requestedType,
		documents,
		kycSlots,
		latestVerification,
		verificationAssignment,
		documentAssignments,
		fiscalAssignment,
		paymentAssignments,
		taxConfiguration,
		paymentAccounts,
		defaultCurrency: trustSnapshot?.defaultCurrency ?? "USD",
		payoutRail: getPayoutRailStatus(),
		identityVendorStatus: getIdentityVendorStatus(),
		nextStep,
		crossLinks,
		suppressStatusConsequence,
		optionalDocumentsCount,
		optionalPendingCount,
		tourVerification,
		tourContext,
		commercialLine,
		tourEvidenceOptions: {
			activity: tourEvidenceOptions.activity.map(mapEvidenceOption),
			safety: tourEvidenceOptions.safety.map(mapEvidenceOption),
		},
		legalNameComplete,
		holderType,
		holderDeclarationInReview,
		historicalBusinessRegistrationDocuments,
		result,
		uploadErrorCode,
		error,
	}
}
