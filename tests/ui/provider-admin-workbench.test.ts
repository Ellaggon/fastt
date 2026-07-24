import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { parseProviderComplianceQueueFilter } from "@/lib/provider-admin-compliance"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-5 admin workbench: default queue + case drawer + mobile stack", () => {
	it("defaults empty filter to overdue SLA queue", () => {
		expect(parseProviderComplianceQueueFilter(null)).toBe("overdue")
		expect(parseProviderComplianceQueueFilter(undefined)).toBe("overdue")
		expect(parseProviderComplianceQueueFilter("")).toBe("overdue")
		expect(parseProviderComplianceQueueFilter("all")).toBe("all")
		expect(parseProviderComplianceQueueFilter("overdue")).toBe("overdue")
	})

	it("wires workbench chrome, single active queue nav, and case drawer", () => {
		const admin = read("src/pages/admin/providers.astro")
		const lib = read("src/lib/provider-admin-compliance.ts")

		expect(lib).toContain('if (!value) return "overdue"')
		expect(lib).toContain("S4-5")

		expect(admin).toContain("data-admin-workbench")
		expect(admin).toContain("data-admin-queue-nav")
		expect(admin).toContain("data-admin-workbench-grid")
		expect(admin).toContain("data-admin-queue-panel")
		expect(admin).toContain("data-case-drawer")
		expect(admin).toContain("data-case-drawer-backdrop")
		expect(admin).toContain("data-case-drawer-close")
		expect(admin).toContain("data-case-open")
		expect(admin).toContain("Abrir caso")
		expect(admin).not.toContain("Abrir 360°")
		expect(admin).toContain("caseHref(")
		expect(admin).toContain("Cola activa:")
		expect(admin).toContain('(default SLA)"')
		expect(admin).toContain("max-lg:hidden")
		expect(admin).toContain("overflow-x-auto")
		expect(admin).toContain('id: "overdue"')
		expect(admin).toContain("Workbench ops")
	})
})
