import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

function toPosix(value: string): string {
	return value.replace(/\\/g, "/")
}

function walkFiles(root: string, extensions: string[]): string[] {
	if (!existsSync(root)) return []
	const out: string[] = []
	function walk(current: string): void {
		for (const entry of readdirSync(current)) {
			const abs = join(current, entry)
			const stats = statSync(abs)
			if (stats.isDirectory()) {
				walk(abs)
				continue
			}
			if (stats.isFile() && extensions.some((extension) => abs.endsWith(extension))) {
				out.push(toPosix(relative(process.cwd(), abs)))
			}
		}
	}
	walk(root)
	return out.sort()
}

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const semanticRoots = [
	"src/pages/rates",
	"src/pages/pricing",
	"src/pages/inventory",
	"src/pages/product",
	"src/components/pricing",
	"src/components/productUI",
]

const semanticFiles = [
	...semanticRoots.flatMap((root) => walkFiles(join(process.cwd(), root), [".astro", ".ts"])),
	"src/lib/backoffice-governance.ts",
	"src/pages/api/internal/variant-summary.ts",
	"src/pages/api/pricing/base-rate.ts",
].sort()

const physicalContextFiles = [
	...walkFiles(join(process.cwd(), "src/pages/product"), [".astro", ".ts"]),
	...walkFiles(join(process.cwd(), "src/pages/inventory"), [".astro", ".ts"]),
	...walkFiles(join(process.cwd(), "src/components/productUI"), [".astro", ".ts"]),
].sort()

describe("Guardrail: Rooms & Rates operational semantics", () => {
	it("blocks legacy pricing language from active Rooms & Rates surfaces", () => {
		const bannedCopy = [
			/Precio base/i,
			/Tarifa base/i,
			/Rate plan por defecto/i,
			/plan por defecto/i,
			/Nueva arquitectura\s*\(fase 1\)/i,
			/estado comercial de la variante/i,
			/Configurar precios/i,
			/Editar precios/i,
			/Default plans/i,
		]

		const violations = semanticFiles.flatMap((relativePath) => {
			const source = read(relativePath)
			return bannedCopy.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: banned legacy copy ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Rooms & Rates surfaces must use rate-plan-first commercial language:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("prevents physical variant surfaces from routing into Rate Plans as variant-owned pricing", () => {
		const violations = physicalContextFiles.flatMap((relativePath) => {
			const source = read(relativePath)
			return /\/rates\/plans\?[^"'`]*variantId/.test(source)
				? [
						`${relativePath}: physical context must not link to Rate Plans with variantId selector query`,
					]
				: []
		})

		expect(
			violations,
			`Variant and inventory surfaces may open Rooms & Rates as related commercial context, but not as variant-owned pricing:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps the Rooms & Rates hub framed as operational coordination, not a link directory", () => {
		const hub = read("src/pages/rates/plans/index.astro")

		expect(hub).toContain("ARI Command Center")
		expect(hub).toContain("ARI command domains")
		expect(hub).toContain("Operational readiness lanes")
		expect(hub).toContain("Physical readiness")
		expect(hub).toContain("Commercial readiness")
		expect(hub).toContain("Sellability readiness")
		expect(hub).toContain("La capa física")
		expect(hub).toContain("La capa comercial")
		expect(hub).not.toContain("Default plans")
		expect(hub).not.toContain("window.location.href = `/rates/plans?")
	})

	it("keeps restrictions as the active sellability domain without pretending to have a full editor", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const restrictions = read("src/pages/rates/restrictions.astro")

		expect(governance).toContain("Official sellability domain")
		expect(governance).toContain("Restrictions")
		expect(governance).toContain('pattern: "/rates/restrictions",\n\t\tstatus: "canonical"')
		expect(governance).not.toContain('planned: ["ARI Summary", "Restrictions"')
		expect(restrictions).toContain("editor dedicado madura en Fase 3")
		expect(restrictions).toContain("Domain active")
		expect(restrictions).toContain("search evaluation")
		expect(governance).not.toContain(
			"Future restriction workspace; no runtime channel manager exists yet."
		)
	})
})
