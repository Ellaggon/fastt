import { getIdentityVendorStatus } from "@/lib/identity-vendor"
import { getPayoutRailStatus } from "@/lib/payout-rail"
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
	shouldSuppressVerificationStatusWarning,
	type ProviderTrustLink,
	type TrustLinkId,
	type VerificationCrossLink,
	type VerificationNextStep,
} from "@/lib/provider-trust-map"
import { buildProviderVerificationTrustSnapshot } from "@/lib/provider-verification-trust-snapshot"

export type VerificationTrustPanelId = TrustLinkId

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
	initialPanel: VerificationTrustPanelId
	listaReady: boolean
	trustMapComplete: boolean
	trustLinks: ProviderTrustLink[]
	wizardStepNumber: number
	wizardProgressPercent: number
	canManageDocuments: boolean
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
	legalNameComplete: boolean
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
}): Promise<ProviderVerificationWorkspaceModel> {
	const permissions = (params.sessionPermissions ?? {}) as Partial<ProviderPermissions>
	const canManageDocuments = Boolean(permissions.canManageDocuments)
	const canManageFiscality = Boolean(permissions.canManageFiscality)
	const canManagePayments = Boolean(permissions.canManagePayments)
	const requestedType = String(params.url.searchParams.get("type") ?? "").trim()
	const result = String(params.url.searchParams.get("result") ?? "").trim()
	const uploadErrorCode = String(params.url.searchParams.get("error") ?? "").trim()
	const error = uploadErrorCode

	const [trustSnapshot, openAssignments] = await Promise.all([
		buildProviderVerificationTrustSnapshot({ providerId: params.providerId }).catch(() => null),
		listOpenComplianceAssignments({ providerId: params.providerId }).catch(() => []),
	])

	const documents = trustSnapshot?.documents ?? []
	const kycSlots = trustSnapshot?.kycSlots ?? []
	const latestVerification = trustSnapshot?.latestVerification ?? null
	const taxConfiguration = trustSnapshot?.taxConfiguration ?? null
	const paymentAccounts = trustSnapshot?.paymentAccounts ?? []
	const trustLinks = trustSnapshot?.trustLinks ?? []
	const legalNameComplete = Boolean(trustSnapshot?.legalNameComplete)
	const trustMapComplete = isProviderTrustMapComplete(trustLinks)
	const listaReady = isVerificationListaReady({
		trustLinks,
		legalNameComplete,
	})
	const wizardStepNumber = trustSnapshot?.wizardStepNumber ?? 0
	const wizardProgressPercent = trustSnapshot?.wizardProgressPercent ?? 0

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
	const nextStep = resolveVerificationNextStep({
		trustLinks,
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
	const crossLinks = buildVerificationCrossLinks({
		legalNameComplete,
		nextStepLinkId: nextStep.linkId,
		fiscalReady: trustLinks.find((link) => link.id === "fiscal")?.uiState === "ready",
		paymentsReady: trustLinks.find((link) => link.id === "payments")?.uiState === "ready",
		onlyOffPage: true,
		ctaKind: nextStep.ctaKind ?? null,
	})
	const hasActionableDocumentGaps = kycSlots.some(
		(slot) => slot.state === "missing" || slot.state === "rejected"
	)
	const suppressStatusConsequence = shouldSuppressVerificationStatusWarning({
		ctaKind: nextStep.ctaKind ?? null,
		anchorsKyc: nextStep.anchorsKyc,
		hasActionableDocumentGaps,
	})

	const optionalDocumentsCount = documents.filter(
		(doc) => !(requiredKycDocumentTypes as readonly string[]).includes(doc.type)
	).length
	const optionalPendingCount = documents.filter(
		(doc) =>
			!(requiredKycDocumentTypes as readonly string[]).includes(doc.type) &&
			doc.status === "pending"
	).length

	return {
		initialPanel: resolveVerificationTrustPanelFromUrl(params.url),
		listaReady,
		trustMapComplete,
		trustLinks,
		wizardStepNumber,
		wizardProgressPercent,
		canManageDocuments,
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
		legalNameComplete,
		result,
		uploadErrorCode,
		error,
	}
}
