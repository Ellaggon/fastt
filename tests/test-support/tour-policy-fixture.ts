import { createPolicyCapa6, replacePolicyAssignmentCapa6 } from "@/modules/policies/public"

/** Tour-compatible commercial policies for integration fixtures (no CheckIn category). */
export async function assignTourRatePlanPolicies(params: {
	ownerProviderId: string
	ratePlanId: string
	channel?: string | null
}) {
	const cancellation = await createPolicyCapa6({
		ownerProviderId: params.ownerProviderId,
		category: "Cancellation",
		description: "Flexible tour cancellation",
		cancellationTiers: [
			{
				daysBeforeArrival: 1,
				hoursBeforeDeparture: 24,
				penaltyType: "percentage",
				penaltyAmount: 0,
			},
			{
				daysBeforeArrival: 0,
				hoursBeforeDeparture: 0,
				penaltyType: "percentage",
				penaltyAmount: 100,
			},
		],
	} as any)
	const payment = await createPolicyCapa6({
		ownerProviderId: params.ownerProviderId,
		category: "Payment",
		description: "Pay at property",
		rules: { paymentType: "pay_at_property" },
	} as any)
	const noShow = await createPolicyCapa6({
		ownerProviderId: params.ownerProviderId,
		category: "NoShow",
		description: "No show",
		rules: { penaltyType: "percentage", penaltyAmount: 100 },
	} as any)
	for (const policy of [cancellation, payment, noShow]) {
		await replacePolicyAssignmentCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: params.channel ?? "web",
		})
	}
}
