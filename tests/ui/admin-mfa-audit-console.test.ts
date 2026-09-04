import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

describe("command center MFA recovery and audit console", () => {
	it("returns a blocked sensitive command to MFA with the current admin context", () => {
		const providersPage = read("src/pages/admin/providers.astro")
		expect(providersPage).toContain("if (res.status === 401)")
		expect(providersPage).toContain("/auth/mfa?returnTo=")
		expect(providersPage).toContain("currentReturnTo")
		expect(providersPage).toContain("deberás repetir la acción")
	})

	it("keeps MFA return destinations safe and explains the explicit retry", () => {
		const mfaPage = read("src/pages/auth/mfa.astro")
		expect(mfaPage).toContain("sanitizeReturnTo")
		expect(mfaPage).toContain("returnsToCommandCenter")
		expect(mfaPage).toContain("repetirse manualmente")
	})

	it("offers a separate, permission-gated AuditEvent console", () => {
		const page = read("src/pages/admin/audit.astro")
		const readModel = read("src/lib/audit/audit-console.ts")
		expect(page).toContain('requireInternalPermission(Astro.request, "audit.read")')
		expect(page).toContain("Auditoría operativa")
		expect(page).toContain("Request ID")
		expect(readModel).toContain("AuditEvent")
		expect(readModel).toContain("before/after snapshots out of the UI")
		expect(readModel).toContain("desc(AuditEvent.createdAt)")
	})
})
