import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const sensitiveRoutes = [
	"src/pages/api/admin/providers/verification.ts",
	"src/pages/api/admin/providers/tax-configuration.ts",
	"src/pages/api/admin/providers/payment-accounts.ts",
	"src/pages/api/admin/providers/documents.ts",
	"src/pages/api/admin/providers/documents/preview.ts",
	"src/pages/api/admin/policies/exceptions.ts",
	"src/pages/api/admin/policies/exceptions/[id].ts",
]

describe("sensitive admin command MFA boundary", () => {
	it("requires recent internal authentication on every implemented sensitive command", () => {
		for (const path of sensitiveRoutes) {
			const source = readFileSync(resolve(process.cwd(), path), "utf8")
			expect(source, path).toContain("requireRecentInternalAuthentication")
		}
	})
})
