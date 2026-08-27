import { describe, expect, it } from "vitest"

import {
	buildGuestStayExpectationsSnapshot,
	createHouseRule,
	deleteHouseRule,
	listEffectiveHouseRules,
	listHouseRulesByProduct,
} from "@/modules/house-rules/public"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/house-rules variant scope", () => {
	it("persists variant overrides, merges effective rules, and snapshots inherited|override", async () => {
		const geoPlaceId = `dest_hrv_${crypto.randomUUID()}`
		const productId = `prod_hrv_${crypto.randomUUID()}`
		const variantId = `var_hrv_${crypto.randomUUID()}`

		await upsertGeoPlace({
			id: geoPlaceId,
			name: "House Rules Variant Destination",
			type: "city",
			country: "CL",
			slug: `hrv-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "House Rules Variant Hotel",
			productType: "Hotel",
			geoPlaceId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Suite Norte",
		})

		const hotelSmoking = await createHouseRule({
			productId,
			type: "Smoking",
			payload: { kind: "Smoking", allowed: false, area: "not_allowed" },
		})
		await createHouseRule({
			productId,
			type: "QuietHours",
			payload: { kind: "QuietHours", start: "22:00", end: "08:00" },
		})

		const productOnly = await listHouseRulesByProduct(productId)
		expect(productOnly.every((rule) => rule.scope === "product" && rule.scopeId === null)).toBe(
			true
		)
		expect(productOnly.some((rule) => rule.type === "Smoking")).toBe(true)

		const beforeOverride = await listEffectiveHouseRules(productId, variantId)
		expect(beforeOverride.find((rule) => rule.type === "Smoking")).toMatchObject({
			id: hotelSmoking.id,
			source: "inherited",
		})

		const roomSmoking = await createHouseRule({
			productId,
			type: "Smoking",
			scope: "variant",
			scopeId: variantId,
			payload: { kind: "Smoking", allowed: true, area: "rooms" },
		})

		const afterOverride = await listEffectiveHouseRules(productId, variantId)
		expect(afterOverride.find((rule) => rule.type === "Smoking")).toMatchObject({
			id: roomSmoking.id,
			scope: "variant",
			scopeId: variantId,
			source: "override",
		})
		expect(afterOverride.find((rule) => rule.type === "QuietHours")).toMatchObject({
			source: "inherited",
		})

		const upserted = await createHouseRule({
			productId,
			type: "Smoking",
			scope: "variant",
			scopeId: variantId,
			payload: { kind: "Smoking", allowed: true, area: "designated_areas" },
		})
		expect(upserted.id).toBe(roomSmoking.id)

		const snapshot = await buildGuestStayExpectationsSnapshot(productId, {
			variantId,
			capturedAt: new Date("2026-08-26T12:00:00.000Z"),
		})
		expect(snapshot.variantId).toBe(variantId)
		expect(snapshot.version).toMatch(/^house_rule_snapshot:v2:/)
		expect(snapshot.rules.map((rule) => `${rule.type}:${rule.source}`).sort()).toEqual([
			"QuietHours:inherited",
			"Smoking:override",
		])
		expect(snapshot.rules.find((rule) => rule.type === "Smoking")?.summary).toContain(
			"áreas designadas"
		)

		await deleteHouseRule(roomSmoking.id)
		const afterDelete = await listEffectiveHouseRules(productId, variantId)
		expect(afterDelete.find((rule) => rule.type === "Smoking")).toMatchObject({
			id: hotelSmoking.id,
			source: "inherited",
		})
	})

	it("rejects non-overridable types and invalid variant scope", async () => {
		const geoPlaceId = `dest_hrv_bad_${crypto.randomUUID()}`
		const productId = `prod_hrv_bad_${crypto.randomUUID()}`
		const variantId = `var_hrv_bad_${crypto.randomUUID()}`

		await upsertGeoPlace({
			id: geoPlaceId,
			name: "House Rules Invalid Destination",
			type: "city",
			country: "CL",
			slug: `hrv-bad-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "House Rules Invalid Hotel",
			productType: "Hotel",
			geoPlaceId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Suite",
		})

		await expect(
			createHouseRule({
				productId,
				type: "QuietHours",
				scope: "variant",
				scopeId: variantId,
				payload: { kind: "QuietHours", start: "22:00", end: "08:00" },
			})
		).rejects.toThrow(/type_not_overridable/)

		await expect(
			createHouseRule({
				productId,
				type: "Smoking",
				scope: "variant",
				scopeId: "missing-room",
				payload: { kind: "Smoking", allowed: true, area: "rooms" },
			})
		).rejects.toThrow(/variant_invalid/)
	})
})
