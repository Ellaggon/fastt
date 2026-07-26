import {
	db,
	desc,
	eq,
	Provider,
	ProviderProfile,
	ProviderVerification,
} from "@/shared/infrastructure/db/compat"
import {
	buildRequiredKycSlots,
	evaluateRequiredKycDocumentsComplete,
	isTaxDocumentSatisfiedByFiscal,
	listProviderDocuments,
} from "@/lib/provider-documents"
import {
	listProviderPaymentAccounts,
	type ProviderPaymentAccountRecord,
} from "@/lib/provider-payment-accounts"
import { getProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import {
	buildProviderTrustMap,
	isProviderTrustMapComplete,
	isVerificationListaReady,
} from "@/lib/provider-trust-map"
import { routes } from "@/lib/routes"

type Params = {
	providerId: string
	paymentAccounts?: ProviderPaymentAccountRecord[] | null
}

export async function buildProviderVerificationTrustSnapshot(params: Params) {
	const accountsPromise = params.paymentAccounts
		? Promise.resolve(params.paymentAccounts)
		: listProviderPaymentAccounts(params.providerId).catch(() => [])

	const [providerRow, latestVerification, documents, taxConfiguration, paymentAccounts] =
		await Promise.all([
			db
				.select({
					id: Provider.id,
					legalName: Provider.legalName,
					displayName: Provider.displayName,
					defaultCurrency: ProviderProfile.defaultCurrency,
				})
				.from(Provider)
				.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Provider.id))
				.where(eq(Provider.id, params.providerId))
				.limit(1)
				.then((rows) => rows[0] ?? null)
				.catch(() => null),
			db
				.select({
					status: ProviderVerification.status,
					reason: ProviderVerification.reason,
					createdAt: ProviderVerification.createdAt,
				})
				.from(ProviderVerification)
				.where(eq(ProviderVerification.providerId, params.providerId))
				.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
				.limit(1)
				.then((rows) => rows[0] ?? null)
				.catch(() => null),
			listProviderDocuments(params.providerId).catch(() => []),
			getProviderTaxConfiguration(params.providerId).catch(() => null),
			accountsPromise,
		])

	const taxDocSatisfiedByFiscal = isTaxDocumentSatisfiedByFiscal({
		businessRegistrationNumber: taxConfiguration?.businessRegistrationNumber,
		fiscalStatus: taxConfiguration?.status,
	})
	const kycSlots = buildRequiredKycSlots({
		documents,
		uploadBasePath: routes.providerSettingsVerification(),
		taxFiscal: taxConfiguration
			? {
					businessRegistrationNumber: taxConfiguration.businessRegistrationNumber,
					status: taxConfiguration.status,
					statusLabel: taxConfiguration.statusLabel,
					tinBureau: taxConfiguration.tinBureau
						? {
								matchStatus: taxConfiguration.tinBureau.matchStatus,
								matchLabel: taxConfiguration.tinBureau.matchLabel,
								hostNarrative: taxConfiguration.tinBureau.hostNarrative,
								message: taxConfiguration.tinBureau.message,
							}
						: null,
				}
			: null,
	})
	const kycEval = evaluateRequiredKycDocumentsComplete(documents, {
		taxDocumentSatisfiedByFiscal: taxDocSatisfiedByFiscal,
	})
	const legalNameComplete = Boolean(
		String(providerRow?.legalName ?? "").trim() && String(providerRow?.displayName ?? "").trim()
	)
	const paymentCounts = {
		verified: paymentAccounts.filter((row) => row.status === "verified").length,
		pending: paymentAccounts.filter((row) => row.status === "pending").length,
	}
	const trustLinks = buildProviderTrustMap({
		accountStatus: latestVerification?.status,
		documentsComplete: kycEval.complete,
		hasRejectedDocs: kycSlots.some((slot) => slot.state === "rejected"),
		hasSubmittedDocs: kycSlots.some((slot) => slot.state === "pending"),
		hasMissingDocs: kycSlots.some((slot) => slot.state === "missing"),
		fiscalStatus: taxConfiguration?.status ?? null,
		verifiedPaymentAccounts: paymentCounts.verified,
		pendingPaymentAccounts: paymentCounts.pending,
		legalNameComplete,
	})
	const trustMapComplete = isProviderTrustMapComplete(trustLinks)
	const trustFocusIndex = Math.max(
		0,
		trustLinks.findIndex((link) => link.isFocus)
	)
	const trustReadyCount = trustLinks.filter((link) => link.uiState === "ready").length

	return {
		defaultCurrency: providerRow?.defaultCurrency ?? "USD",
		documents,
		kycSlots,
		latestVerification,
		legalNameComplete,
		paymentAccounts,
		taxConfiguration,
		trustLinks,
		trustMapComplete,
		listaReady: isVerificationListaReady({ trustLinks, legalNameComplete }),
		wizardStepNumber:
			trustLinks.length > 0 ? (trustMapComplete ? trustLinks.length : trustFocusIndex + 1) : 0,
		wizardProgressPercent:
			trustLinks.length > 0 ? Math.round((trustReadyCount / trustLinks.length) * 100) : 0,
	}
}
