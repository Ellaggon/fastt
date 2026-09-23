import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (relativePath: string) => readFileSync(new URL(relativePath, root), "utf8")

describe("auth session refresh wiring", () => {
	it("refreshes sessions in middleware before page handlers run", () => {
		const middleware = read("src/middleware.ts")
		const ensure = read("src/lib/auth/ensureAuthSession.ts")
		const client = read("src/lib/auth/supabaseClient.ts")

		expect(middleware).toContain("ensureAuthSessionForRequest")
		expect(ensure).toContain("refreshSessionWithToken")
		expect(client).toContain("grant_type=refresh_token")
	})

	it("documents the local persistent session flag", () => {
		const envExample = read(".env.example")
		expect(envExample).toContain("AUTH_DEV_PERSISTENT_SESSION=true")
	})
})
