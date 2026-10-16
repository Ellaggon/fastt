import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ email: "operator@example.test" }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: async () => ({ id: "operator", email: session.email }) }))
import InternalAccessDenied from "@/components/admin/InternalAccessDenied.astro"

describe("permission denial after successful authentication", () => {
	it("identifies the signed-in account and explains that MFA does not grant a role", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(InternalAccessDenied, { request: new Request("https://fastt.test/admin") })
		expect(html).toContain("operator@example.test")
		expect(html).toContain("pero no concede permisos internos")
		expect(html).toContain("Repetir el código temporal no resuelve este bloqueo")
		expect(html).not.toContain('href="/auth/mfa')
	})
	it("renders the account as escaped text", async () => {
		session.email = '<img src=x onerror="alert(1)">@example.test'
		const container = await AstroContainer.create()
		const html = await container.renderToString(InternalAccessDenied, { request: new Request("https://fastt.test/admin") })
		expect(html).not.toContain('<img src=x')
		expect(html).toContain("&lt;img")
	})
})
