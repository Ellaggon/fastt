import { config as loadDotenv } from "dotenv"
import postgres from "postgres"

import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

if (process.env.FASTT_DATA_ENV === "test") {
	loadDotenv({ path: ".env.test", override: false })
	delete process.env.DATABASE_URL
	delete process.env.DIRECT_URL
} else {
	loadDotenv({ path: ".env", override: false })
}

type Finding = {
	assignmentId: string
	productId: string
	productName: string
	scope: string
	scopeId: string
	category: string
	isActive: boolean
	policyId: string | null
	policyPresetKey: string | null
	stayLengthType: string | null
	paymentType: string | null
	noShowPenaltyType: string | null
	hasHourCutoff: boolean
	reviewReasons: string[]
}

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const rows = await sql<Finding[]>`
			with tour_assignments as (
				select
					assignment.id as "assignmentId",
					product.id as "productId",
					product.name as "productName",
					assignment.scope,
					assignment."scopeId" as "scopeId",
					assignment.category,
					assignment."isActive" as "isActive",
					policy.id as "policyId",
					policy."policyPresetKey" as "policyPresetKey",
					policy."stayLengthType" as "stayLengthType",
					payment."ruleValue" #>> '{}' as "paymentType",
					no_show."ruleValue" #>> '{}' as "noShowPenaltyType",
					coalesce(hour_cutoff."hasHourCutoff", false) as "hasHourCutoff"
				from "PolicyAssignment" assignment
				join "PolicyGroup" policy_group on policy_group.id = assignment."policyGroupId"
				left join lateral (
					select id, "policyPresetKey", "stayLengthType"
					from "Policy"
					where "groupId" = policy_group.id and status = 'active'
					order by version desc, id desc
					limit 1
				) policy on true
				left join "PolicyRule" payment on payment."policyId" = policy.id and payment."ruleKey" = 'paymentType'
				left join "PolicyRule" no_show on no_show."policyId" = policy.id and no_show."ruleKey" = 'penaltyType'
				left join lateral (
					select bool_or("hoursBeforeDeparture" is not null) as "hasHourCutoff"
					from "CancellationTier"
					where "policyId" = policy.id
				) hour_cutoff on true
				left join "Product" direct_product on direct_product.id = assignment."productTargetId"
				left join "Variant" direct_variant on direct_variant.id = assignment."variantTargetId"
				left join "RatePlan" direct_rate_plan on direct_rate_plan.id = assignment."ratePlanTargetId"
				left join "Variant" rate_plan_variant on rate_plan_variant.id = direct_rate_plan."variantId"
				join "Product" product on product.id = coalesce(direct_product.id, direct_variant."productId", rate_plan_variant."productId")
				where lower(product."productType") = 'tour'
			)
			select *, array_remove(array[
				case when category = 'CheckIn' then 'hotel_arrival_category' end,
				case when category = 'Cancellation' and coalesce("stayLengthType", '') = 'long_stay' then 'long_stay_contract' end,
				case when category = 'Cancellation' and not "hasHourCutoff" then 'day_based_cutoff_requires_decision' end,
				case when category = 'Payment' and coalesce("paymentType", '') <> 'pay_at_property' then 'unsupported_payment_type' end,
				case when category = 'NoShow' and "noShowPenaltyType" = 'first_night' then 'first_night_basis' end
			], null) as "reviewReasons"
			from tour_assignments
			order by "productName", category, "assignmentId"
		`

		const active = rows.filter((row) => row.isActive)
		const needsReview = rows.filter((row) => row.reviewReasons.length > 0)
		console.log(
			JSON.stringify(
				{
					report: "tour_policy_assignment_inventory",
					readOnly: true,
					generatedAt: new Date().toISOString(),
					totals: {
						assignments: rows.length,
						activeAssignments: active.length,
						requiresReview: needsReview.length,
					},
					requiresReview: needsReview,
					allAssignments: rows,
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
