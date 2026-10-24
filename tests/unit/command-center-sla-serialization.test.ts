import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const driver = vi.hoisted(() => ({ unsafe: vi.fn() }))

vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()
	const { drizzle } = await import("drizzle-orm/postgres-js")
	const client = {
		options: { parsers: {}, serializers: {} },
		unsafe: driver.unsafe,
	}
	return { ...original, db: drizzle(client as never) }
})

import { listCommandCenterCases } from "@/modules/casework/application/queries/command-center"

describe("Command Center SLA timestamp parameters", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] })
		vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"))
		driver.unsafe.mockReset().mockImplementation((_query: string, params: unknown[]) => {
			// Drizzle disables postgres-js date serializers: wire values must already be strings.
			for (const value of params) Buffer.byteLength(value as string)
			return { values: async () => [] }
		})
	})

	afterEach(() => vi.useRealTimers())

	it("serializes both inclusive bounds of the upcoming eight-hour window", async () => {
		await expect(listCommandCenterCases({ sla: "due_soon" })).resolves.toMatchObject({
			items: [],
		})
		const [query, params] = driver.unsafe.mock.calls[0]
		expect(query).toContain('"CaseSlaTimer"."dueAt" >=')
		expect(query).toContain('"CaseSlaTimer"."dueAt" <=')
		expect(params).toEqual(["running", "2026-10-16T12:00:00.000Z", "2026-10-16T20:00:00.000Z"])
	})

	it("serializes the overdue cutoff through the same timestamp mapping", async () => {
		await expect(listCommandCenterCases({ sla: "overdue" })).resolves.toMatchObject({
			items: [],
		})
		expect(driver.unsafe.mock.calls[0][1]).toEqual([
			"breached",
			"running",
			"2026-10-16T12:00:00.000Z",
		])
	})
})
