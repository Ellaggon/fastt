import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Guardrail: hold occupancy detail contract", () => {
	it("keeps occupancyDetail as canonical input and rooms as separate dimension", () => {
		const source = read("src/pages/api/inventory/hold.ts")

		expect(source).toContain("occupancyDetail: z.object(")
		expect(source).toContain("rooms: z.number().int().min(1).default(1)")
		expect(source).toContain("normalizeOccupancy(params.occupancyDetail)")
	})

	it("stores snapshot with occupancyDetail and rooms, not numeric occupancy as canonical source", () => {
		const source = read("src/pages/api/inventory/hold.ts")

		expect(source).toContain("occupancyDetail: parsed.occupancyDetail")
		expect(source).toContain("rooms: parsed.rooms")
		expect(source).toContain("hold_legacy_numeric_occupancy_used")
		expect(source).toContain("occupancyDetailFromRaw ??")
	})
})
