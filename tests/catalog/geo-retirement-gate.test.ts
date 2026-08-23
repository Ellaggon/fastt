import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("marketplace geography retirement gate", () => {
	it("requires source and database evidence before a destructive retirement", () => {
		const script = readFileSync("scripts/db/verify-legacy-geography-retirement.ts", "utf8")

		expect(script).toContain("findRuntimeConsumers")
		expect(script).toContain("products_with_legacy_destination")
		expect(script).toContain("events_with_legacy_destination")
		expect(script).toContain("--database")
		expect(script).toContain("Legacy geography retirement is not safe")
	})
})
