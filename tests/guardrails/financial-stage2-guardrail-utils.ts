import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

export function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

export function listFiles(dir: string): string[] {
	const root = join(process.cwd(), dir)
	const out: string[] = []
	for (const entry of readdirSync(root)) {
		const full = join(root, entry)
		const stat = statSync(full)
		if (stat.isDirectory()) out.push(...listFiles(join(dir, entry)))
		else if (/\.ts$|\.astro$/.test(entry)) out.push(join(dir, entry))
	}
	return out
}

export const financialSourceFiles = [
	...listFiles("src/modules/financial"),
	...listFiles("src/pages/api/internal/financial"),
	"src/pages/financial/index.astro",
]

export function financialSourceWithoutTests(): string {
	return financialSourceFiles.map((file) => `\n// ${file}\n${read(file)}`).join("\n")
}
