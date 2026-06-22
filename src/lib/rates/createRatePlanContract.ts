import { createPolicyCapa6, replacePolicyAssignmentCapa6 } from "@/modules/policies/public"
import type { ContractPresetBundle } from "./ratePlanCommercialIntent"

const categoryLabels: Record<keyof ContractPresetBundle, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso y salida",
	NoShow: "No presentación",
}

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
		const created = await createPolicyCapa6({
			ownerProviderId: params.providerId,
			actorUserId: params.actorUserId,
			category,
			description: `${categoryLabels[category]} · ${params.ratePlanName}`,
			status: "active",
			policyPresetKey,
		} as any)
		const assigned = await replacePolicyAssignmentCapa6({
			policyId: created.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: null,
			actorUserId: params.actorUserId,
		})
		assignments.push({
			category,
			policyId: created.policyId,
			assignmentId: assigned.assignmentId,
		})
	}

	return assignments
}
