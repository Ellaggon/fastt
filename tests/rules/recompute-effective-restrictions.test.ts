import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
	db,
	Destination,
	EffectiveRestriction,
	eq,
	Product,
	Provider,
	RatePlan,
	Variant,
} from "astro:db"

import {
	createCommercialSellabilityRule,
	setCommercialRuleActive,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { createRestrictionsSurfaceRule } from "@/lib/rates/restrictionsSurface"
import {
	recomputeEffectiveRestrictionsForScope,
	recomputeEffectiveRestrictionsForVariantRange,
	toExclusiveRestrictionDate,
} from "@/modules/rules/public"

async function seedVariant() {
	const suffix = randomUUID()
	const providerId = `prov_${suffix}`
	const destinationId = `dest_${suffix}`
	const productId = `prod_${suffix}`
	const variantId = `var_${suffix}`
	const ratePlanId = `rp_${suffix}`
	const secondaryRatePlanId = `rp_secondary_${suffix}`

	await db.insert(Provider).values({
		id: providerId,
		displayName: "Commercial Rules Provider",
		status: "active",
		createdAt: new Date(),
	} as any)
	await db.insert(Destination).values({
		id: destinationId,
		name: "Commercial Rules Destination",
		type: "city",
		country: "CL",
		slug: `restriction-${suffix}`,
	} as any)
	await db.insert(Product).values({
		id: productId,
		name: "Commercial Rules Product",
		productType: "Hotel",
		destinationId,
		providerId,
	} as any)
	await db.insert(Variant).values({
		id: variantId,
		productId,
		name: "Commercial Rules Room",
		kind: "hotel_room",
		status: "ready",
		isActive: true,
		createdAt: new Date(),
	} as any)
	await db.insert(RatePlan).values({
		id: ratePlanId,
		variantId,
		name: "Default",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)
	await db.insert(RatePlan).values({
		id: secondaryRatePlanId,
		variantId,
		name: "Non refundable",
		isDefault: false,
		isActive: true,
		createdAt: new Date(),
	} as any)

	return { providerId, productId, variantId, ratePlanId, secondaryRatePlanId }
}

async function seedCommercialRestriction(params: {
	providerId: string
	scope: "product" | "variant" | "rate_plan"
	scopeId: string
	type: string
	value: number | null
	startDate: string
	endDate: string
	priority?: number
}) {
	return createCommercialSellabilityRule({
		providerId: params.providerId,
		scope: params.scope,
		scopeId: params.scopeId,
		type: params.type,
		value: params.value,
		startDate: params.startDate,
		endDate: params.endDate,
		validDays: [],
		priority: params.priority,
	})
}

async function loadEffectiveRow(variantId: string, ratePlanId: string, date: string) {
	return db
		.select()
		.from(EffectiveRestriction)
		.where(eq(EffectiveRestriction.id, `er_${variantId}_${ratePlanId}_${date}`))
		.get()
}

describe("recomputeEffectiveRestrictions", () => {
	it("materializes product, variant, and rate-plan sellability rules into daily projection", async () => {
		const { providerId, productId, variantId, ratePlanId, secondaryRatePlanId } =
			await seedVariant()

		await seedCommercialRestriction({
			providerId,
			scope: "product",
			scopeId: productId,
			type: "min_los",
			value: 3,
			startDate: "2026-05-20",
			endDate: "2026-05-22",
			priority: 350,
		})
		await seedCommercialRestriction({
			providerId,
			scope: "variant",
			scopeId: variantId,
			type: "stop_sell",
			value: null,
			startDate: "2026-05-21",
			endDate: "2026-05-21",
			priority: 200,
		})
		await seedCommercialRestriction({
			providerId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			type: "cta",
			value: null,
			startDate: "2026-05-22",
			endDate: "2026-05-22",
			priority: 140,
		})

		const result = await recomputeEffectiveRestrictionsForVariantRange({
			variantId,
			from: "2026-05-20",
			to: "2026-05-23",
			reason: "test",
		})

		expect(result.rows).toBe(6)
		expect(result.ratePlanIds).toEqual([ratePlanId, secondaryRatePlanId].sort())
		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-05-20")).toMatchObject({
			stopSell: false,
			minStay: 3,
			cta: false,
			ratePlanId,
		})
		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-05-21")).toMatchObject({
			stopSell: true,
			minStay: 3,
		})
		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-05-22")).toMatchObject({
			stopSell: false,
			minStay: 3,
			cta: true,
		})
		expect(await loadEffectiveRow(variantId, secondaryRatePlanId, "2026-05-22")).toMatchObject({
			stopSell: false,
			minStay: 3,
			cta: false,
		})
	})

	it("writes neutral rows when rules are deactivated", async () => {
		const { providerId, variantId, ratePlanId } = await seedVariant()
		const created = await seedCommercialRestriction({
			providerId,
			scope: "variant",
			scopeId: variantId,
			type: "stop_sell",
			value: null,
			startDate: "2026-06-10",
			endDate: "2026-06-10",
			priority: 100,
		})

		await recomputeEffectiveRestrictionsForScope({
			scope: "variant",
			scopeId: variantId,
			from: "2026-06-10",
			to: toExclusiveRestrictionDate("2026-06-10"),
		})
		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-06-10")).toMatchObject({
			stopSell: true,
		})

		await setCommercialRuleActive(created.ruleId, false)
		await recomputeEffectiveRestrictionsForScope({
			scope: "variant",
			scopeId: variantId,
			from: "2026-06-10",
			to: toExclusiveRestrictionDate("2026-06-10"),
		})

		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-06-10")).toMatchObject({
			stopSell: false,
			minStay: null,
			cta: false,
			ctd: false,
		})
	})

	it("updates EffectiveRestriction when the Restrictions surface creates a rule", async () => {
		const { providerId, variantId, ratePlanId } = await seedVariant()
		const form = new FormData()
		form.set("scope", "variant")
		form.set("variantScopeId", variantId)
		form.set("type", "stop_sell")
		form.set("startDate", "2026-07-01")
		form.set("endDate", "2026-07-02")

		await createRestrictionsSurfaceRule(providerId, form)

		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-07-01")).toMatchObject({
			stopSell: true,
		})
		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-07-02")).toMatchObject({
			stopSell: true,
		})
	})

	it("materializes booking-window lead time groundwork by rate plan", async () => {
		const { providerId, variantId, ratePlanId, secondaryRatePlanId } = await seedVariant()

		await seedCommercialRestriction({
			providerId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			type: "min_lead_time",
			value: 2,
			startDate: "2026-08-01",
			endDate: "2026-08-01",
			priority: 160,
		})
		await seedCommercialRestriction({
			providerId,
			scope: "rate_plan",
			scopeId: secondaryRatePlanId,
			type: "max_lead_time",
			value: 30,
			startDate: "2026-08-01",
			endDate: "2026-08-01",
			priority: 165,
		})

		await recomputeEffectiveRestrictionsForVariantRange({
			variantId,
			from: "2026-08-01",
			to: "2026-08-02",
			reason: "test_booking_window",
		})

		expect(await loadEffectiveRow(variantId, ratePlanId, "2026-08-01")).toMatchObject({
			minLeadTime: 2,
			maxLeadTime: null,
		})
		expect(await loadEffectiveRow(variantId, secondaryRatePlanId, "2026-08-01")).toMatchObject({
			minLeadTime: null,
			maxLeadTime: 30,
		})
	})
})
