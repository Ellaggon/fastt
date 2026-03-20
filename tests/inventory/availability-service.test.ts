import { describe, it, expect, vi } from "vitest"
import { AvailabilityService } from "@/modules/inventory/public"
import type { DailyInventoryRepositoryPort } from "@/modules/inventory/public"

describe("inventory/services/AvailabilityService", () => {
	it("delegates to repo.getRange and returns true when can reserve", async () => {
		const repo: DailyInventoryRepositoryPort = {
			getRange: vi.fn(async () => [
				{ totalInventory: 5, reservedCount: 2 }, // 3 (min)
				{ totalInventory: 5, reservedCount: 1 }, // 4
			]),
			upsert: vi.fn(async () => {}),
		}

		const service = new AvailabilityService(repo)

		const checkIn = new Date("2026-03-10")
		const checkOut = new Date("2026-03-12")

		const ok = await service.canReserve("variant_1", checkIn, checkOut, 3)

		expect(repo.getRange).toHaveBeenCalledTimes(1)
		expect(repo.getRange).toHaveBeenCalledWith("variant_1", checkIn, checkOut)
		expect(ok).toBe(true)
	})

	it("returns false when repo returns no days", async () => {
		const repo: DailyInventoryRepositoryPort = {
			getRange: vi.fn(async () => []),
			upsert: vi.fn(async () => {}),
		}

		const service = new AvailabilityService(repo)

		const ok = await service.canReserve(
			"variant_1",
			new Date("2026-03-10"),
			new Date("2026-03-12"),
			1
		)

		expect(ok).toBe(false)
	})
})
