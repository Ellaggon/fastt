import { readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

function toPosix(value: string): string {
	return value.replace(/\\/g, "/")
}

export function listFilesUnderRoot(rootRelativePath: string, extension = ".ts"): string[] {
	const cwd = process.cwd()
	const absoluteRoot = join(cwd, rootRelativePath)
	const out: string[] = []

	function walk(currentAbsPath: string): void {
		const entries = readdirSync(currentAbsPath)
		for (const entry of entries) {
			const absoluteEntry = join(currentAbsPath, entry)
			const stats = statSync(absoluteEntry)
			if (stats.isDirectory()) {
				walk(absoluteEntry)
				continue
			}
			if (!stats.isFile() || !absoluteEntry.endsWith(extension)) continue
			out.push(toPosix(relative(cwd, absoluteEntry)))
		}
	}

	walk(absoluteRoot)
	return out.sort()
}
