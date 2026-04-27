import { describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"

const MODULES_ROOT = path.resolve(process.cwd(), "src/modules")
const IMPORT_RE = /from\s+["']astro:db["']/

async function walk(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true })
	const files: string[] = []
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await walk(full)))
			continue
		}
		if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
			files.push(full)
		}
	}
	return files
}

describe("architecture boundary: application layer must not import astro:db", () => {
	it("has no direct astro:db imports under src/modules/*/application", async () => {
		const moduleNames = await fs.readdir(MODULES_ROOT)
		const offenders: string[] = []

		for (const moduleName of moduleNames) {
			const appDir = path.join(MODULES_ROOT, moduleName, "application")
			try {
				const stats = await fs.stat(appDir)
				if (!stats.isDirectory()) continue
			} catch {
				continue
			}

			const files = await walk(appDir)
			for (const file of files) {
				const content = await fs.readFile(file, "utf8")
				if (IMPORT_RE.test(content)) {
					offenders.push(path.relative(process.cwd(), file))
				}
			}
		}

		expect(offenders).toEqual([])
	})
})
