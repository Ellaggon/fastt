import { describe, expect, it } from "vitest"

import { GET } from "@/pages/api/internal/search/search-runtime-health"

describe("search runtime health endpoint", () => {
	it("returns the unified decision health payload", async () => {
		const response = await GET({ request: new Request("http://localhost") } as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.ok).toBe(true)
		expect(["healthy", "degraded"]).toContain(payload.status)
		expect(payload.health).toBeTruthy()
	})
})
