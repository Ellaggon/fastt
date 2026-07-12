import { describe, expect, it } from "vitest"
import { db, DailyInventory, EffectivePricingV2, Image } from "astro:db"

import { productImageRepository, productRepository, subtypeRepository } from "@/container"
import { evaluateLaunchProgress } from "@/lib/playbook/evaluate-launch-progress"
import { upsertProductContent, upsertProductLocation } from "@/modules/catalog/public"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

function addDaysIso(start: string, offset: number) {
	const date = new Date(`${start}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + offset)
	return date.toISOString().slice(0, 10)
}

async function insertVariantImage(variantId: string) {
	await db.insert(Image).values({
		id: `img_launch_${crypto.randomUUID()}`,
		entityType: "variant",
		entityId: variantId,
		objectKey: `rooms/${variantId}/main.jpg`,
		url: `https://example.com/rooms/${variantId}/main.jpg`,
		order: 0,
		isPrimary: true,
	})
}

describe("integration/playbook launch progress", () => {
	it("marks rate, conditions and calendar complete for a hotel with variant, tariff, pricing and inventory", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `prov_launch_${suffix}`
		const destinationId = `dest_launch_${suffix}`
		const productId = `prod_launch_${suffix}`
		const variantId = `var_launch_${suffix}`
		const templateId = `rpt_launch_${suffix}`
		const ratePlanId = `rp_launch_${suffix}`
		const occupancyKey = buildOccupancyKey(
			normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
		)

		await upsertDestination({
			id: destinationId,
			name: "Launch Test Destination",
			type: "city",
			country: "CL",
			slug: `launch-test-${suffix}`,
		})
		await upsertProvider({
			id: providerId,
			displayName: "Launch Test Provider",
			ownerEmail: `launch-${suffix}@example.com`,
		})
		await upsertProduct({
			id: productId,
			name: "Launch Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertProductContent(
			{ repo: productRepository },
			{
				productId,
				description: "A complete hotel description for launch progress.",
				highlightsJson: JSON.stringify(["Central", "Comfortable"]),
			}
		)
		await upsertProductLocation(
			{ repo: productRepository },
			{
				productId,
				address: "Launch Test Address",
				lat: -16.4958,
				lng: -68.1333,
			}
		)
		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/launch-product.jpg",
			order: 0,
			isPrimary: true,
		})
		await subtypeRepository.insertHotelStandalone({ productId })
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Launch Suite",
			currency: "USD",
			basePrice: 120,
			isActive: true,
			minOccupancy: 1,
			maxOccupancy: 2,
		})
		await insertVariantImage(variantId)
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Flexible launch",
			paymentType: "prepaid",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
			baseAmount: 120,
			baseCurrency: "USD",
		})
		await db.insert(EffectivePricingV2).values({
			id: `ep_launch_${suffix}`,
			variantId,
			ratePlanId,
			date: "2026-08-01",
			occupancyKey,
			baseComponent: 120,
			occupancyAdjustment: 0,
			ruleAdjustment: 0,
			finalBasePrice: 120,
			currency: "USD",
			computedAt: new Date(),
			sourceVersion: "test",
		})
		await db.insert(DailyInventory).values(
			Array.from({ length: 30 }, (_, index) => ({
				id: `di_launch_${suffix}_${index}`,
				variantId,
				date: addDaysIso("2026-08-01", index),
				totalInventory: 3,
				reservedCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			}))
		)

		const progress = await evaluateLaunchProgress(productId, providerId, {
			isHotel: true,
			variantId,
			ratePlanId,
			currentStepId: "calendar",
		})

		expect(progress).toBeTruthy()
		expect(progress?.variantId).toBe(variantId)
		expect(progress?.ratePlanId).toBe(ratePlanId)

		const byKey = new Map(progress?.steps.map((step) => [step.key, step]))
		expect(byKey.get("rate")?.complete).toBe(true)
		expect(byKey.get("conditions")?.complete).toBe(true)
		expect(byKey.get("calendar")?.complete).toBe(true)
		expect(byKey.get("calendar")?.href).toBe(
			`/rates/calendar?focus=availability&variantId=${encodeURIComponent(variantId)}&ratePlanId=${encodeURIComponent(ratePlanId)}&playbook=launch&step=calendar&flow=create`
		)
		expect(progress?.nextStep).toBe("house-rules")
		expect(progress?.nextHref).toBe(
			`/provider/house-rules?productId=${encodeURIComponent(productId)}&playbook=launch&step=house-rules&flow=create`
		)
	})
})
