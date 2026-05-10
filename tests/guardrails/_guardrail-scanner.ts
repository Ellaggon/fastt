import { readFileSync } from "node:fs"
import { join } from "node:path"

export type GuardrailRule = {
	name: string
	pattern: RegExp
}

export function readSource(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

export function scanFileWithRules(relativePath: string, rules: GuardrailRule[]): string[] {
	const content = readSource(relativePath)
	const violations: string[] = []
	for (const rule of rules) {
		rule.pattern.lastIndex = 0
		if (rule.pattern.test(content)) {
			violations.push(`${relativePath} -> ${rule.name}`)
		}
	}
	return violations
}

export function scanFilesWithRules(relativePaths: string[], rules: GuardrailRule[]): string[] {
	return relativePaths.flatMap((relativePath) => scanFileWithRules(relativePath, rules))
}
