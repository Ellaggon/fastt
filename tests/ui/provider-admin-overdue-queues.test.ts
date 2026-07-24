import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { parseProviderComplianceQueueFilter } from "@/lib/provider-admin-compliance"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function visibleCopy(source: string) {
	return source.replace(/^---[\s\S]*?---\s*/m, "")
}

describe("S3-4 admin overdue queues + manual verify copy", () => {
	it("parses overdue and due_soon queue filters", () => {
		expect(parseProviderComplianceQueueFilter("overdue")).toBe("overdue")
		expect(parseProviderComplianceQueueFilter("due_soon")).toBe("due_soon")
		expect(parseProviderComplianceQueueFilter("all")).toBe("all")
		expect(parseProviderComplianceQueueFilter("pending")).toBe("verification")
		expect(parseProviderComplianceQueueFilter("nope")).toBe("all")
	})

	it("wires SLA overdue/due_soon queues and never shows override copy in admin payments", () => {
		const admin = read("src/pages/admin/providers.astro")
		const lib = read("src/lib/provider-admin-compliance.ts")
		const paymentsLib = read("src/lib/provider-payment-accounts.ts")
		const visible = visibleCopy(admin)

		expect(lib).toContain('| "overdue"')
		expect(lib).toContain('| "due_soon"')
		expect(lib).toContain("dueSoon")
		expect(lib).toContain("sortBySlaUrgency")
		expect(lib).toContain('slaState === "overdue"')

		expect(admin).toContain('data-sla-queue="overdue"')
		expect(admin).toContain('data-sla-queue="due_soon"')
		expect(admin).toContain('data-sla-alert="overdue"')
		expect(admin).toContain("Ver cola vencida")
		expect(admin).toContain('id: "overdue"')
		expect(admin).toContain('id: "due_soon"')
		expect(admin).toContain("Verificar manualmente")
		expect(visible).not.toContain("override")
		expect(visible).not.toContain("Verificar (override)")
		expect(visible).not.toContain("perfil financiero")
		expect(visible).toContain("verificar manualmente")

		expect(paymentsLib).toContain('path: "manual_verify"')
		expect(paymentsLib).not.toContain('path: "admin_override"')
	})
})
