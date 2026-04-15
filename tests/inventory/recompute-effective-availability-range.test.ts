import { describe, expect, it } from "vitest"

import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/application/use-cases/recompute-effective-availability-range"

type DailyRow = { date: string; totalInventory: number; stopSell: boolean }
type LockRow = { date: string; quantity: number; expiresAt: Date; bookingId: string | null }

function makeDeps(params: { dailyRows: DailyRow[]; lockRows: LockRow[]; now?: Date }) {
	const store = new Map<string, any>()

	return {
		deps: {
			async loadDailyInventoryRange() {
				return params.dailyRows
			},
			async loadInventoryLocksRange() {
				return params.lockRows
			},
			async upsertEffectiveAvailabilityRows(rows: any[]) {
				for (const row of rows) {
					store.set(`${row.variantId}:${row.date}`, { ...row })
				}
			},
			now: () => params.now ?? new Date("2026-05-01T00:00:00.000Z"),
		},
		store,
	}
}

describe("inventory/use-cases/recomputeEffectiveAvailabilityRange", () => {
	it("fecha con inventory y sin locks", async () => {
		const { deps, store } = makeDeps({
			dailyRows: [{ date: "2026-05-02", totalInventory: 5, stopSell: false }],
			lockRows: [],
		})

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_1",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "test",
				idempotencyKey: "k1",
			},
			deps
		)

		const row = store.get("var_1:2026-05-02")
		expect(row.totalUnits).toBe(5)
		expect(row.heldUnits).toBe(0)
		expect(row.bookedUnits).toBe(0)
		expect(row.availableUnits).toBe(5)
		expect(row.stopSell).toBe(false)
		expect(row.isSellable).toBe(true)
	})

	it("fecha con heldUnits (lock activo sin bookingId)", async () => {
		const { deps, store } = makeDeps({
			dailyRows: [{ date: "2026-05-02", totalInventory: 5, stopSell: false }],
			lockRows: [
				{
					date: "2026-05-02",
					quantity: 2,
					expiresAt: new Date("2026-05-02T12:00:00.000Z"),
					bookingId: null,
				},
			],
			now: new Date("2026-05-02T08:00:00.000Z"),
		})

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_2",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "test",
			},
			deps
		)

		const row = store.get("var_2:2026-05-02")
		expect(row.heldUnits).toBe(2)
		expect(row.bookedUnits).toBe(0)
		expect(row.availableUnits).toBe(3)
		expect(row.isSellable).toBe(true)
	})

	it("fecha con bookedUnits (lock con bookingId)", async () => {
		const { deps, store } = makeDeps({
			dailyRows: [{ date: "2026-05-02", totalInventory: 5, stopSell: false }],
			lockRows: [
				{
					date: "2026-05-02",
					quantity: 3,
					expiresAt: new Date("2026-05-01T00:00:00.000Z"),
					bookingId: "booking_1",
				},
			],
		})

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_3",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "test",
			},
			deps
		)

		const row = store.get("var_3:2026-05-02")
		expect(row.heldUnits).toBe(0)
		expect(row.bookedUnits).toBe(3)
		expect(row.availableUnits).toBe(2)
		expect(row.isSellable).toBe(true)
	})

	it("fecha sin DailyInventory aplica fallback seguro", async () => {
		const { deps, store } = makeDeps({
			dailyRows: [],
			lockRows: [],
		})

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_4",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "test",
			},
			deps
		)

		const row = store.get("var_4:2026-05-02")
		expect(row.totalUnits).toBe(0)
		expect(row.stopSell).toBe(true)
		expect(row.availableUnits).toBe(0)
		expect(row.isSellable).toBe(false)
	})

	it("rerun sobre mismo rango es idempotente en valores de negocio", async () => {
		const { deps, store } = makeDeps({
			dailyRows: [{ date: "2026-05-02", totalInventory: 4, stopSell: false }],
			lockRows: [
				{
					date: "2026-05-02",
					quantity: 1,
					expiresAt: new Date("2026-05-03T00:00:00.000Z"),
					bookingId: null,
				},
				{
					date: "2026-05-02",
					quantity: 1,
					expiresAt: new Date("2026-05-01T00:00:00.000Z"),
					bookingId: "booking_2",
				},
			],
			now: new Date("2026-05-02T12:00:00.000Z"),
		})

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_5",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "first",
			},
			deps
		)
		const first = { ...store.get("var_5:2026-05-02") }

		await recomputeEffectiveAvailabilityRange(
			{
				variantId: "var_5",
				from: "2026-05-02",
				to: "2026-05-03",
				reason: "second",
			},
			deps
		)
		const second = { ...store.get("var_5:2026-05-02") }

		expect(second.totalUnits).toBe(first.totalUnits)
		expect(second.heldUnits).toBe(first.heldUnits)
		expect(second.bookedUnits).toBe(first.bookedUnits)
		expect(second.availableUnits).toBe(first.availableUnits)
		expect(second.stopSell).toBe(first.stopSell)
		expect(second.isSellable).toBe(first.isSellable)
	})
})
