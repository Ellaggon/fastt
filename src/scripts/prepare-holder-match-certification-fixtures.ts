import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	ComplianceCase,
	db,
	eq,
	Provider,
	ProviderPaymentAccount,
} from "@/shared/infrastructure/db/compat"
import { synchronizeComplianceCase } from "@/lib/casework/compliance-casework"

/**
 * Creates disposable, non-commercial payment cases for manually certifying
 * the holder-name matching controls in the deployed Casework UI.
 *
 * Nothing is written unless both the explicit confirmation and --apply are
 * supplied. The fixture providers are inactive, integration-only and marked
 * as fixture data so marketplace surfaces cannot treat them as real sellers.
 */
const APPLY = process.argv.includes("--apply")
const CONFIRMED = process.env.CONFIRM_HOLDER_MATCH_CERTIFICATION === "prepare"

const fixtures = [
	{
		providerId: "provider_holder_match_probable_certification",
		paymentAccountId: "payment_holder_match_probable_certification",
		displayName: "FASTT · Certificación de titularidad probable",
		accountHolderName: "FASTT Command Centre V2 Certification",
		expectation: "probable",
	},
	{
		providerId: "provider_holder_match_mismatch_certification",
		paymentAccountId: "payment_holder_match_mismatch_certification",
		displayName: "FASTT · Certificación de titularidad distinta",
		accountHolderName: "Empresa Ajena Ltda.",
		expectation: "mismatch",
	},
] as const

function assertion(condition: unknown, code: string): asserts condition {
	if (!condition) throw new Error(code)
}

async function prepare() {
	assertion(APPLY, "HOLDER_MATCH_CERTIFICATION_APPLY_REQUIRED")
	assertion(CONFIRMED, "HOLDER_MATCH_CERTIFICATION_CONFIRMATION_REQUIRED")

	const now = new Date()
	const prepared = []
	for (const fixture of fixtures) {
		await db
			.insert(Provider)
			.values({
				id: fixture.providerId,
				legalName: "FASTT Command Center V2 Certification",
				displayName: fixture.displayName,
				status: "inactive",
				accountPurpose: "integration_certification",
				dataClassification: "fixture",
				createdAt: now,
			})
			.onConflictDoNothing()

		await db
			.insert(ProviderPaymentAccount)
			.values({
				id: fixture.paymentAccountId,
				providerId: fixture.providerId,
				status: "pending",
				provider: "bank_transfer",
				currency: "BOB",
				accountHolderName: fixture.accountHolderName,
				bankName: "Banco de Pruebas",
				country: "BO",
				accountNumberLast4: "0000",
				accountReference: "masked:0000",
				payoutSchedule: "manual",
				metadataJson: {
					fixture: "holder_match_certification",
					expectation: fixture.expectation,
					containsCustomerData: false,
				},
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()

		const complianceCase = await synchronizeComplianceCase({
			providerId: fixture.providerId,
			domain: "payments",
			sourceType: "ProviderPaymentAccount",
			sourceRef: fixture.paymentAccountId,
			summary: `Certificación controlada: coincidencia de titular ${fixture.expectation}`,
		})

		prepared.push({
			expectation: fixture.expectation,
			providerId: fixture.providerId,
			paymentAccountId: fixture.paymentAccountId,
			caseId: complianceCase.caseId,
			casePath: `/admin/cases/${complianceCase.caseId}`,
		})
	}

	console.log(JSON.stringify({ prepared: true, fixtures: prepared }, null, 2))
}

async function verify() {
	const rows = await Promise.all(
		fixtures.map(async (fixture) => {
			const [paymentAccount] = await db
				.select({ id: ProviderPaymentAccount.id, holder: ProviderPaymentAccount.accountHolderName })
				.from(ProviderPaymentAccount)
				.where(eq(ProviderPaymentAccount.id, fixture.paymentAccountId))
			const [complianceCase] = await db
				.select({ id: ComplianceCase.id, status: ComplianceCase.status })
				.from(ComplianceCase)
				.where(eq(ComplianceCase.providerId, fixture.providerId))
			return { expectation: fixture.expectation, paymentAccount, complianceCase }
		})
	)
	console.log(JSON.stringify({ verified: true, fixtures: rows }, null, 2))
}

try {
	if (APPLY) await prepare()
	else await verify()
} finally {
	await closePostgresClients()
}
