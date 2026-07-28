import { describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"

const SOURCE_ROOT = path.resolve(process.cwd(), "src")
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

describe("architecture boundary: Astro DB must not return", () => {
	it("has no direct astro:db imports under src", async () => {
		const offenders: string[] = []
		const files = await walk(SOURCE_ROOT)
		for (const file of files) {
			const content = await fs.readFile(file, "utf8")
			if (IMPORT_RE.test(content)) {
				offenders.push(path.relative(process.cwd(), file))
			}
		}

		expect(offenders).toEqual([])
	})
})
