import { describe, expect, it } from "vitest"

import {
	CHANNEX_CONTENT_FIELD_MAP,
	EXPEDIA_CONTENT_FIELD_MAP,
	assertValidChannelContentDraft,
	channexFieldsForLayer,
	layersPresentInDraft,
	projectChannelContent,
	validateChannelContentDraft,
} from "@/lib/channel-manager/content"

describe("channel-manager/channel content projection", () => {
	it("projects property smoking, unit smoking, and rate cancellation onto distinct layers", () => {
		const draft = projectChannelContent({
			productId: "hotel_1",
			productHouseRules: [
				{
					type: "Smoking",
					payload: { kind: "Smoking", allowed: false, area: "not_allowed" },
				},
				{
					type: "Pets",
					payload: { kind: "Pets", allowed: false },
				},
				{
					type: "CheckIn",
					payload: {
						kind: "CheckIn",
						checkInFrom: "15:00",
						checkInUntil: "22:00",
					},
				},
			],
			variantHouseRules: [
				{
					variantId: "room_smoking",
					type: "Smoking",
					payload: { kind: "Smoking", allowed: true, area: "rooms" },
				},
			],
			productCheckInPolicy: { checkInFrom: "15:00", checkOutUntil: "11:00" },
			rateCommercialPolicies: [
				{
					ratePlanId: "rate_flex",
					category: "Cancellation",
					content: { preset: "flexible" },
				},
				{
					ratePlanId: "rate_flex",
					category: "Payment",
					content: { preset: "pay_later" },
				},
			],
			rateArrivalExceptions: [
				{
					ratePlanId: "rate_late",
					checkInFrom: "12:00",
					checkInUntil: "23:00",
					checkOutUntil: "14:00",
				},
			],
		})

		expect(draft.property.layer).toBe("property")
		expect(draft.property.houseRules.map((r) => r.type)).toEqual(["Smoking", "Pets", "CheckIn"])
		expect(draft.units).toHaveLength(1)
		expect(draft.units[0]?.smoking?.payload.allowed).toBe(true)
		expect(draft.rateCommercial).toHaveLength(1)
		expect(draft.rateCommercial[0]?.cancellation).toEqual({ preset: "flexible" })
		expect(draft.rateCommercial[0]?.payment).toEqual({ preset: "pay_later" })
		expect(draft.rateScheduleExceptions).toEqual([
			{
				layer: "rate_schedule_exception",
				ratePlanId: "rate_late",
				checkInFrom: "12:00",
				checkInUntil: "23:00",
				checkOutUntil: "14:00",
			},
		])
		expect(layersPresentInDraft(draft)).toEqual([
			"property",
			"unit",
			"rate_commercial",
			"rate_schedule_exception",
		])
		expect(validateChannelContentDraft(draft)).toEqual([])
		expect(() => assertValidChannelContentDraft(draft)).not.toThrow()
	})

	it("rejects CheckIn commercial rows and non-physical unit overrides", () => {
		expect(() =>
			projectChannelContent({
				productId: "hotel_1",
				productHouseRules: [],
				rateCommercialPolicies: [
					{
						ratePlanId: "rate_1",
						category: "CheckIn",
						content: {},
					},
				],
			})
		).toThrow(/rate_check_in_must_use_schedule_exception/)

		expect(() =>
			projectChannelContent({
				productId: "hotel_1",
				productHouseRules: [],
				variantHouseRules: [
					{
						variantId: "room_1",
						type: "QuietHours",
						payload: { kind: "QuietHours", start: "22:00", end: "07:00" },
					},
				],
			})
		).toThrow(/unit_property_only|type_not_overridable|channel_content/)

		expect(() =>
			projectChannelContent({
				productId: "hotel_1",
				productHouseRules: [],
				variantHouseRules: [
					{
						variantId: "room_1",
						type: "Parties",
						payload: { kind: "Parties", allowed: true },
					},
				],
			})
		).toThrow(/unit_property_only|type_not_overridable|channel_content/)
	})

	it("maps Channex and Expedia vocabularies without collapsing layers", () => {
		expect(channexFieldsForLayer("property").some((r) => r.channexField.includes("smoking"))).toBe(
			true
		)
		expect(channexFieldsForLayer("unit").some((r) => r.channexField === "room_type.smoking")).toBe(
			true
		)
		expect(
			channexFieldsForLayer("rate_commercial").some((r) => r.channexField.includes("cancellation"))
		).toBe(true)
		expect(
			CHANNEX_CONTENT_FIELD_MAP.every((row) =>
				["property", "unit", "rate_commercial", "rate_schedule_exception"].includes(row.layer)
			)
		).toBe(true)

		const expediaLayers = new Set(EXPEDIA_CONTENT_FIELD_MAP.map((r) => r.layer))
		expect(expediaLayers.has("property")).toBe(true)
		expect(expediaLayers.has("unit")).toBe(true)
		expect(expediaLayers.has("rate_commercial")).toBe(true)
		expect(EXPEDIA_CONTENT_FIELD_MAP.find((r) => r.layer === "unit")?.expediaSurface).toMatch(
			/smoking preference/i
		)
		expect(
			EXPEDIA_CONTENT_FIELD_MAP.find((r) => r.layer === "rate_commercial")?.expediaSurface
		).toMatch(/Cancellation/i)
	})
})
