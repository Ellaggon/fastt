import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const adminApiRoot = resolve(process.cwd(), "src/pages/api/admin")

function routeFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(dir, entry.name)
		if (entry.isDirectory()) return routeFiles(path)
		return entry.isFile() && path.endsWith(".ts") ? [path] : []
	})
}

describe("admin API mutation authorization", () => {
	it("uses granular IAM permissions for every mutation route", () => {
		const mutationRouteFiles = routeFiles(adminApiRoot).filter((path) => {
			const source = readFileSync(path, "utf8")
			return /export const (POST|PATCH|PUT|DELETE): APIRoute/.test(source)
		})

		expect(mutationRouteFiles.length).toBeGreaterThan(0)
		for (const path of mutationRouteFiles) {
			const source = readFileSync(path, "utf8")
			expect(source, path).toContain("requireInternalPermission")
			expect(source, path).not.toContain("requireInternalAdmin")
		}
	})
})
