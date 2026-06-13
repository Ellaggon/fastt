import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/inventory legacy redirects", () => {
	it("inventory bulk redirects to calendar availability", () => {
		const source = read("src/pages/inventory/bulk.astro")
		expect(source).toContain("routes.pricing()")
		expect(source).toContain('target.searchParams.set("focus", "availability")')
		expect(source).toContain('target.searchParams.set("source", "inventory-bulk-redirect")')
		expect(source).toContain("return Astro.redirect")
		expect(source).not.toContain("/api/inventory/bulk-preview")
		expect(source).not.toContain("/api/inventory/bulk-apply")
	})

	it("inventory redirects to calendar availability", () => {
		const source = read("src/pages/inventory/index.astro")
		expect(source).toContain("routes.pricing()")
		expect(source).toContain('target.searchParams.set("focus", "availability")')
		expect(source).toContain('target.searchParams.set("source", "inventory-redirect")')
		expect(source).toContain("return Astro.redirect")
		expect(source).not.toContain("Diagnóstico físico de cupos")
		expect(source).not.toContain("mobile-calendar-grid")
	})
})
