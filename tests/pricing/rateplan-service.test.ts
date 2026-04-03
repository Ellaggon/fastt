import { describe, it, expect, vi } from "vitest"
import { RatePlanService } from "@/modules/pricing/public"

describe("pricing/services/RatePlanService", () => {
	it("returns candidates from selectBestRatePlan flow", async () => {
		const variantRepo = {
			getById: vi.fn(async () => ({
				id: "v1",
				productId: "p1",
				entityType: "hotel_room",
				entityId: "hr1",
				pricing: { basePrice: 100, currency: "USD" },
				capacity: { minOccupancy: 1, maxOccupancy: 2 },
			})),
			existsById: vi.fn(async () => true),
		}

		const ratePlanRepo = {
			getActiveByVariant: vi.fn(async () => [{ id: "rp1" }]),
			getDefaultByVariant: vi.fn(async () => null),
		}

		const priceRuleRepo = {
			getActive: vi.fn(async () => []),
		}

		const candidates = [{ id: "rp1", name: "Plan", price: 100, priority: 1 }]
		const ratePlanEngine = {
			selectFromMemory: vi.fn(() => candidates),
		}

		const svc = new RatePlanService({
			variantRepo,
			ratePlanRepo,
			priceRuleRepo,
			ratePlanEngine: ratePlanEngine as any,
		})

		const out = await svc.getAvailableRatePlans(
			"v1",
			new Date("2026-03-10"),
			new Date("2026-03-11")
		)

		expect(out).toEqual(candidates)
		expect(variantRepo.getById).toHaveBeenCalledWith("v1")
		expect(ratePlanRepo.getActiveByVariant).toHaveBeenCalledWith("v1")
		expect(priceRuleRepo.getActive).toHaveBeenCalledWith("rp1")
		expect(ratePlanEngine.selectFromMemory).toHaveBeenCalledTimes(1)
	})
})
