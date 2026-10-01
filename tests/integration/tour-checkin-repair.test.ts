import {
	deactivatePolicyAssignmentCapa6UseCase as deactivatePolicyAssignmentCapa6,
	replacePolicyAssignmentCapa6UseCase as replacePolicyAssignmentCapa6,
} from "@/container/policies-write.container"
import { resolveEffectivePolicies as resolveUncached } from "@/modules/policies/application/use-cases/resolve-effective-policies"
import { PolicyResolutionRepository } from "@/modules/policies/infrastructure/repositories/PolicyResolutionRepository"
const resolveEffectivePolicies = (context: {
	productId: string
	variantId: string
	ratePlanId: string
}) => resolveUncached({ repo: new PolicyResolutionRepository() }, context)
import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import {
	db,
	eq,
	PolicyAssignment,
	PolicyAuditLog,
	Booking,
	BookingPolicySnapshot,
	Policy,
} from "@/shared/infrastructure/db/compat"
import { createPolicyCapa6 } from "@/modules/policies/public"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
	upsertTestUser,
} from "@/shared/infrastructure/test-support/db-test-data"
import { loadTourCheckInRepair } from "@/lib/policies/tourCheckInRepair"

async function fixture(productType = "Tour", category: "CheckIn" | "Payment" = "CheckIn") {
	const suffix = randomUUID(),
		providerId = `prov_repair_${suffix}`,
		productId = randomUUID(),
		variantId = randomUUID(),
		ratePlanId = randomUUID(),
		actorUserId = randomUUID(),
		geoPlaceId = randomUUID(),
		templateId = randomUUID()
	await upsertTestUser({ id: actorUserId, email: `repair-${suffix}@example.test` })
	await upsertGeoPlace({
		id: geoPlaceId,
		name: "Repair destination",
		type: "city",
		country: "BO",
		slug: `repair-${suffix}`,
	})
	await upsertProduct({
		id: productId,
		name: "Repair fixture",
		productType,
		geoPlaceId,
		providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: productType === "Tour" ? "tour_slot" : "hotel_room",
		name: "Option",
	})
	await upsertRatePlanTemplate({
		id: templateId,
		name: "Repair rate",
		paymentType: "pay_at_property",
		refundable: true,
	})
	await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: false, isDefault: true })
	const policy = await createPolicyCapa6({
		ownerProviderId: providerId,
		category,
		description: "Historical fixture",
		rules:
			category === "Payment"
				? { paymentType: "pay_at_property" }
				: { checkInFrom: "15:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
	})
	const assignment = await replacePolicyAssignmentCapa6({
		policyId: policy.policyId,
		scope: "product",
		scopeId: productId,
		channel: null,
	})
	return {
		providerId,
		actorUserId,
		assignmentId: assignment.assignmentId,
		policyId: policy.policyId,
		repairContext: { productId, variantId, ratePlanId },
	}
}
const active = async (id: string) =>
	(await db.select().from(PolicyAssignment).where(eq(PolicyAssignment.id, id)))[0]

describe("controlled historical tour CheckIn repair", () => {
	it("preserves policy and assignment history, audits once and removes effective inheritance", async () => {
		const f = await fixture()
		const policyBefore = await db.select().from(Policy).where(eq(Policy.id, f.policyId))
		const bookingId = randomUUID()
		await db
			.insert(Booking)
			.values({
				id: bookingId,
				providerId: f.providerId,
				userId: null,
				ratePlanId: f.repairContext.ratePlanId,
				checkInDate: "2026-03-10",
				checkOutDate: "2026-03-11",
				numAdults: 2,
				numChildren: 0,
				totalAmount: 100,
				currency: "BOB",
				status: "confirmed",
				source: "web",
			})
		await db
			.insert(BookingPolicySnapshot)
			.values({
				id: randomUUID(),
				bookingId,
				category: "CheckIn",
				policyId: f.policyId,
				policySnapshotJson: {
					category: "CheckIn",
					policyId: f.policyId,
					rules: { checkInFrom: "15:00" },
				},
				createdAt: new Date(),
			})
		const historicalBefore = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))

		const list = await loadTourCheckInRepair(f.providerId, f.repairContext.ratePlanId)
		expect(list?.assignments.map((a) => a.id)).toContain(f.assignmentId)
		expect(await loadTourCheckInRepair("other", f.repairContext.ratePlanId)).toBeNull()
		const before = await resolveEffectivePolicies(f.repairContext)
		expect(before.policies.some((p) => p.category === "CheckIn")).toBe(true)
		const input = {
			assignmentId: f.assignmentId,
			ownerProviderId: f.providerId,
			actorUserId: f.actorUserId,
			repairContext: f.repairContext,
		}
		const responses = await Promise.all([
			deactivatePolicyAssignmentCapa6(input),
			deactivatePolicyAssignmentCapa6(input),
		])
		expect(responses.filter((r) => r.deactivated)).toHaveLength(1)
		expect(
			await db
				.select()
				.from(BookingPolicySnapshot)
				.where(eq(BookingPolicySnapshot.bookingId, bookingId))
		).toEqual(historicalBefore)
		expect((await active(f.assignmentId)).isActive).toBe(false)
		expect(await db.select().from(Policy).where(eq(Policy.id, f.policyId))).toEqual(policyBefore)
		const audit = await db
			.select()
			.from(PolicyAuditLog)
			.where(eq(PolicyAuditLog.assignmentId, f.assignmentId))
		const removal = audit.filter((a) => a.eventType === "assignment_deactivated")
		expect(removal).toHaveLength(1)
		expect(removal[0].afterJson).toMatchObject({
			reasonCode: "tour_historical_checkin_removed",
			reviewContext: f.repairContext,
		})
		const after = await resolveEffectivePolicies(f.repairContext)
		expect(after.policies.some((p) => p.category === "CheckIn")).toBe(false)
	}, 90000)
	it.each([
		["Hotel", "CheckIn"],
		["Tour", "Payment"],
	] as const)("rejects %s / %s without changing data", async (type, category) => {
		const f = await fixture(type, category)
		await expect(
			deactivatePolicyAssignmentCapa6({
				assignmentId: f.assignmentId,
				ownerProviderId: f.providerId,
				actorUserId: f.actorUserId,
				repairContext: f.repairContext,
			})
		).rejects.toThrow("TOUR_CHECKIN_REPAIR_CONTEXT_INVALID")
		expect((await active(f.assignmentId)).isActive).toBe(true)
	})
	it("rejects other products and owners and missing actor", async () => {
		const f = await fixture()
		for (const input of [
			{ ownerProviderId: "other", actorUserId: f.actorUserId, repairContext: f.repairContext },
			{
				ownerProviderId: f.providerId,
				actorUserId: f.actorUserId,
				repairContext: { ...f.repairContext, productId: randomUUID() },
			},
			{ ownerProviderId: f.providerId, repairContext: f.repairContext },
		])
			await expect(
				deactivatePolicyAssignmentCapa6({ assignmentId: f.assignmentId, ...input })
			).rejects.toThrow()
		expect((await active(f.assignmentId)).isActive).toBe(true)
	})
})
