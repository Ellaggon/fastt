import { describe, expect, it } from "vitest"

import {
	buildGuestRoomPreviews,
	buildHoldRequest,
	computeNights,
	resolveInitialSelection,
	toRoomSectionRows,
} from "@/components/productUI/room-section.viewmodel"

describe("room-section viewmodel", () => {
	it("builds guest-facing room previews from profile, beds, amenities and photos", () => {
		const previews = buildGuestRoomPreviews({
			offers: [
				{
					variantId: "v1",
					variant: { id: "v1", name: "Suite Andes", maxOccupancy: 3 },
					variantImages: [
						{ id: "img2", url: "https://example.com/second.jpg", order: 2, isPrimary: false },
						{ id: "img1", url: "https://example.com/main.jpg", order: 1, isPrimary: true },
					],
				},
			],
			hotelRoom: [
				{
					id: "v1",
					roomTypeName: "Suite",
					sizeM2: 42,
					viewType: "al jardín",
					bathroomCount: 1,
					bathroomType: "private",
					maxOccupancyOverride: 3,
					hasBalcony: true,
					guestFacingNotes: "Acceso por segundo piso.",
					beds: [
						{ id: "queen", count: 1, roomLabel: "Dormitorio principal" },
						{ id: "sofa_bed", count: 1, roomLabel: "Sala" },
					],
				},
			],
			amenities: [
				{ roomId: "v1", amenityName: "Wi-Fi", category: "Conectividad", isAvailable: true },
				{ roomId: "v1", amenityName: "Minibar", category: "Confort", isAvailable: true },
				{ roomId: "v1", amenityName: "TV", category: "Confort", isAvailable: false },
			],
			productFallbackImage: "https://example.com/fallback.jpg",
		})

		expect(previews).toHaveLength(1)
		expect(previews[0].imageUrl).toBe("https://example.com/main.jpg")
		expect(previews[0].roomName).toBe("Suite Andes")
		expect(previews[0].roomTypeName).toBe("Suite")
		expect(previews[0].sleepSummary).toContain("Queen")
		expect(previews[0].sleepAreas).toEqual([
			expect.objectContaining({ label: "Dormitorio principal" }),
			expect.objectContaining({ label: "Sala" }),
		])
		expect(previews[0].bathroomSummary).toBe("1 baño privado")
		expect(previews[0].occupancySummary).toBe("Hasta 3 huéspedes")
		expect(previews[0].sizeSummary).toBe("42 m²")
		expect(previews[0].viewSummary).toBe("Vista al jardín")
		expect(previews[0].amenityLabels).toEqual(["Wi-Fi", "Minibar"])
		expect(previews[0].guestFacingNotes).toBe("Acceso por segundo piso.")
	})

	it("maps rate plans with total + nightly price clarity", () => {
		const rows = toRoomSectionRows({
			offers: [
				{
					variantId: "v1",
					variant: { id: "v1", name: "Suite" },
					ratePlans: [
						{
							ratePlanId: "rp1",
							name: "Flexible",
							totalPrice: 39.6,
							policySummary: "Cancelación gratis",
							policyHighlights: {
								cancellation: "Gratis hasta 24h",
								payment: "Paga en el hotel",
							},
						},
					],
				},
			],
			hotelRoom: [{ id: "v1", sizeM2: 30, hasView: "mar", bathroom: 1, maxOccupancy: 2 }],
			nights: 3,
			fallbackImage: "https://example.com/fallback.jpg",
		})

		expect(rows).toHaveLength(1)
		expect(rows[0].totalPrice).toBe(39.6)
		expect(rows[0].nightlyPrice).toBe(13.2)
		expect(rows[0].nights).toBe(3)
		expect(rows[0].isSellable).toBe(true)
		expect(rows[0].availabilityLabel).toBe("Disponible")
	})

	it("selection uses explicit query first, then sellable fallback", () => {
		const rows = [
			{
				variantId: "v1",
				ratePlanId: "rp1",
				isSellable: false,
			},
			{
				variantId: "v1",
				ratePlanId: "rp2",
				isSellable: true,
			},
		] as any

		const queryHit = resolveInitialSelection(rows, { variantId: "v1", ratePlanId: "rp1" })
		expect(queryHit).toEqual({ variantId: "v1", ratePlanId: "rp1" })

		const fallback = resolveInitialSelection(rows, { variantId: "v2", ratePlanId: "missing" })
		expect(fallback).toEqual({ variantId: "v1", ratePlanId: "rp2" })
	})

	it("builds hold payload from selected rate plan context", () => {
		const payload = buildHoldRequest({
			variantId: "v1",
			ratePlanId: "rp42",
			from: "2026-05-10",
			to: "2026-05-15",
			occupancy: 1,
		})

		expect(payload).toEqual({
			variantId: "v1",
			ratePlanId: "rp42",
			dateRange: { from: "2026-05-10", to: "2026-05-15" },
			occupancy: 1,
		})
	})

	it("computes nights correctly for valid and invalid ranges", () => {
		expect(computeNights("2026-05-10", "2026-05-15")).toBe(5)
		expect(computeNights("2026-05-15", "2026-05-10")).toBe(0)
	})
})
