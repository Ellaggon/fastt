import { and, db, desc, eq, isNull, Policy, PolicyAssignment } from "astro:db"

import type { HouseRule } from "@/modules/house-rules/public"
import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	deactivatePolicyAssignmentCapa6,
	replacePolicyAssignmentCapa6,
} from "@/modules/policies/public"

function latestRule(rules: HouseRule[], type: "CheckIn" | "Checkout") {
	return rules
		.filter((rule) => String(rule.type) === type)
		.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
}

export async function syncHotelArrivalPolicy(params: {
	providerId: string
	productId: string
	actorUserId: string
	rules: HouseRule[]
}): Promise<{ synced: boolean; policyId?: string }> {
	const assignment = await db
		.select({ id: PolicyAssignment.id, policyGroupId: PolicyAssignment.policyGroupId })
		.from(PolicyAssignment)
		.where(
			and(
				eq(PolicyAssignment.scope, "product"),
				eq(PolicyAssignment.scopeId, params.productId),
				eq(PolicyAssignment.category, "CheckIn"),
				isNull(PolicyAssignment.channel),
				eq(PolicyAssignment.isActive, true)
			)
		)
		.get()
	const checkIn = latestRule(params.rules, "CheckIn")
	const checkout = latestRule(params.rules, "Checkout")
	const checkInFrom = String(checkIn?.payloadJson?.checkInFrom ?? "").trim()
	const checkInUntil = String(checkIn?.payloadJson?.checkInUntil ?? "").trim()
	const checkOutUntil = String(checkout?.payloadJson?.time ?? "").trim()
	if (!checkInFrom || !checkInUntil || !checkOutUntil) {
		if (assignment?.id) {
			await deactivatePolicyAssignmentCapa6({
				assignmentId: String(assignment.id),
				ownerProviderId: params.providerId,
				actorUserId: params.actorUserId,
			})
		}
		return { synced: false }
	}
	const previous = assignment?.policyGroupId
		? await db
				.select({ id: Policy.id })
				.from(Policy)
				.where(eq(Policy.groupId, String(assignment.policyGroupId)))
				.orderBy(desc(Policy.version))
				.get()
		: null

	const policyContent = {
		description: `Llegada ${checkInFrom}–${checkInUntil} · salida hasta ${checkOutUntil}`,
		status: "active",
		policyPresetKey: "standard_check_in",
		localTimezone: "property_local",
		rules: { checkInFrom, checkInUntil, checkOutUntil },
		actorUserId: params.actorUserId,
	} as const
	const created = previous?.id
		? await createPolicyVersionCapa6({
				previousPolicyId: String(previous.id),
				...policyContent,
			})
		: await createPolicyCapa6({
				ownerProviderId: params.providerId,
				category: "CheckIn",
				...policyContent,
			})

	await replacePolicyAssignmentCapa6({
		policyId: created.policyId,
		scope: "product",
		scopeId: params.productId,
		channel: null,
		actorUserId: params.actorUserId,
	})

	return { synced: true, policyId: created.policyId }
}
