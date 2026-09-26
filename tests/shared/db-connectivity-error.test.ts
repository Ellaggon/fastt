import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	DATABASE_CONNECTIVITY_PUBLIC_MESSAGE,
	isTransientDatabaseConnectivityError,
} from "@/shared/infrastructure/db/connectivity-error"

const root = new URL("../../", import.meta.url)

describe("database connectivity errors", () => {
	it("detects DNS failures against the pooler without treating them as application bugs", () => {
		const error = Object.assign(new Error("getaddrinfo ENOTFOUND aws-0-sa-east-1.pooler.supabase.com"), {
			code: "ENOTFOUND",
		})
		expect(isTransientDatabaseConnectivityError(error)).toBe(true)
		expect(isTransientDatabaseConnectivityError(new Error("provider already exists"))).toBe(false)
		expect(DATABASE_CONNECTIVITY_PUBLIC_MESSAGE).not.toMatch(/supabase|enotfound|getaddrinfo/i)
	})

	it("prefers IPv4 DNS before opening the postgres pool", () => {
		const client = readFileSync(new URL("src/shared/infrastructure/db/client.ts", root), "utf8")
		expect(client).toContain("preferIpv4Dns()")
	})

	it("maps connectivity failures in middleware to a retry page instead of leaking Node DNS text", () => {
		const middleware = readFileSync(new URL("src/middleware.ts", root), "utf8")
		expect(middleware).toContain("isTransientDatabaseConnectivityError")
		expect(middleware).toContain("/estado-servicio")
	})
})
