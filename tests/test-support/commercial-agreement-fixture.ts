import {
	db,
	ProviderUser,
	User,
	ProviderHolderProfile,
	ProviderVerification,
	ProviderTaxConfiguration,
	ProviderCommercialLine,
} from "@/shared/infrastructure/db/compat"
import {
	commercialAgreementStatus,
	requestCommercialAgreement,
	offerCommercialAgreement,
	acceptCommercialAgreement,
} from "@/modules/financial/commercial-agreements"

/** Non-binding fixture contract, created through the same commands as the application. */
export async function ensureTourCommercialAgreementFixture(providerId: string) {
	process.env.FASTT_TOUR_AGREEMENT_MODE = "enforce"
	process.env.FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE = "non-binding-isolated-test-fixture"
	process.env.FASTT_TOUR_AGREEMENT_PROVIDER_IDS = [
		...new Set([
			...(process.env.FASTT_TOUR_AGREEMENT_PROVIDER_IDS ?? "").split(",").filter(Boolean),
			providerId,
		]),
	].join(",")
	const current = await commercialAgreementStatus(providerId)
	if (current.state === "active") return
	if (current.agreement?.status === "offered") {
		await acceptCommercialAgreement({
			providerId,
			agreementId: current.agreement.id,
			userId: current.agreement.authorizedSignerUserId!,
			termsHash: current.agreement.termsHash!,
			consent: true,
		})
		return
	}
	const actor = `agreement-fixture-${crypto.randomUUID()}`
	await db.insert(User).values({
		id: actor,
		email: `${actor}@fastt.test`,
		username: actor,
		registrationDate: new Date(),
	})
	await db
		.insert(ProviderUser)
		.values({ id: crypto.randomUUID(), providerId, userId: actor, role: "owner" })
	await db
		.insert(ProviderHolderProfile)
		.values({
			providerId,
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: "BO",
			declarationStatus: "verified",
		})
		.onConflictDoUpdate({
			target: ProviderHolderProfile.providerId,
			set: { declarationStatus: "verified" },
		})
	await db.insert(ProviderVerification).values({
		id: crypto.randomUUID(),
		providerId,
		status: "approved",
		reviewedBy: actor,
		reviewedAt: new Date(),
	})
	await db
		.insert(ProviderTaxConfiguration)
		.values({ providerId, status: "verified", businessRegistrationNumber: "fixture-tax" })
		.onConflictDoUpdate({
			target: ProviderTaxConfiguration.providerId,
			set: { status: "verified", businessRegistrationNumber: "fixture-tax" },
		})
	await db
		.insert(ProviderCommercialLine)
		.values({
			id: crypto.randomUUID(),
			providerId,
			line: "tour",
			source: "onboarding",
			collectionModel: "property_collect",
		})
		.onConflictDoUpdate({
			target: [ProviderCommercialLine.providerId, ProviderCommercialLine.line],
			set: { collectionModel: "property_collect" },
		})
	const request = await requestCommercialAgreement(providerId, actor)
	const proposal = await offerCommercialAgreement({
		providerId,
		agreementId: request.id,
		actorUserId: actor,
		signerUserId: actor,
		representationReference: "fixture-reviewed-representation",
		terms: {
			commissionPercent: 0,
			commissionBase: "Importe del servicio de prueba, sin efecto económico real.",
			currency: "USD",
			effectiveFrom: "2020-01-01",
			effectiveTo: "2099-12-31",
			paymentTiming: "Cobro directo ficticio de prueba.",
			cancellationTerms: "Condiciones ficticias de cancelación para pruebas automatizadas.",
			settlementTerms: "Sin liquidación real: escenario aislado de pruebas automatizadas.",
			fiscalResponsibilities: "Datos ficticios sin efecto fiscal en un entorno de prueba aislado.",
			fullTerms:
				"Acuerdo exclusivamente ficticio, sin efecto vinculante ni comercial, usado para verificar el circuito técnico de reservas en una base de datos aislada de pruebas.",
			documentReference: "non-binding-automated-test-fixture",
		},
	})
	await acceptCommercialAgreement({
		providerId,
		agreementId: proposal.id,
		userId: actor,
		termsHash: proposal.termsHash!,
		consent: true,
	})
}
