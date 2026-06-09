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
	"src/pages/api/internal/room-summary.ts",
	"src/pages/api/pricing/base-rate.ts",
].sort()

const physicalContextFiles = [
	...walkFiles(join(process.cwd(), "src/pages/product"), [".astro", ".ts"]),
	...walkFiles(join(process.cwd(), "src/pages/inventory"), [".astro", ".ts"]),
	...walkFiles(join(process.cwd(), "src/components/productUI"), [".astro", ".ts"]),
].sort()

describe("Guardrail: Rooms & Rates operational semantics", () => {
	it("resolves occupancy-specific price overrides through PriceRule", () => {
		const dbConfig = read("db/config.ts")
		const priceRule = dbConfig.match(/const PriceRule = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""

		expect(dbConfig).not.toContain("const RatePlanOccupancyOverride")
		expect(dbConfig).not.toContain("RatePlanOccupancyOverride,")
		expect(priceRule).toContain("occupancyKey")
		expect(priceRule).toContain('type: column.text({ default: "modifier" })')
		expect(priceRule).toContain("dateRangeJson")
		expect(priceRule).toContain("priority")
	})

	it("keeps physical inventory units in VariantInventoryConfig", () => {
		const dbConfig = read("db/config.ts")
		const roomProfile =
			dbConfig.match(/const VariantRoomProfile = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const inventoryConfig =
			dbConfig.match(/const VariantInventoryConfig = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const variantCapacity =
			dbConfig.match(/const VariantCapacity = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""

		expect(roomProfile).not.toContain("totalRooms")
		expect(roomProfile).not.toContain("maxOccupancyOverride")
		expect(inventoryConfig).toContain("defaultTotalUnits")
		expect(variantCapacity).toContain("minOccupancy")
		expect(variantCapacity).toContain("maxOccupancy")
	})

	it("uses TaxFeeDefinition and TaxFeeAssignment as the only taxes/fees contract", () => {
		const dbConfig = read("db/config.ts")
		const catalogPublic = read("src/modules/catalog/public.ts")
		const catalogContainer = read("src/container/catalog.container.ts")

		expect(dbConfig).not.toContain("const TaxFee = defineTable")
		expect(dbConfig).not.toContain("\n\t\tTaxFee,")
		expect(dbConfig).toContain("const TaxFeeDefinition = defineTable")
		expect(dbConfig).toContain("const TaxFeeAssignment = defineTable")
		expect(catalogPublic).not.toContain("create-tax")
		expect(catalogPublic).not.toContain("update-tax")
		expect(catalogPublic).not.toContain("delete-tax")
		expect(catalogPublic).not.toContain("get-taxes")
		expect(catalogPublic).not.toContain("TaxFeeRepositoryPort")
		expect(catalogContainer).not.toContain(
			"modules/catalog/infrastructure/repositories/TaxFeeRepository"
		)
		expect(catalogContainer).not.toContain("taxFeeRepository")
	})

	it("documents source, derived, and snapshot table roles", () => {
		const dbConfig = read("db/config.ts")
		const taxonomy = read("docs/engineering/rooms-rates-table-taxonomy.md")
		const sourceTables = [
			"Variant",
			"RatePlan",
			"DailyInventory",
			"PriceRule",
			"Restriction",
			"PolicyGroup",
			"Policy",
			"PolicyAssignment",
			"PolicyRule",
			"PolicyExceptionRule",
			"PolicyAuditLog",
			"TaxFeeDefinition",
			"TaxFeeAssignment",
		]
		const derivedTables = [
			"EffectiveAvailability",
			"EffectivePricingV2",
			"EffectiveRestriction",
			"SearchUnitView",
		]
		const snapshotTables = ["Hold", "BookingRoomDetail", "BookingPolicySnapshot", "BookingTaxFee"]

		for (const table of [...sourceTables, ...derivedTables, ...snapshotTables]) {
			expect(dbConfig, `${table} must exist in db/config.ts`).toContain(
				`const ${table} = defineTable`
			)
			expect(taxonomy, `${table} must be classified in the table taxonomy`).toContain(
				`\`${table}\``
			)
		}

		expect(taxonomy).toContain("## Source Of Truth")
		expect(taxonomy).toContain("## Derived / Read Model")
		expect(taxonomy).toContain("## Snapshot")
		expect(taxonomy).toContain("New provider-facing mutations must target source-of-truth")
		expect(taxonomy).toContain("BookingTaxFee")
		expect(taxonomy).toContain("not the removed legacy `TaxFee` table")
	})

	it("blocks legacy pricing language from active Rooms & Rates surfaces", () => {
		const bannedCopy = [
			/Tarifa base/i,
			/Baseline comercial/i,
			/Base comercial/i,
			/Rate plan por defecto/i,
			/plan por defecto/i,
			/Nueva arquitectura\s*\(fase 1\)/i,
			/estado comercial de la variante/i,
			/Configurar precios/i,
			/Editar precios/i,
			/Default plans/i,
			/Continuación desde Pricing/i,
			/operar pricing/i,
			/dominio de pricing/i,
			/no en Pricing/i,
			/Reparar pricing/i,
			/pricing diario/i,
			/accurate pricing/i,
			/Pricing breakdown snapshot/i,
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

	it("keeps Tarifas as the visible client-first surface without a duplicate hub", () => {
		const manage = read("src/pages/rates/plans/manage.astro")
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		const intents = read("src/lib/rates/ratePlanIntentPresets.ts")
		const routes = read("src/lib/routes.ts")
		const subnav = read("src/components/pricing/PricingSubnav.astro")

		expect(existsSync(join(process.cwd(), "src/pages/rates/plans/index.astro"))).toBe(false)
		expect(routes).not.toContain("ratePlansHub")
		expect(subnav).not.toContain("Hub de tarifas")
		expect(manage).toContain("Tarifas")
		expect(manage).toContain("Crear tarifa")
		expect(manage).toContain("Elige una intención comercial")
		expect(manage).toContain("firstCommercialBlocker")
		expect(manage).toContain("isCommercialReady")
		expect(manage).toContain("Precio base")
		expect(manage).toContain("Inventario")
		expect(manage).toContain("Condiciones")
		expect(manage).toContain("Restricciones")
		expect(manage).toContain("Estado vendible")
		expect(manage).toContain("Lista")
		expect(manage).toContain("No lista")
		expect(manage).toContain("Resolver")
		expect(manage).toContain('calendarResolveHref(ratePlanId, "price")')
		expect(manage).toContain('calendarResolveHref(ratePlanId, "availability")')
		expect(manage).toContain("routes.ratePlanPolicies")
		expect(manage).not.toContain(">Precios</")
		expect(manage).not.toContain("Completar condiciones")
		expect(intents).toContain("Tarifa flexible")
		expect(intents).toContain("No reembolsable")
		expect(intents).toContain("Estadía larga")
		expect(intents).toContain("Anticipada")
		expect(manage).not.toContain("Nombre del plan")
		expect(detail).toContain("Ficha de tarifa")
		expect(detail).toContain("Editar intención de tarifa")
		expect(detail).not.toContain("Rate Plans")
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
		expect(governance).toContain("Restricciones de venta")
		expect(governance).toContain('pattern: "/rates/restrictions",\n\t\tstatus: "canonical"')
		expect(governance).not.toContain('planned: ["ARI Summary", "Restrictions"')
		expect(restrictions).toContain("Reglas de venta")
		expect(restrictions).toContain("Herramienta profesional de reglas de venta")
		expect(restrictions).toContain("reglas recurrentes, temporadas")
		expect(restrictions).toContain("Acciones por temporada")
		expect(restrictions).toContain("Crear conjunto avanzado")
		expect(restrictions).toContain("Reglas recurrentes")
		expect(restrictions).not.toContain("Crear restriccion")
		expect(restrictions).not.toContain("Bloqueos comerciales viven en Restricciones de venta")
		expect(restrictions).toContain("Impacto operativo")
		expect(restrictions).toContain("data-impact-example")
		expect(restrictions).toContain("data-impact-non-effect")
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

	it("keeps Pricing and Inventory as calendar-first operational owners with pricing extension inside Calendar", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const routes = read("src/lib/routes.ts")
		const pricing = read("src/pages/rates/calendar.astro")
		const inventory = read("src/pages/inventory/index.astro")
		const inventoryBulk = read("src/pages/inventory/bulk.astro")
		const variantInventory = read("src/pages/product/[id]/rooms/[roomId]/inventory.astro")
		const surfaces = read("src/lib/rates/calendarSurfaces.ts")
		const pricingAutomation = read("src/lib/pricing/pricingAutomationSurface.ts")
		const pricingOperationCopy = read("src/lib/pricing/pricingOperationCopy.ts")
		const pricingExtensionPresenter = read("src/lib/pricing/pricingExtensionPresenter.ts")
		const mobileInteraction = read("src/lib/rates/mobileCalendarInteraction.ts")
		const mobileSheetStyles = read("src/components/rates/MobileCalendarSheetStyles.astro")

		expect(routes).toContain('ratesCalendar: () => "/rates/calendar"')
		expect(routes).toContain('pricing: () => "/rates/calendar"')
		expect(routes).toContain('inventory: () => "/inventory"')
		expect(routes).toContain("focus=availability")
		expect(governance).toContain('label: "Calendario"')
		expect(governance).toContain("href: routes.pricing()")
		expect(governance).toContain('label: "Inventario físico"')
		expect(governance).toContain("href: routes.inventory()")
		expect(governance).toContain('pattern: "/product/:id/rooms/:roomId/inventory"')
		expect(governance).toContain("Compat redirect hacia /rates/calendar")
		expect(governance).toContain('label: "Tarifas"')
		expect(governance).toContain('label: "Restricciones de venta"')
		expect(governance).toContain("Contextual advanced workflow")
		expect(governance).not.toContain('"Pricing Calendar", "Inventory Calendar"')
		expect(pricing).toContain("Calendario operativo")
		expect(pricing).toContain("data-operational-calendar-panel")
		expect(pricing).toContain("contrato de tarifa")
		expect(pricing).toContain("pricingAddMonthBtn")
		expect(pricing).toContain("Añadir mes siguiente")
		expect(pricing).toContain("Ocultar mes siguiente")
		expect(pricing).toContain('data-pricing-extra-month="true"')
		expect(pricing).toContain("Ayudas recurrentes")
		expect(pricing).toContain("Reglas simples que actúan después")
		expect(pricing).toContain("data-pricing-automation-presets")
		expect(pricing).toContain("Descuentos")
		expect(pricing).toContain("Aumentos")
		expect(pricing).toContain("Precio fijo")
		expect(pricingAutomation).toContain("Descuento por porcentaje")
		expect(pricingAutomation).toContain("Reserva anticipada")
		expect(pricingAutomation).toContain("Último minuto")
		expect(pricingAutomation).toContain("Descuento por estadía")
		expect(pricingAutomation).toContain("Descuento por monto")
		expect(pricingAutomation).toContain("Aumento por porcentaje")
		expect(pricingAutomation).toContain("Aumento por monto")
		expect(pricingAutomation).toContain("Precio programado por fechas")
		expect(pricing).toContain("data-pricing-automation-card")
		expect(pricing).toContain("data-pricing-automation-review")
		expect(pricing).toContain("data-pricing-automation-preview")
		expect(`${pricing}\n${pricingAutomation}`).not.toContain("Promoción por porcentaje")
		expect(`${pricing}\n${pricingAutomation}`).not.toContain("Promoción simple")
		expect(`${pricing}\n${pricingAutomation}`).not.toContain("Precio fijo programado")
		expect(`${pricing}\n${pricingAutomation}`).not.toContain("Descuento fijo")
		expect(`${pricing}\n${pricingAutomation}`).not.toContain("Estadía larga")
		expect(`${pricing}\n${pricingOperationCopy}`).not.toContain("Manual = cambia ahora")
		expect(pricingExtensionPresenter).not.toContain("Aumentar este precio por %")
		expect(pricingExtensionPresenter).not.toContain("Reducir este precio por %")
		expect(pricingExtensionPresenter).not.toContain("Ajustar este precio por monto")
		expect(pricing).not.toContain("Más tipos de ayuda")
		expect(pricing).toContain("Crear ayuda recurrente")
		expect(pricing).toContain("Eliminar ayuda recurrente")
		expect(pricing).toContain("Confirmar eliminación")
		expect(pricing).toContain("Ayudas activas")
		expect(pricing).not.toContain("automationSurface.rules.slice(0, 12)")
		expect(pricing).not.toContain("Simple primero")
		expect(pricing).not.toContain("Tres intenciones, un solo origen")
		expect(pricing).not.toContain("Ayudas automáticas recurrentes")
		expect(pricing).not.toContain("data-pricing-advanced-panel")
		expect(pricing).not.toContain("Acciones avanzadas para la selección")
		expect(pricing).not.toContain("Extender cambio actual")
		expect(pricing).not.toContain("Convertir en ayuda recurrente")
		expect(pricing).toContain("Extender este cambio")
		expect(pricing).toContain("data-pricing-extension-drawer")
		expect(pricing).toContain("data-pricing-open-extension")
		expect(pricing).toContain("pricingExtensionDrawer")
		expect(pricing).toContain("Revisar extensión")
		expect(pricing).toContain("Hacer recurrente")
		expect(pricing).toContain("Opera precio, cupo, venta y condiciones por fecha")
		expect(pricing).toContain("Calendario operativo")
		expect(pricing).toContain("Precio final")
		expect(pricing).toContain("Cupo:")
		expect(pricing).toContain("Reservas:")
		expect(pricing).toContain("Holds:")
		expect(pricing).toContain("data-operational-status")
		expect(pricing).toContain("Contrato de tarifa")
		expect(pricing).toContain("Detalle técnico")
		expect(pricing).toContain('data-operational-tab="price"')
		expect(pricing).toContain('data-operational-tab="availability"')
		expect(pricing).toContain('data-operational-tab="restrictions"')
		expect(pricing).toContain('data-operational-tab="policies"')
		expect(pricing).toContain('data-operational-tab="technical"')
		expect(pricing).toContain("calendarMutationEndpoints")
		expect(pricing).toContain('pricingPreview: "/api/pricing/rules/v2/bulk-preview"')
		expect(pricing).toContain('pricingApply: "/api/pricing/rules/v2/bulk-apply"')
		expect(pricing).toContain('inventoryPreview: "/api/inventory/bulk-preview"')
		expect(pricing).toContain('inventoryApply: "/api/inventory/bulk-apply"')
		expect(pricing).toContain("buildPricingRangePayload")
		expect(pricing).toContain("buildInventoryRangePayload")
		expect(pricing).toContain("selectedRatePlanId")
		expect(pricing).toContain("selectedVariantId")
		expect(pricing).toContain('variantId: Astro.url.searchParams.get("variantId")')
		expect(pricing).toContain("data-panel-inventory-preview")
		expect(pricing).toContain("data-panel-inventory-apply")
		expect(pricing).toContain("data-panel-restrictions-action")
		expect(pricing).toContain("data-restriction-simple-drawer")
		expect(pricing).toContain("restrictionSimpleDrawer")
		expect(pricing).toContain("Crear regla de venta")
		expect(pricing).toContain("Reglas de venta")
		expect(pricing).toContain("action={routes.rateRestrictions()}")
		expect(pricing).toContain('name="action" value="create"')
		expect(pricing).toContain('name="scope" value="rate_plan"')
		expect(pricing).toContain("syncRestrictionDrawerRange")
		expect(pricing).toContain("syncSimpleRestrictionCopy")
		expect(pricing).toContain("data-panel-policies-action")
		expect(pricing).toContain("data-panel-policies-missing")
		expect(pricing).toContain("selectedPolicySummary")
		expect(pricing).toContain("selectedPolicyCoverage")
		expect(pricing).toContain("Abrir matriz de condiciones")
		expect(pricing).toContain("Los cambios de precio llaman solo al dominio de precios")
		expect(pricing).toContain("El cupo físico se guarda en Inventario")
		expect(pricing).toContain("Las reglas de venta controlan vendibilidad")
		expect(pricing).toContain("El Calendario solo resume el contrato aplicable")
		expect(pricing).toContain("data-pricing-make-recurring")
		expect(pricing).toContain("prefillRecurringFromSelection")
		expect(pricing).toContain("/api/pricing/rules/v2/create")
		expect(pricing).toContain("deletePriceRuleDirectly")
		expect(pricing).toContain("No se pudo confirmar la eliminación")
		expect(pricing).toContain("Cambio manual de precio")
		expect(pricing).not.toContain("Flujo avanzado multi-plan")
		expect(pricing).not.toContain("Automatización de precios</p>")
		expect(pricing).toContain("data-pricing-range-preset")
		expect(pricing).toContain("pricingRangeClearBtn")
		expect(pricing).not.toContain("/pricing/bulk")
		expect(pricing).not.toContain("data-pricing-bulk-context-link")
		expect(pricing).toContain("Sin precio")
		expect(pricing).toContain("data-pricing-day-card")
		expect(pricing).not.toContain("pricingDayEditor")
		expect(pricing).not.toContain("Guardar fecha")
		expect(pricing).not.toContain("data-pricing-quick-delta")
		expect(pricing).toContain("mobile-calendar-action-sheet")
		expect(pricing).toContain("MobileCalendarSheetStyles")
		expect(pricing).toContain("mobile-calendar-grid")
		expect(pricing).toContain("mobile-priority-signal")
		expect(pricing).not.toContain("data-pricing-operational-summary")
		expect(pricing).toContain("grid-cols-7")
		expect(pricing).not.toContain("@keyframes mobile-sheet-enter")
		expect(pricing).toContain("pricingSheetBackdrop")
		expect(pricing).toContain("pricingSheetCloseBtn")
		expect(pricing).toContain("pricingSheetExpandBtn")
		expect(pricing).toContain('data-sheet-state="compact"')
		expect(pricing).toContain("createMobileActionSheet")
		expect(pricing).not.toContain("findNextSelectableDate")
		expect(pricing).toContain("flashAppliedRange")
		expect(pricing).toContain("updateSelectedPricingCells")
		expect(pricing).toContain("syncRangeValueFromSingleDate")
		expect(pricing).toContain("data-pricing-apply-result-card")
		expect(pricing).toContain("renderOperationResult")
		expect(pricing).toContain("buildRecoveryGuidance")
		expect(pricing).toContain("Detalle técnico")
		expect(pricing).toContain("data-pricing-adjustment-output")
		expect(pricing).not.toContain("data-pricing-day-form")
		expect(pricing).not.toContain("Seleccionar rango")
		expect(pricing).not.toContain("Estado del calendario")
		expect(pricing).not.toContain("MaterializationFreshnessStrip")
		expect(pricing).not.toContain("Estado operativo")
		expect(pricing).toContain("data-pricing-adjustment-line")
		expect(pricing).toContain("pricingAppliedAidToggle")
		expect(pricing).not.toContain("Leyenda")
		expect(pricing).toContain("Ajuste solo si existe")
		expect(pricing).toContain("data-pricing-selected-label")
		expect(pricing).toContain("pricing-date-selected")
		expect(pricing).toContain("Precio final")
		expect(pricing).toContain("Precio base")
		expect(pricing).not.toContain("Ajuste manual")
		expect(pricing).not.toContain("Base heredada")
		expect(pricing).toContain("Copiar precio")
		expect(pricing).toContain("Precio a copiar")
		expect(pricing).toContain("Listo para recibir este precio.")
		expect(pricing).toContain("Necesita un precio configurado antes de copiar.")
		expect(pricing).toContain("No hay planes listos para copiar este precio")
		expect(pricing).not.toContain('pricingExtensionPreviewDays" type="number')
		expect(pricing).not.toContain('pricingExtensionPriority" type="number')
		expect(pricing).toContain("con restricciones")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-preview")
		expect(pricing).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(pricing).toContain("Actualizar calendario")
		expect(pricing).not.toContain("Regenerar vista")
		expect(inventory).toContain("Inventario físico")
		expect(inventory).toContain("Vista avanzada de inventario")
		expect(inventory).toContain("Para operación diaria")
		expect(inventory).toContain("pestaña <strong>Disponibilidad</strong>")
		expect(inventory).toContain("Abrir Calendario")
		expect(inventory).toContain("Operación avanzada")
		expect(inventory).toContain("data-inventory-advanced-panel")
		expect(inventory).toContain("Abrir flujo avanzado")
		expect(inventory).toContain("operación diaria")
		expect(inventory).toContain("de cupos se resuelve desde Calendario")
		expect(inventory).toContain("El Calendario es la operación diaria")
		expect(inventory).not.toContain("Inventory responde cuantos cupos existen")
		expect(inventory).not.toContain("Restrictions controla si esos cupos pueden venderse")
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
		expect(inventory).toContain("vendibilidad se opera en reglas de venta")
		expect(inventory).toContain("/api/inventory/bulk-preview")
		expect(inventory).toContain("/api/inventory/bulk-apply")
		expect(inventory).toContain('type: "set_inventory"')
		expect(inventory).not.toContain('type: "open_sales"')
		expect(inventory).not.toContain('type: "close_sales"')
		expect(inventoryBulk).not.toContain('value="open_sales"')
		expect(inventoryBulk).not.toContain('value="close_sales"')
		expect(inventoryBulk).not.toContain("Abrir ventas")
		expect(inventoryBulk).not.toContain("Cerrar ventas")
		expect(variantInventory).toContain('new URL("/rates/calendar", Astro.url)')
		expect(variantInventory).toContain('target.searchParams.set("variantId", variantId)')
		expect(variantInventory).toContain('target.searchParams.set("focus", "availability")')
		expect(variantInventory).toContain("return Astro.redirect")
		expect(variantInventory).not.toContain("WorkspaceLayout")
		expect(variantInventory).not.toContain("/api/inventory/update-day")
		expect(surfaces).toContain("buildPricingCalendarSurface")
		expect(surfaces).toContain("variantId?: string | null")
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
		expect(inventoryBulk).toContain("Inventario físico · Operaciones masivas")
		expect(inventoryBulk).toContain("operación diaria de cupos vive en el Calendario")
		expect(inventoryBulk).toContain("Gestionar vendibilidad en reglas")
		expect(inventoryHoldRepository).not.toContain("DailyInventory.stopSell")
		expect(inventoryCalendarApi).not.toContain("EffectiveAvailability.stopSell")
		expect(inventoryCalendarApi).not.toContain("isSellable")
		expect(inventoryCalendarApi).toContain("Inventory")
		expect(inventoryCalendarApi).toContain("physical-only")
	})
})
