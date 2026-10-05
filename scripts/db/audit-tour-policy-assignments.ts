import { config as loadDotenv } from "dotenv"
import postgres from "postgres"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"
import {
	evaluatePolicyBusinessCompatibility,
	policyBusinessContextFromProduct,
	type PolicyCompatibilityCandidate,
} from "../../src/lib/policies/policy-business-compatibility"

if (process.env.FASTT_DATA_ENV === "test") {
	loadDotenv({ path: ".env.test", override: false })
	delete process.env.DATABASE_URL
	delete process.env.DIRECT_URL
} else {
	loadDotenv({ path: ".env", override: false })
}

type InventoryRow = {
	assignmentId: string
	productId: string
	productName: string
	scope: string
	scopeId: string
	category: string
	isActive: boolean
	channel: string | null
	effectiveFrom: string | null
	effectiveTo: string | null
	policies: Array<PolicyCompatibilityCandidate & { id: string; version: number }>
}

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})
	try {
		const rows = await sql.begin(
			"read only",
			async (tx) => tx<InventoryRow[]>`
			select assignment.id as "assignmentId", product.id as "productId", product.name as "productName",
				assignment.scope, assignment."scopeId", assignment.category, assignment."isActive", assignment.channel,
				assignment."effectiveFrom", assignment."effectiveTo",
				coalesce((select jsonb_agg(jsonb_build_object(
					'id', policy.id, 'version', policy.version, 'category', assignment.category,
					'stayLengthType', policy."stayLengthType", 'refundBasis', policy."refundBasis",
					'rules', coalesce((select jsonb_object_agg(rule."ruleKey", rule."ruleValue") from "PolicyRule" rule where rule."policyId" = policy.id and rule."ruleKey" is not null), '{}'::jsonb),
					'cancellationTiers', coalesce((select jsonb_agg(jsonb_build_object('daysBeforeArrival', tier."daysBeforeArrival", 'hoursBeforeDeparture', tier."hoursBeforeDeparture", 'penaltyType', tier."penaltyType", 'penaltyAmount', tier."penaltyAmount")) from "CancellationTier" tier where tier."policyId" = policy.id), '[]'::jsonb)
				)) from "Policy" policy where policy."groupId" = assignment."policyGroupId" and policy.status = 'active'), '[]'::jsonb) as policies
			from "PolicyAssignment" assignment
			left join "Product" direct_product on direct_product.id = assignment."productTargetId"
			left join "Variant" direct_variant on direct_variant.id = assignment."variantTargetId"
			left join "RatePlan" direct_rate on direct_rate.id = assignment."ratePlanTargetId"
			left join "Variant" rate_variant on rate_variant.id = direct_rate."variantId"
			join "Product" product on assignment.scope = 'global' or product.id = coalesce(direct_product.id, direct_variant."productId", rate_variant."productId")
			where lower(product."productType") = 'tour'
			order by product.name, assignment.category, assignment.id
		`
		)
		const inventory = rows.map(({ policies, ...row }) => ({
			...row,
			versions: policies.map((policy) => ({
				policyId: policy.id,
				version: policy.version,
				issues: evaluatePolicyBusinessCompatibility(
					policyBusinessContextFromProduct({ productId: row.productId, productType: "tour" }),
					policy
				),
			})),
			missingActiveVersion: policies.length === 0,
		}))
		const requiresReview = inventory.filter(
			(row) =>
				row.isActive &&
				(row.missingActiveVersion || row.versions.some((version) => version.issues.length))
		)
		const historicalReview = inventory.filter(
			(row) =>
				!row.isActive &&
				(row.missingActiveVersion || row.versions.some((version) => version.issues.length))
		)
		// The effective gate honours scope precedence, channel and validity. Raw
		// assignments are an inventory, not a substitute for this observation.
		const { auditTourProductPolicyCompatibility } =
			await import("../../src/lib/policies/audit-tour-policy-compatibility")
		const effectiveFindings = []
		for (const productId of new Set(
			rows.filter((row) => row.isActive).map((row) => row.productId)
		)) {
			effectiveFindings.push({
				productId,
				findings: await auditTourProductPolicyCompatibility(productId),
			})
		}
		console.log(
			JSON.stringify(
				{
					report: "tour_policy_assignment_inventory",
					readOnly: true,
					generatedAt: new Date().toISOString(),
					effectiveChannel: "web",
					totals: {
						assignments: inventory.length,
						activeAssignments: inventory.filter((row) => row.isActive).length,
						requiresReview: requiresReview.length,
						historicalReview: historicalReview.length,
					},
					requiresReview,
					historicalReview,
					effectiveFindings,
					allAssignments: inventory,
				},
				null,
				2
			)
		)
	} finally {
		await sql.end()
	}
}
main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
