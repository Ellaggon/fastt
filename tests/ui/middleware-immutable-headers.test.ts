import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("middleware observability headers", () => {
	it("rebuilds immutable redirect responses instead of mutating headers in place", () => {
		const middleware = read("src/middleware.ts")
		expect(middleware).toContain("withObservabilityHeaders")
		expect(middleware).toContain("immutable")
		expect(middleware).toMatch(/new Response\(response\.body/)
		expect(middleware).toContain("X-Fastt-Request-Id")
	})

	it("can attach headers to an undici redirect Response", () => {
		const redirect = Response.redirect("http://localhost:4321/provider/settings/verification", 303)
		expect(() => redirect.headers.set("X-Test", "1")).toThrow(/immutable/i)

		const nextHeaders = new Headers(redirect.headers)
		nextHeaders.set("X-Fastt-Request-Id", "req_test")
		const rebuilt = new Response(redirect.body, {
			status: redirect.status,
			statusText: redirect.statusText,
			headers: nextHeaders,
		})
		expect(rebuilt.status).toBe(303)
		expect(rebuilt.headers.get("location")).toContain("/provider/settings/verification")
		expect(rebuilt.headers.get("X-Fastt-Request-Id")).toBe("req_test")
	})
})
