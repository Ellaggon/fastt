import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

const args = process.argv.slice(2)
const mode =
	args.find((arg) => arg === "--changed" || arg === "--all" || arg === "--staged") ?? "--staged"
const explicitFiles = args.filter((arg) => !arg.startsWith("--"))
const files =
	explicitFiles.length > 0
		? explicitFiles
		: mode === "--all"
			? execSync("git ls-files src", { encoding: "utf8" }).split("\n").filter(Boolean)
			: execSync(
					mode === "--changed"
						? "git diff --name-only --diff-filter=ACMRT HEAD"
						: "git diff --cached --name-only --diff-filter=ACMRT",
					{ encoding: "utf8" }
				)
					.split("\n")
					.filter(Boolean)

const targetFiles = files.filter(
	(file) =>
		file.startsWith("src/") &&
		(file.endsWith(".astro") || file.endsWith(".tsx") || file.endsWith(".jsx")) &&
		!file.startsWith("src/components/ui/")
)

const rawObjectPatterns = [
	{ name: "raw button with class", pattern: /<button\b[^>]*\bclass=/ },
	{ name: "raw input with class", pattern: /<input\b[^>]*\bclass=/ },
	{ name: "raw select with class", pattern: /<select\b[^>]*\bclass=/ },
	{ name: "raw textarea with class", pattern: /<textarea\b[^>]*\bclass=/ },
	{ name: "raw dialog", pattern: /<dialog\b/ },
	{
		name: "legacy external-reference token",
		pattern: /airbnb-|bg-blue-|text-blue-|border-blue-|bg-neutral|text-neutral|border-neutral/,
	},
]

const allowedNativeInputs = /\btype=["'](?:hidden|checkbox|radio)["']/
const violations = []

for (const file of targetFiles) {
	const source = readFileSync(file, "utf8")
	const lines = source.split("\n")
	for (const [index, line] of lines.entries()) {
		for (const rule of rawObjectPatterns) {
			if (!rule.pattern.test(line)) continue
			if (rule.name === "raw input with class" && allowedNativeInputs.test(line)) continue
			violations.push(`${file}:${index + 1} ${rule.name}`)
		}
	}
}

if (violations.length > 0) {
	console.error("UI no-regression rule failed. Use src/components/ui/* for repeatable UI objects.")
	console.error(violations.join("\n"))
	process.exit(1)
}

console.log(
	targetFiles.length
		? "UI no-regression rule passed."
		: "UI no-regression rule skipped: no matching files."
)
