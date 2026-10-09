import { beforeEach, afterEach, it, expect, vi } from "vitest"
import {
	db,
	eq,
	inArray,
	Provider,
	Product,
	User,
	Variant,
	RatePlan,
	TourSlotProfile,
	VariantCapacity,
	VariantInventoryConfig,
	DailyInventory,
	ProviderOptionPreparationSession,
	RatePlanOccupancyPolicy,
	PolicyGroup,
	Policy,
	PolicyRule,
	CancellationTier,
	PolicyAssignment,
	PolicyAuditLog,
	ProductGeoPlace,
	GeoPlace,
} from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
	upsertTestUser,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { startOptionSession, getOptionSession } from "@/lib/onboarding/tourOptionSession"
import {
	loadScheduleSource,
	createScheduleOption,
	reviewScheduleSource,
	type scheduleCreationSchema,
} from "@/lib/onboarding/tourScheduleCreation"
import { TransactionalPricingBaselineRepository } from "@/modules/pricing/public"
import type { z } from "zod"
let provider: string,
	user: string,
	product: string,
	variant: string,
	rate: string,
	otherRate: string,
	place: string
beforeEach(async () => {
	provider = crypto.randomUUID()
	user = crypto.randomUUID()
	product = crypto.randomUUID()
	variant = crypto.randomUUID()
	rate = crypto.randomUUID()
	otherRate = crypto.randomUUID()
	place = crypto.randomUUID()
	await upsertProvider({ id: provider, accountPurpose: "integration_certification" })
	await upsertTestUser({ id: user })
	await upsertGeoPlace({
		id: place,
		name: "Schedule fixture",
		type: "city",
		country: "BO",
		slug: place,
	})
	await upsertProduct({
		id: product,
		name: "Schedule fixture",
		providerId: provider,
		geoPlaceId: place,
		productType: "Tour",
		dataClass: "fixture",
	})
	await upsertVariant({
		id: variant,
		productId: product,
		kind: "tour_slot",
		name: "Morning",
		maxOccupancy: 8,
	})
	await db.insert(TourSlotProfile).values({
		variantId: variant,
		departureTime: "09:00",
		maxPax: 8,
		languageCode: "es",
		bookingMode: "shared",
		meetingPointOverrideJson: { instructions: "Puerta sur", coordinates: [1, 2] },
		isActive: true,
	})
	await db.insert(VariantInventoryConfig).values({ variantId: variant, defaultTotalUnits: 8 })
	for (const id of [rate, otherRate])
		await db.insert(RatePlan).values({
			id,
			variantId: variant,
			name: id === rate ? "Standard BOB" : "Standard USD",
			isActive: true,
		})
	await new TransactionalPricingBaselineRepository().setCanonicalPricingBaselineForRatePlan({
		ratePlanId: rate,
		basePrice: 100,
		currency: "BOB",
	})
	await new TransactionalPricingBaselineRepository().setCanonicalPricingBaselineForRatePlan({
		ratePlanId: otherRate,
		basePrice: 20,
		currency: "USD",
	})
	for (const category of ["Cancellation", "Payment", "NoShow"]) {
		const groupId = crypto.randomUUID(),
			policyId = crypto.randomUUID()
		await db.insert(PolicyGroup).values({ id: groupId, category, ownerProviderId: provider })
		await db.insert(Policy).values({
			id: policyId,
			groupId,
			description: category,
			version: 1,
			status: "active",
			stayLengthType: "any",
			refundBasis: "total_booking",
		})
		if (category === "Cancellation")
			await db.insert(CancellationTier).values({
				id: crypto.randomUUID(),
				policyId,
				daysBeforeArrival: 0,
				hoursBeforeDeparture: 24,
				penaltyType: "percentage",
				penaltyAmount: 100,
			})
		else
			await db.insert(PolicyRule).values({
				id: crypto.randomUUID(),
				policyId,
				ruleKey: category === "Payment" ? "paymentType" : "penaltyType",
				ruleValue: category === "Payment" ? "pay_at_property" : "full",
			})
		await db.insert(PolicyAssignment).values({
			id: crypto.randomUUID(),
			policyGroupId: groupId,
			category,
			scope: "rate_plan",
			ratePlanTargetId: rate,
			channel: "web",
		})
	}
	await db.insert(DailyInventory).values({
		id: crypto.randomUUID(),
		variantId: variant,
		date: "2027-02-01",
		totalInventory: 8,
		reservedCount: 3,
	})
})
afterEach(async () => {
	vi.restoreAllMocks()
	await db
		.delete(ProviderOptionPreparationSession)
		.where(eq(ProviderOptionPreparationSession.providerId, provider))
	const variants = (await db.select().from(Variant).where(eq(Variant.productId, product))).map(
		(row) => row.id
	)
	const rates = (await db.select().from(RatePlan).where(inArray(RatePlan.variantId, variants))).map(
		(row) => row.id
	)
	const groups = (
		await db.select().from(PolicyGroup).where(eq(PolicyGroup.ownerProviderId, provider))
	).map((row) => row.id)
	const policies = (await db.select().from(Policy).where(inArray(Policy.groupId, groups))).map(
		(row) => row.id
	)
	await db.delete(PolicyAuditLog).where(inArray(PolicyAuditLog.policyGroupId, groups))
	await db.delete(PolicyAssignment).where(inArray(PolicyAssignment.policyGroupId, groups))
	await db.delete(PolicyRule).where(inArray(PolicyRule.policyId, policies))
	await db.delete(CancellationTier).where(inArray(CancellationTier.policyId, policies))
	await db.delete(Policy).where(inArray(Policy.id, policies))
	await db.delete(PolicyGroup).where(inArray(PolicyGroup.id, groups))
	await db.delete(RatePlanOccupancyPolicy).where(inArray(RatePlanOccupancyPolicy.ratePlanId, rates))
	await db.delete(RatePlan).where(inArray(RatePlan.id, rates))
	await db.delete(DailyInventory).where(inArray(DailyInventory.variantId, variants))
	await db.delete(TourSlotProfile).where(inArray(TourSlotProfile.variantId, variants))
	await db.delete(VariantCapacity).where(inArray(VariantCapacity.variantId, variants))
	await db.delete(VariantInventoryConfig).where(inArray(VariantInventoryConfig.variantId, variants))
	await db.delete(Variant).where(inArray(Variant.id, variants))
	await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, product))
	await db.delete(Product).where(eq(Product.id, product))
	await db.delete(User).where(eq(User.id, user))
	await db.delete(Provider).where(eq(Provider.id, provider))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, place))
})
async function intent(reuse = true) {
	const session = await startOptionSession(provider, user, product, crypto.randomUUID(), variant)
	const source = await loadScheduleSource(db, provider, product, variant, rate)
	const input: z.infer<typeof scheduleCreationSchema> = {
		productId: product,
		sessionId: session.id,
		sourceFingerprint: source.fingerprint,
		sourceRatePlanId: rate,
		name: "Afternoon",
		departureTime: "14:00",
		durationMinutes: null,
		maxPax: 8,
		languageCode: "es",
		bookingMode: "shared",
		reusePrice: reuse,
		reuseConditions: reuse,
		replaceMeetingPoint: false,
		confirmEquivalent: false,
	}
	return { session, source, input }
}
it("creates an independent schedule with explicit commercial reuse, preserves source and inventory and recovers retries", async () => {
	const { input, session } = await intent()
	const original = await loadScheduleSource(db, provider, product, variant, rate)
	const inventory = await db
		.select()
		.from(DailyInventory)
		.where(eq(DailyInventory.variantId, variant))
	const result = await createScheduleOption(provider, user, input)
	expect(result.href).toContain("step=calendar")
	const [profile] = await db
		.select()
		.from(TourSlotProfile)
		.where(eq(TourSlotProfile.variantId, result.variantId))
	expect(profile.meetingPointOverrideJson).toEqual(original.source.profile.meetingPointOverrideJson)
	expect(profile.departureTime).toBe("14:00")
	expect(
		(await db.select().from(Variant).where(eq(Variant.id, result.variantId)))[0].salesEnabled
	).toBe(false)
	expect(
		(await db.select().from(RatePlan).where(eq(RatePlan.id, result.ratePlanId!)))[0].isActive
	).toBe(false)
	expect(
		await db.select().from(DailyInventory).where(eq(DailyInventory.variantId, result.variantId))
	).toHaveLength(0)
	expect(
		await db.select().from(DailyInventory).where(eq(DailyInventory.variantId, variant))
	).toEqual(inventory)
	expect((await loadScheduleSource(db, provider, product, variant, rate)).fingerprint).toBe(
		original.fingerprint
	)
	const copied = await loadScheduleSource(
		db,
		provider,
		product,
		result.variantId,
		result.ratePlanId!
	)
	expect(copied.priceReusable).toBe(true)
	expect(copied.conditionsReusable).toBe(true)
	expect(copied.baseline).toMatchObject({ basePrice: 100, currency: "BOB" })
	expect(copied.conditions!.policies.map((row) => row.policy.groupId)).not.toEqual(
		original.conditions!.policies.map((row) => row.policy.groupId)
	)
	await db.update(Variant).set({ name: "Edited afternoon" }).where(eq(Variant.id, result.variantId))
	expect((await createScheduleOption(provider, user, input)).variantId).toBe(result.variantId)
	expect((await db.select().from(Variant).where(eq(Variant.id, result.variantId)))[0].name).toBe(
		"Edited afternoon"
	)
	expect((await getOptionSession(provider, user, session.id)).creationIntent).toMatchObject({
		sourceVariantId: variant,
		reusePrice: true,
		reuseConditions: true,
	})
}, 90000)
it("does not silently reuse a rate or conditions; rejects foreign relationships and stale source contents", async () => {
	const { input } = await intent(false)
	await expect(createScheduleOption(crypto.randomUUID(), user, input)).rejects.toThrow(
		"session_not_active"
	)
	await expect(
		createScheduleOption(provider, user, { ...input, sourceRatePlanId: crypto.randomUUID() })
	).rejects.toThrow("rate_mismatch")
	await new TransactionalPricingBaselineRepository().setCanonicalPricingBaselineForRatePlan({
		ratePlanId: rate,
		basePrice: 110,
		currency: "BOB",
	})
	await expect(createScheduleOption(provider, user, input)).rejects.toThrow("source_changed")
	expect((await getOptionSession(provider, user, input.sessionId)).variantId).toBeNull()
	const updated = await loadScheduleSource(db, provider, product, variant, rate)
	const result = await createScheduleOption(provider, user, {
		...input,
		sourceFingerprint: updated.fingerprint,
	})
	expect(result.ratePlanId).toBeNull()
	expect(result.href).toContain("step=price")
}, 90000)
it("rolls back a mid-creation failure and completes the same intent on retry", async () => {
	const { input } = await intent()
	const fail = vi
		.spyOn(
			TransactionalPricingBaselineRepository.prototype,
			"setCanonicalPricingBaselineForRatePlan"
		)
		.mockRejectedValueOnce(new Error("injected write failure"))
	await expect(createScheduleOption(provider, user, input)).rejects.toThrow(
		"injected write failure"
	)
	expect(await db.select().from(Variant).where(eq(Variant.productId, product))).toHaveLength(1)
	expect((await getOptionSession(provider, user, input.sessionId)).variantId).toBeNull()
	fail.mockRestore()
	expect((await createScheduleOption(provider, user, input)).ratePlanId).toBeTruthy()
}, 90000)
it("requires explicit duplicate confirmation, respects private mode, and rejects incompatible and dated conditions", async () => {
	const { input } = await intent()
	await expect(
		createScheduleOption(provider, user, { ...input, departureTime: "09:00" })
	).rejects.toThrow("equivalent_exists")
	const result = await createScheduleOption(provider, user, {
		...input,
		departureTime: "09:00",
		confirmEquivalent: true,
		bookingMode: "private",
		reusePrice: false,
		reuseConditions: false,
	})
	expect(
		(
			await db.select().from(TourSlotProfile).where(eq(TourSlotProfile.variantId, result.variantId))
		)[0].bookingMode
	).toBe("private")
	const next = await intent()
	const [assignment] = await db
		.select()
		.from(PolicyAssignment)
		.where(eq(PolicyAssignment.ratePlanTargetId, rate))
	await db
		.update(PolicyAssignment)
		.set({ effectiveFrom: "2020-01-01", effectiveTo: "2099-01-01" })
		.where(eq(PolicyAssignment.id, assignment.id))
	const changed = await loadScheduleSource(db, provider, product, variant, rate)
	expect(changed.conditionsReusable).toBe(false)
	await expect(
		createScheduleOption(provider, user, { ...next.input, sourceFingerprint: changed.fingerprint })
	).rejects.toThrow("conditions_not_reusable")
}, 90000)

it("preserves reviewed source on resume, rejects changed creation intent and creates concurrent schedules independently", async () => {
	const a = await intent(false),
		b = await intent(false)
	const reviewed = await reviewScheduleSource(provider, user, a.session.id, otherRate)
	expect(
		(await getOptionSession(provider, user, reviewed.id)).creationIntent?.sourceRatePlanId
	).toBe(otherRate)
	await expect(startOptionSession(provider, user, product, a.session.id)).rejects.toThrow(
		"intent_conflict"
	)
	const results = await Promise.all([
		createScheduleOption(provider, user, {
			...a.input,
			sourceRatePlanId: otherRate,
			sourceFingerprint: (await loadScheduleSource(db, provider, product, variant, otherRate))
				.fingerprint,
			departureTime: "16:00",
		}),
		createScheduleOption(provider, user, { ...b.input, departureTime: "17:00" }),
	])
	expect(new Set(results.map((row) => row.variantId)).size).toBe(2)
	expect((await getOptionSession(provider, user, a.session.id)).variantId).toBe(
		results[0].variantId
	)
	expect((await getOptionSession(provider, user, b.session.id)).variantId).toBe(
		results[1].variantId
	)
}, 90000)
