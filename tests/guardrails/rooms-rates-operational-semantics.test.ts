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
		const restrictionsSurface = read("src/lib/rates/restrictionsSurface.ts")
		const effectiveRestrictionMaterializer = read(
			"src/modules/policies/infrastructure/materializers/recompute-effective-restrictions.db.ts"
		)
		const effectiveRestrictionUseCase = read(
			"src/modules/policies/application/use-cases/recompute-effective-restrictions.ts"
		)
		const searchMaterialization = read(
			"src/modules/search/application/use-cases/materialize-search-unit.ts"
		)
		const sellabilityCompatibility = read(
			"src/modules/search/application/services/LegacySellabilityCompatibility.ts"
		)
		const effectiveAvailabilityRecompute = read(
			"src/modules/inventory/application/use-cases/recompute-effective-availability-range.ts"
		)
		const searchStayEvaluation = read(
			"src/modules/search/application/queries/evaluate-stay-from-view.ts"
		)
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
		expect(restrictions).toContain("Bloqueos comerciales viven en Restrictions")
		expect(restrictions).toContain("Usa Stop Sell para cerrar venta")
		expect(restrictions).toContain("Impacto operativo")
		expect(restrictions).toContain("data-impact-example")
		expect(restrictions).toContain("data-impact-non-effect")
		expect(restrictions).toContain("Reglas de restricciones")
		expect(restrictions).toContain("Search evalua estas señales")
		expect(restrictions).toContain("resolveVerticalVocabulary")
		expect(restrictions).toContain("buildRestrictionOperationalCopyRegistry")
		expect(restrictionsSurface).toContain("recomputeEffectiveRestrictionsForScope")
		expect(restrictionsSurface).toContain("materializeSearchUnitRange")
		expect(effectiveRestrictionUseCase).toContain("configureEffectiveRestrictionsMaterializer")
		expect(effectiveRestrictionMaterializer).toContain("EffectiveRestriction")
		expect(effectiveRestrictionMaterializer).toContain("ratePlanId")
		expect(effectiveRestrictionMaterializer).toContain("stop_sell")
		expect(effectiveRestrictionMaterializer).toContain("cta")
		expect(effectiveRestrictionMaterializer).toContain("ctd")
		expect(effectiveRestrictionMaterializer).toContain("min_los")
		expect(effectiveRestrictionMaterializer).toContain("max_los")
		expect(effectiveRestrictionMaterializer).toContain("min_lead_time")
		expect(effectiveRestrictionMaterializer).toContain("max_lead_time")
		expect(searchMaterialization).toContain("resolveSearchSellability")
		expect(searchMaterialization).not.toContain("restrictionRow?.stopSell ??")
		expect(searchMaterialization).toContain(
			"const isAvailable = hasAvailability && availableUnits > 0"
		)
		expect(sellabilityCompatibility).toContain("missing_effective_restriction_compatibility")
		expect(sellabilityCompatibility).toContain("usedMissingEffectiveRestrictionCompatibility")
		expect(sellabilityCompatibility).not.toContain("params.availabilityRow?.stopSell")
		expect(effectiveAvailabilityRecompute).not.toContain("stopSell:")
		expect(effectiveAvailabilityRecompute).not.toContain("isSellable:")
		expect(effectiveAvailabilityRecompute).not.toContain("daily?.stopSell")
		expect(searchStayEvaluation).toContain("MAX_STAY_EXCEEDED")
		expect(searchStayEvaluation).toContain("MIN_LEAD_TIME_NOT_MET")
		expect(searchStayEvaluation).toContain("MAX_LEAD_TIME_EXCEEDED")
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
		const inventoryBulk = read("src/pages/inventory/bulk.astro")
		const variantInventory = read("src/pages/product/[id]/variants/[variantId]/inventory.astro")
		const surfaces = read("src/lib/rates/calendarSurfaces.ts")
		const mobileInteraction = read("src/lib/rates/mobileCalendarInteraction.ts")
		const mobileSheetStyles = read("src/components/rates/MobileCalendarSheetStyles.astro")

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
		expect(pricing).toContain("Sin precio")
		expect(pricing).toContain("data-pricing-day-card")
		expect(pricing).toContain("pricingDayEditor")
		expect(pricing).toContain("mobile-calendar-action-sheet")
		expect(pricing).toContain("MobileCalendarSheetStyles")
		expect(pricing).toContain("mobile-calendar-grid")
		expect(pricing).toContain("mobile-priority-signal")
		expect(pricing).toContain("data-mobile-calendar-summary")
		expect(pricing).toContain("data-mobile-operational-summary")
		expect(pricing).toContain("grid-cols-7")
		expect(pricing).not.toContain("@keyframes mobile-sheet-enter")
		expect(pricing).toContain("pricingSheetBackdrop")
		expect(pricing).toContain("pricingSheetCloseBtn")
		expect(pricing).toContain("pricingSheetExpandBtn")
		expect(pricing).toContain('data-sheet-state="compact"')
		expect(pricing).toContain("createMobileActionSheet")
		expect(pricing).toContain("findNextSelectableDate")
		expect(pricing).toContain("flashAppliedRange")
		expect(pricing).toContain("updateSelectedPricingCells")
		expect(pricing).toContain("data-pricing-quick-delta")
		expect(pricing).toContain("Seguimos con")
		expect(pricing).not.toContain("data-pricing-day-form")
		expect(pricing).not.toContain("Seleccionar rango")
		expect(pricing).toContain("data-pricing-intelligence-strip")
		expect(pricing).toContain("MaterializationFreshnessStrip")
		expect(pricing).toContain("Actualizacion operacional")
		expect(pricing).toContain("Ajuste manual")
		expect(pricing).toContain("con restricciones")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-preview")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(pricing).toContain("Regenerar")
		expect(inventory).toContain("Calendario de inventario")
		expect(inventory).toContain("Operacion avanzada")
		expect(inventory).toContain("data-inventory-advanced-panel")
		expect(inventory).toContain("Abrir flujo avanzado")
		expect(inventory).toContain("Inventory responde cuantos cupos existen")
		expect(inventory).toContain("Restrictions controla si esos cupos pueden venderse")
		expect(inventory).toContain("/api/inventory/update-day")
		expect(inventory).toContain("Ajustar cupo fisico del rango")
		expect(inventory).toContain("data-inventory-range-preset")
		expect(inventory).toContain("inventoryRangeClearBtn")
		expect(inventory).toContain("data-inventory-day-card")
		expect(inventory).toContain("inventoryDayEditor")
		expect(inventory).toContain("mobile-calendar-action-sheet")
		expect(inventory).toContain("MobileCalendarSheetStyles")
		expect(inventory).toContain("mobile-calendar-grid")
		expect(inventory).toContain("mobile-priority-signal")
		expect(inventory).toContain("data-mobile-calendar-summary")
		expect(inventory).toContain("data-mobile-operational-summary")
		expect(inventory).toContain("grid-cols-7")
		expect(inventory).not.toContain("@keyframes mobile-sheet-enter")
		expect(inventory).toContain("inventorySheetBackdrop")
		expect(inventory).toContain("inventorySheetCloseBtn")
		expect(inventory).toContain("inventorySheetExpandBtn")
		expect(inventory).toContain('data-sheet-state="compact"')
		expect(inventory).toContain("createMobileActionSheet")
		expect(inventory).toContain("findNextSelectableDate")
		expect(inventory).toContain("flashAppliedRange")
		expect(inventory).toContain("updateSelectedInventoryCells")
		expect(inventory).toContain("data-inventory-quick-delta")
		expect(inventory).toContain("Seguimos con")
		expect(inventory).not.toContain("data-inventory-day-form")
		expect(inventory).not.toContain("Seleccionar rango")
		expect(inventory).toContain("data-inventory-intelligence-strip")
		expect(inventory).toContain("MaterializationFreshnessStrip")
		expect(inventory).toContain("Actualizacion operacional")
		expect(inventory).toContain("Cupo bajo")
		expect(inventory).toContain("Agotado fisico")
		expect(inventory).toContain("vendibilidad se opera en Restrictions")
		expect(inventory).toContain("/api/inventory/bulk-preview")
		expect(inventory).toContain("/api/inventory/bulk-apply")
		expect(inventory).toContain('type: "set_inventory"')
		expect(inventory).not.toContain('type: "open_sales"')
		expect(inventory).not.toContain('type: "close_sales"')
		expect(inventoryBulk).not.toContain('value="open_sales"')
		expect(inventoryBulk).not.toContain('value="close_sales"')
		expect(inventoryBulk).not.toContain("Abrir ventas")
		expect(inventoryBulk).not.toContain("Cerrar ventas")
		expect(variantInventory).not.toContain("Cerrar ventas")
		expect(variantInventory).not.toContain("Abrir ventas")
		expect(variantInventory).toContain("Gestionar Restrictions")
		expect(surfaces).toContain("buildPricingCalendarSurface")
		expect(surfaces).toContain("buildInventoryCalendarSurface")
		expect(surfaces).toContain("EffectivePricingV2")
		expect(surfaces).toContain("EffectiveAvailability")
		expect(surfaces).toContain("EffectiveRestriction")
		expect(surfaces).toContain("restrictionSignals")
		expect(surfaces).toContain("evaluateMaterializationFreshness")
		expect(surfaces).toContain("SearchUnitView")
		expect(read("src/pages/api/internal/materialization-health.ts")).toContain(
			"buildPricingCalendarSurface"
		)
		expect(read("src/pages/api/internal/materialization-health.ts")).toContain(
			"buildInventoryCalendarSurface"
		)
		expect(read("src/pages/api/internal/materialization-health.ts")).toContain(
			"evaluateMaterializationReadiness"
		)
		expect(read("src/pages/api/internal/materialization-health.ts")).toContain("diagnostics")
		expect(read("src/lib/rates/calendarRangeOperations.ts")).toContain("selectCalendarRangePreset")
		expect(read("src/lib/rates/calendarRangeOperations.ts")).toContain("commercialBlockers")
		expect(mobileInteraction).toContain("createMobileActionSheet")
		expect(mobileInteraction).toContain("window.visualViewport")
		expect(mobileInteraction).toContain("(max-height: 480px) and (pointer: coarse)")
		expect(mobileInteraction).toContain("touchstart")
		expect(mobileInteraction).toContain("touchmove")
		expect(mobileInteraction).toContain("mobile-sheet-dragging")
		expect(mobileInteraction).toContain("velocity")
		expect(mobileInteraction).toContain("findNextSelectableDate")
		expect(mobileInteraction).toContain("flashAppliedRange")
		expect(mobileSheetStyles).toContain("env(safe-area-inset-bottom)")
		expect(mobileSheetStyles).toContain("(max-height: 480px) and (pointer: coarse)")
		expect(mobileSheetStyles).toContain("mobile-sheet-settling")
		expect(mobileSheetStyles).toContain("mobile-calendar-grid")
		expect(mobileSheetStyles).toContain("@keyframes mobile-sheet-enter")
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

	it("keeps legacy Inventory sellability compatibility explicit and off canonical surfaces", () => {
		const dbConfig = read("db/config.ts")
		const bulkService = read(
			"src/modules/inventory/application/use-cases/bulk-inventory-service.ts"
		)
		const bulkPreviewApi = read("src/pages/api/inventory/bulk-preview.ts")
		const bulkApplyApi = read("src/pages/api/inventory/bulk-apply.ts")
		const updateDayApi = read("src/pages/api/inventory/update-day.ts")
		const bulkUpdateApi = read("src/pages/api/inventory/bulk-update.ts")
		const inventory = read("src/pages/inventory/index.astro")
		const inventoryBulk = read("src/pages/inventory/bulk.astro")
		const inventoryHoldRepository = read(
			"src/modules/inventory/infrastructure/repositories/InventoryHoldRepository.ts"
		)
		const inventoryCalendarApi = read("src/pages/api/inventory/calendar.ts")

		expect(dbConfig).not.toContain("SearchUnitView_product_date_occ_sellable_idx")
		expect(dbConfig).not.toContain("SearchUnitView_sellable_price_idx")
		expect(bulkService).not.toContain("LEGACY_SELLABILITY_INVENTORY_OPERATIONS")
		expect(bulkService).not.toContain("open_sales")
		expect(bulkService).not.toContain("close_sales")
		expect(bulkService).not.toContain("stopSell")
		expect(bulkPreviewApi).not.toContain("open_sales")
		expect(bulkPreviewApi).not.toContain("close_sales")
		expect(bulkPreviewApi).not.toContain('"OPEN"')
		expect(bulkPreviewApi).not.toContain('"CLOSE"')
		expect(bulkApplyApi).not.toContain("open_sales")
		expect(bulkApplyApi).not.toContain("close_sales")
		expect(bulkApplyApi).not.toContain('"OPEN"')
		expect(bulkApplyApi).not.toContain('"CLOSE"')
		expect(updateDayApi).not.toContain("stopSell")
		expect(bulkUpdateApi).not.toContain("stopSell")
		expect(inventory).not.toContain('type: "open_sales"')
		expect(inventory).not.toContain('type: "close_sales"')
		expect(inventoryBulk).not.toContain('value="open_sales"')
		expect(inventoryBulk).not.toContain('value="close_sales"')
		expect(inventoryBulk).toContain("Gestionar vendibilidad en Restrictions")
		expect(inventoryHoldRepository).not.toContain("DailyInventory.stopSell")
		expect(inventoryCalendarApi).not.toContain("EffectiveAvailability.stopSell")
		expect(inventoryCalendarApi).not.toContain("isSellable")
		expect(inventoryCalendarApi).toContain("Inventory")
		expect(inventoryCalendarApi).toContain("physical-only")
	})
})
