import { and, db, desc, eq, isNull, Policy, PolicyAssignment } from "astro:db"

import type { HouseRule } from "@/modules/house-rules/public"
import {
	createPolicyCapa6,
	replacePolicyAssignmentCapa6,
	togglePolicyAssignmentCapa6,
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
			await togglePolicyAssignmentCapa6({ assignmentId: String(assignment.id), isActive: false })
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

	const created = await createPolicyCapa6({
		previousPolicyId: previous?.id ? String(previous.id) : undefined,
		ownerProviderId: previous?.id ? undefined : params.providerId,
		category: "CheckIn",
		description: `Llegada ${checkInFrom}–${checkInUntil} · salida hasta ${checkOutUntil}`,
		status: "active",
		policyPresetKey: "standard_check_in",
		localTimezone: "property_local",
		rules: { checkInFrom, checkInUntil, checkOutUntil },
		actorUserId: params.actorUserId,
	} as any)

	await replacePolicyAssignmentCapa6({
		policyId: created.policyId,
		scope: "product",
		scopeId: params.productId,
		channel: null,
		actorUserId: params.actorUserId,
	})

	return { synced: true, policyId: created.policyId }
}
