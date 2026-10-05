import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createRatePlanContract } from "@/lib/rates/createRatePlanContract"
import { resolveCommercialIntentSpec } from "@/lib/rates/ratePlanCommercialIntent"
import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import { replacePolicyAssignmentCapa6 } from "@/modules/policies/public"
import { db, eq, and, PolicyAssignment } from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

async function fixture(productType: "Tour" | "Hotel") {
	const productId = randomUUID(),
		variantId = randomUUID(),
		ratePlanId = randomUUID(),
		geoPlaceId = randomUUID()
	const providerId = `policy_contract_${randomUUID()}`
	await upsertGeoPlace({
		id: geoPlaceId,
		name: "Test",
		type: "city",
		country: "BO",
		slug: `policy-${geoPlaceId}`,
	})
	await upsertProduct({
		id: productId,
		name: "Contract fixture",
		productType,
		providerId,
		geoPlaceId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		name: "Option",
		kind: productType === "Tour" ? "tour_slot" : "hotel_room",
	})
	await upsertRatePlan({ id: ratePlanId, variantId, isActive: false })
	return { providerId, productId, variantId, ratePlanId, ratePlanName: "Standard" }
}
const assignments = (id: string) =>
	db
		.select()
		.from(PolicyAssignment)
		.where(and(eq(PolicyAssignment.ratePlanTargetId, id), eq(PolicyAssignment.isActive, true)))

describe("shared contract assignment against PostgreSQL", () => {
	it("creates only tour conditions, rejects incompatible direct assignments, and preserves a chosen cancellation on retry", async () => {
		const f = await fixture("Tour")
		const presets = resolveCommercialIntentSpec("flexible", { offeringType: "tour" }).contract
		await createRatePlanContract({ ...f, presets })
		const before = await assignments(f.ratePlanId)
		expect(before.map((row) => row.category).sort()).toEqual(["NoShow", "Payment"])
		for (const [category, key] of [
			["CheckIn", "standard_check_in"],
			["Cancellation", "flexible"],
		] as const) {
			const policy = await getOrCreateProviderPresetPolicy({
				providerId: f.providerId,
				category,
				policyPresetKey: key,
			})
			await expect(
				replacePolicyAssignmentCapa6({
					policyId: policy.policyId,
					scope: "rate_plan",
					scopeId: f.ratePlanId,
				})
			).rejects.toMatchObject({ code: "validation_error" })
		}
		expect(await assignments(f.ratePlanId)).toEqual(before)
		const cancellation = await getOrCreateProviderPresetPolicy({
			providerId: f.providerId,
			category: "Cancellation",
			policyPresetKey: "tour_non_refundable",
		})
		await replacePolicyAssignmentCapa6({
			policyId: cancellation.policyId,
			scope: "rate_plan",
			scopeId: f.ratePlanId,
		})
		const chosen = await assignments(f.ratePlanId)
		await createRatePlanContract({ ...f, presets })
		expect(await assignments(f.ratePlanId)).toEqual(chosen)
	}, 90000)
	it("preserves the four-category hotel contract", async () => {
		const f = await fixture("Hotel")
		await createRatePlanContract({
			...f,
			presets: resolveCommercialIntentSpec("flexible").contract,
		})
		expect((await assignments(f.ratePlanId)).map((row) => row.category).sort()).toEqual([
			"Cancellation",
			"CheckIn",
			"NoShow",
			"Payment",
		])
	}, 90000)
})
