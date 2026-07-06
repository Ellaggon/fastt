import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import { replacePolicyAssignmentCapa6 } from "@/modules/policies/public"
import type { ContractPresetBundle } from "./ratePlanCommercialIntent"

export async function createRatePlanContract(params: {
	providerId: string
	actorUserId?: string
	ratePlanId: string
	ratePlanName: string
	presets: ContractPresetBundle
}) {
	const assignments: Array<{ category: string; policyId: string; assignmentId: string }> = []

	for (const category of Object.keys(params.presets) as Array<keyof ContractPresetBundle>) {
		const policyPresetKey = params.presets[category]
		const presetPolicy = await getOrCreateProviderPresetPolicy({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			category,
			policyPresetKey,
		})
		const assigned = await replacePolicyAssignmentCapa6({
			policyId: presetPolicy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: null,
			actorUserId: params.actorUserId,
		})
		assignments.push({
			category,
			policyId: presetPolicy.policyId,
			assignmentId: assigned.assignmentId,
		})
	}

	return assignments
}
