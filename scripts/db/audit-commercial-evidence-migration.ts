import { config as loadDotenv } from "dotenv"
import postgres from "postgres"

import {
	classifyCommercialEvidenceMigration,
	classifyProviderVerticals,
} from "../../src/lib/commercial-policy/migration-audit"
import { stripInvalidPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"
import {
	databaseFingerprint,
	getFasttDataEnvironment,
} from "../../src/shared/infrastructure/db/data-environment"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

/**
 * This audit must never quietly run against test data when an operator asked
 * for production. Test credentials are intentionally loaded only for an
 * explicit test run. A production run also needs an expected, non-secret
 * fingerprint so its output can be trusted as a production inventory.
 */
function prepareAuditEnvironment() {
	stripInvalidPostgresEnv()
	const requested = String(process.env.FASTT_DATA_ENV ?? "").trim()
	if (requested === "test") {
		loadDotenv({ path: ".env.test", override: false })
		delete process.env.DATABASE_URL
		delete process.env.DIRECT_URL
	} else {
		loadDotenv({ path: ".env", override: false })
	}
	stripInvalidPostgresEnv()
	const dataEnvironment = getFasttDataEnvironment()
	const connectionUrl = getPostgresConnectionUrl("direct")
	const fingerprint = databaseFingerprint(connectionUrl)
	if (dataEnvironment === "production") {
		const expectedFingerprint = String(process.env.FASTT_AUDIT_DATABASE_FINGERPRINT ?? "").trim()
		if (!expectedFingerprint) {
			throw new Error(
				"Production audit requires FASTT_AUDIT_DATABASE_FINGERPRINT to confirm the target database."
			)
		}
		if (expectedFingerprint !== fingerprint) {
			throw new Error(
				"Production audit database fingerprint does not match FASTT_AUDIT_DATABASE_FINGERPRINT."
			)
		}
	}
	return { dataEnvironment, connectionUrl, fingerprint }
}

type EvidenceRow = {
	documentId: string
	providerId: string
	type: string
	status: string
	expiresAt: Date | null
	scopeCount: number
	scopeTypes: string[]
}

type ProviderRow = {
	providerId: string
	productTypes: string[]
}

type PolicyRow = {
	vertical: string
	policyCount: number
	signedPublishedCount: number
}

type TourContextRow = {
	productId: string
	providerId: string
	operatingRole: string | null
	activityClasses: unknown
	jurisdictionCode: string | null
}

function missingTourContext(row: TourContextRow): boolean {
	const activities = Array.isArray(row.activityClasses) ? row.activityClasses : []
	return !row.operatingRole || !row.jurisdictionCode || activities.length === 0
}

async function main() {
	const verbose = process.argv.includes("--verbose")
	const summaryOnly = process.argv.includes("--summary")
	const target = prepareAuditEnvironment()
	const sql = postgres(target.connectionUrl, { max: 1, prepare: false })
	try {
		const report = await sql.begin(async (tx) => {
			await tx`set transaction read only`
			const policySchema = await tx<
				Array<{
					hasContext: boolean
					hasRuleSources: boolean
					hasApprovals: boolean
				}>
			>`
				select
					exists(
						select 1 from information_schema.columns
						where table_schema = 'public'
							and table_name = 'CompliancePolicyVersion'
							and column_name = 'contextJson'
					) as "hasContext",
					exists(
						select 1 from information_schema.columns
						where table_schema = 'public'
							and table_name = 'ComplianceRequirementRule'
							and column_name in ('sourceKind', 'sourceReference', 'sourceCheckedAt')
						group by table_name
						having count(*) = 3
					) as "hasRuleSources",
					to_regclass('public."CommercialPolicyApproval"') is not null as "hasApprovals"
			`
			const policySchemaReady = Boolean(
				policySchema[0]?.hasContext &&
				policySchema[0]?.hasRuleSources &&
				policySchema[0]?.hasApprovals
			)
			const [evidence, providers, policies, tourContexts] = await Promise.all([
				tx<EvidenceRow[]>`
					select
						d."id" as "documentId",
						d."providerId" as "providerId",
						d."type",
						d."status",
						d."expiresAt" as "expiresAt",
						count(s."id")::int as "scopeCount",
						coalesce(array_agg(distinct s."scopeType") filter (where s."scopeType" is not null), '{}') as "scopeTypes"
					from "ProviderDocument" d
					left join "ProviderDocumentScope" s on s."documentId" = d."id"
					group by d."id", d."providerId", d."type", d."status", d."expiresAt"
					order by d."providerId", d."createdAt", d."id"
				`,
				tx<ProviderRow[]>`
					select
						pr."id" as "providerId",
						coalesce(array_agg(distinct lower(p."productType")) filter (where p."productType" is not null), '{}') as "productTypes"
					from "Provider" pr
					left join "Product" p on p."providerId" = pr."id"
					group by pr."id"
					order by pr."id"
				`,
				policySchemaReady
					? tx<PolicyRow[]>`
					select
						ps."vertical" as "vertical",
						count(pv."id")::int as "policyCount",
						count(pv."id") filter (
							where pv."status" = 'published'
							and pv."approvedBy" is not null
							and pv."approvedAt" is not null
							and coalesce(pv."approvalReference", '') <> ''
							and coalesce(jsonb_array_length(pv."contextJson"->'operatingRoles'), 0) > 0
							and coalesce(jsonb_array_length(pv."contextJson"->'activityClasses'), 0) > 0
							and coalesce(jsonb_array_length(pv."contextJson"->'jurisdictionCodes'), 0) > 0
							and 3 = (
								select count(distinct approval."approvalArea")
								from "CommercialPolicyApproval" approval
								where approval."policyVersionId" = pv."id"
									and coalesce(approval."approvalReference", '') <> ''
							)
							and exists (
								select 1 from "ComplianceRequirementRule" requirement
								where requirement."policyVersionId" = pv."id"
							)
							and not exists (
								select 1 from "ComplianceRequirementRule" requirement
								where requirement."policyVersionId" = pv."id"
									and requirement."required" = true
									and (
										coalesce(jsonb_array_length(requirement."capabilitiesJson"), 0) = 0
										or coalesce(jsonb_array_length(requirement."acceptedEvidenceJson"), 0) = 0
										or coalesce(requirement."reviewOwner", '') = ''
										or coalesce(requirement."blockingAction", '') = ''
										or requirement."sourceKind" is null
										or coalesce(requirement."sourceReference", '') = ''
										or requirement."sourceCheckedAt" is null
									)
							)
						)::int as "signedPublishedCount"
					from "CompliancePolicySet" ps
					left join "CompliancePolicyVersion" pv on pv."policySetId" = ps."id"
					where ps."policyScope" = 'commercial'
					group by ps."vertical"
					order by ps."vertical"
						`
					: Promise.resolve([] as PolicyRow[]),
				tx<TourContextRow[]>`
					select
						p."id" as "productId",
						p."providerId" as "providerId",
						context."operatingRole" as "operatingRole",
						context."activityClassesJson" as "activityClasses",
						context."jurisdictionCode" as "jurisdictionCode"
					from "Product" p
					left join "TourComplianceContext" context on context."productId" = p."id"
					where lower(p."productType") = 'tour'
					order by p."providerId", p."id"
				`,
			])

			const now = new Date()
			const classifiedEvidence = evidence.map((row) => ({
				...row,
				classification: classifyCommercialEvidenceMigration(row, now),
			}))
			const evidenceByProvider = new Map<string, typeof classifiedEvidence>()
			for (const row of classifiedEvidence) {
				const current = evidenceByProvider.get(row.providerId) ?? []
				current.push(row)
				evidenceByProvider.set(row.providerId, current)
			}
			const providerInventory = providers.map((provider) => {
				const documents = evidenceByProvider.get(provider.providerId) ?? []
				return {
					providerId: provider.providerId,
					vertical: classifyProviderVerticals(provider.productTypes),
					productTypes: provider.productTypes,
					documentClasses: documents.reduce<Record<string, number>>((counts, document) => {
						counts[document.classification] = (counts[document.classification] ?? 0) + 1
						return counts
					}, {}),
					activationState: documents.some(
						(document) => document.classification === "legacy_generic_requires_scope"
					)
						? "hold_requires_scope_review"
						: "hold_requires_signed_policy_and_cohort",
				}
			})
			const byClassification = classifiedEvidence.reduce<Record<string, number>>(
				(counts, document) => {
					counts[document.classification] = (counts[document.classification] ?? 0) + 1
					return counts
				},
				{}
			)
			const toursMissingContext = tourContexts.filter(missingTourContext)
			return {
				report: "commercial_evidence_migration_inventory",
				readOnly: true,
				target: {
					environment: target.dataEnvironment,
					fingerprint: target.fingerprint,
				},
				contract: {
					historicalApprovals: "preserved",
					genericEvidence:
						"does_not_grant_commercial_capability_without_explicit_signed_provider_scope",
					activation: "environment_cohort_only_after_signed_policy",
				},
				generatedAt: now.toISOString(),
				evidence: {
					total: classifiedEvidence.length,
					byClassification,
					samples: verbose
						? classifiedEvidence
						: summaryOnly
							? []
							: classifiedEvidence.slice(0, 25),
				},
				providers: {
					total: providerInventory.length,
					byVertical: providerInventory.reduce<Record<string, number>>((counts, provider) => {
						counts[provider.vertical] = (counts[provider.vertical] ?? 0) + 1
						return counts
					}, {}),
					samples: verbose ? providerInventory : summaryOnly ? [] : providerInventory.slice(0, 25),
				},
				tours: {
					total: tourContexts.length,
					missingOperationalContext: toursMissingContext.length,
					remediation: "provider_declaration_required_before_new_tour_capabilities",
					samples: (verbose
						? toursMissingContext
						: summaryOnly
							? []
							: toursMissingContext.slice(0, 25)
					).map((tour) => ({
						productId: tour.productId,
						providerId: tour.providerId,
						missing: [
							...(tour.operatingRole ? [] : ["operating_role"]),
							...(tour.jurisdictionCode ? [] : ["jurisdiction"]),
							...(Array.isArray(tour.activityClasses) && tour.activityClasses.length
								? []
								: ["activity_class"]),
						],
					})),
				},
				commercialPolicies: {
					status: policySchemaReady ? "ready" : "migration_required",
					policies,
				},
			}
		})
		console.log(JSON.stringify(report, null, 2))
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
