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

	it("keeps restrictions as the active sellability surface with operational controls", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const restrictions = read("src/pages/rates/restrictions.astro")
		const vocabulary = read("src/lib/verticalVocabulary.ts")
		const operationalCopy = read("src/lib/rates/restrictionOperationalCopy.ts")
		const ratePlanQueryRepository = read(
			"src/modules/pricing/infrastructure/repositories/RatePlanQueryRepository.ts"
		)

		expect(governance).toContain("Official sellability domain")
		expect(governance).toContain("Restrictions")
		expect(governance).toContain('pattern: "/rates/restrictions",\n\t\tstatus: "canonical"')
		expect(governance).not.toContain('planned: ["ARI Summary", "Restrictions"')
		expect(restrictions).toContain("Crear restriccion")
		expect(restrictions).toContain("Impacto operativo")
		expect(restrictions).toContain("data-impact-example")
		expect(restrictions).toContain("data-impact-non-effect")
		expect(restrictions).toContain("Reglas de restricciones")
		expect(restrictions).toContain("Search evalua estas señales")
		expect(restrictions).toContain("resolveVerticalVocabulary")
		expect(restrictions).toContain("buildRestrictionOperationalCopyRegistry")
		expect(vocabulary).toContain("habitacion")
		expect(vocabulary).toContain("salida")
		expect(vocabulary).toContain("plan tarifario")
		expect(operationalCopy).toContain("No cambia cupos fisicos")
		expect(operationalCopy).toContain("Una busqueda con check-in")
		expect(restrictions).not.toContain("editor dedicado madura en Fase 3")
		expect(restrictions).not.toContain("Rooms & Rates · Control de vendibilidad")
		expect(governance).not.toContain(
			"Future restriction workspace; no runtime channel manager exists yet."
		)
		expect(governance).not.toContain("Rooms & Rates is the enterprise ARI hub")
		expect(ratePlanQueryRepository).toContain('scope === "rate_plan"')
		expect(ratePlanQueryRepository).toContain('scope === "variant"')
		expect(ratePlanQueryRepository).toContain('scope === "product"')
	})

	it("keeps Pricing and Inventory as calendar-first operational owners with Bulk as secondary action", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const routes = read("src/lib/routes.ts")
		const pricing = read("src/pages/pricing/index.astro")
		const inventory = read("src/pages/inventory/index.astro")
		const surfaces = read("src/lib/rates/calendarSurfaces.ts")

		expect(routes).toContain('pricing: () => "/pricing"')
		expect(routes).toContain('inventory: () => "/inventory"')
		expect(governance).toContain('label: "Pricing"')
		expect(governance).toContain("href: routes.pricing()")
		expect(governance).toContain('label: "Inventory"')
		expect(governance).toContain("href: routes.inventory()")
		expect(governance).toContain("Contextual advanced workflow")
		expect(governance).not.toContain('"Pricing Calendar", "Inventory Calendar"')
		expect(pricing).toContain("Calendario de precios")
		expect(pricing).toContain("Operacion avanzada")
		expect(pricing).toContain("data-pricing-advanced-panel")
		expect(pricing).toContain("Abrir flujo avanzado")
		expect(pricing).toContain("Pricing responde cuanto cuesta")
		expect(pricing).toContain("Restrictions responde cuando se puede vender")
		expect(pricing).toContain("/api/pricing/rules/v2/create")
		expect(pricing).toContain("Aplicar precio al rango")
		expect(pricing).toContain("data-pricing-range-preset")
		expect(pricing).toContain("pricingRangeClearBtn")
		expect(pricing).toContain("Multi-plan avanzado")
		expect(pricing).toContain("Pricing gap")
		expect(pricing).toContain("Override")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-preview")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(pricing).toContain("Regenerar")
		expect(inventory).toContain("Calendario de inventario")
		expect(inventory).toContain("Operacion avanzada")
		expect(inventory).toContain("data-inventory-advanced-panel")
		expect(inventory).toContain("Abrir flujo avanzado")
		expect(inventory).toContain("Inventory responde cuantos cupos quedan")
		expect(inventory).toContain("Restrictions responde si la venta")
		expect(inventory).toContain("/api/inventory/update-day")
		expect(inventory).toContain("Ajustar cupo fisico del rango")
		expect(inventory).toContain("data-inventory-range-preset")
		expect(inventory).toContain("inventoryRangeClearBtn")
		expect(inventory).toContain("Low inventory")
		expect(inventory).toContain("Sold out fisico")
		expect(inventory).toContain("/api/inventory/bulk-preview")
		expect(inventory).toContain("/api/inventory/bulk-apply")
		expect(inventory).toContain('type: "set_inventory"')
		expect(inventory).not.toContain('type: "open_sales"')
		expect(inventory).not.toContain('type: "close_sales"')
		expect(surfaces).toContain("buildPricingCalendarSurface")
		expect(surfaces).toContain("buildInventoryCalendarSurface")
		expect(surfaces).toContain("EffectivePricingV2")
		expect(surfaces).toContain("EffectiveAvailability")
		expect(read("src/lib/rates/calendarRangeOperations.ts")).toContain("selectCalendarRangePreset")
	})

	it("keeps legacy catalog restriction HTTP APIs removed from the product tree", () => {
		const legacyRestrictionApiFiles = walkFiles(join(process.cwd(), "src/pages/api/products"), [
			".ts",
		]).filter((relativePath) => relativePath.includes("/restrictions/"))

		expect(legacyRestrictionApiFiles).toEqual([])

		const catalogPublicApi = read("src/modules/catalog/public.ts")
		expect(catalogPublicApi).not.toContain("create-restriction")
		expect(catalogPublicApi).not.toContain("CatalogRestrictionRepositoryPort")
	})
})
