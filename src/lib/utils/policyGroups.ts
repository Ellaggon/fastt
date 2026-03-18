// import type { HotelPolicy } from "@/application/queries/resolveHotelPolicies"
// import {
// 	POLICY_TYPE_TO_UI_GROUP,
// 	type PolicyType,
// 	type UIGroups,
// } from "@/data/policy/policy-types"

// function isPolicyType(value: string): value is PolicyType {
// 	return value in POLICY_TYPE_TO_UI_GROUP
// }

// export function buildUIPolicies(
// 	policies: HotelPolicy[]
// ): UIGroups {
// 	const result: UIGroups = {
// 		establishment: {},
// 		cancellation: {},
// 		payment: {},
// 	}

// 	for (const policy of policies) {
// 		if (!policy.isActive) continue
// 		if (!isPolicyType(policy.policyType)) continue

// 		const type = policy.policyType
// 		const group = POLICY_TYPE_TO_UI_GROUP[type]

// 		;(result[group][type] ??= []).push({
// 			id: policy.id,
// 			policyType: type,
// 			description: policy.description,
// 			isActive: policy.isActive,
// 		})
// 	}

// 	return result
// }