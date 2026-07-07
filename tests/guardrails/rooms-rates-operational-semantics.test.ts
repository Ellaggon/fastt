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
	it("resolves commercial automations through CommercialRule tables", () => {
		const dbConfig = read("db/config.ts")
		const commercialRule =
			dbConfig.match(/const CommercialRule = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const commercialRuleApplication =
			dbConfig.match(/const CommercialRuleApplication = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""

		expect(dbConfig).not.toContain("const RatePlanOccupancyOverride")
		expect(dbConfig).not.toContain("RatePlanOccupancyOverride,")
		expect(dbConfig).not.toContain("const PriceRule = defineTable")
		expect(dbConfig).not.toContain("const Restriction = defineTable")
		expect(commercialRule).toContain("category")
		expect(commercialRule).toContain("configJson")
		expect(commercialRule).toContain("priority")
		expect(commercialRuleApplication).toContain("scope")
		expect(commercialRuleApplication).toContain("scopeId")
		expect(commercialRuleApplication).toContain("startDate")
		expect(commercialRuleApplication).toContain("validDays")
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
			"CommercialRuleSet",
			"CommercialRule",
			"CommercialRuleApplication",
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
		expect(taxonomy).toContain("## Booking Contract And Snapshot")
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
		const actionMenu = read("src/components/rates/RatePlanActionMenu.astro")
		const policySummary = read("src/modules/policies/application/mappers/derivePolicySummary.ts")
		const intents = read("src/lib/rates/ratePlanIntentPresets.ts")
		const routes = read("src/lib/routes.ts")
		const subnav = read("src/components/pricing/PricingSubnav.astro")

		expect(existsSync(join(process.cwd(), "src/pages/rates/plans/index.astro"))).toBe(false)
		expect(routes).not.toContain("ratePlansHub")
		expect(subnav).not.toContain("Hub de tarifas")
		expect(manage).toContain("Tarifas")
		expect(manage).toContain("Nueva tarifa")
		expect(manage).toContain("¿Qué quieres vender?")
		expect(manage).toContain("commercialState")
		expect(manage).toContain("Precio base")
		expect(manage).toContain("Calendario")
		expect(manage).toContain("Condiciones")
		expect(manage).toContain("Evaluación: próximos 30 días")
		expect(manage).toContain("Lista")
		expect(manage).toContain("Inactiva")
		expect(manage).toContain("Resolver")
		expect(manage).toContain("md:hidden")
		expect(manage).toContain("shortPolicySummary")
		expect(manage).toContain("Cambios recientes de tarifa")
		expect(actionMenu).toContain("Editar")
		expect(actionMenu).toContain("Desactivar")
		expect(actionMenu).toContain("Eliminar")
		expect(policySummary).not.toContain('return "No-show')
		expect(manage).toContain('calendarResolveHref(ratePlanId, "price")')
		expect(manage).toContain('calendarResolveHref(ratePlanId, "availability")')
		expect(manage).toContain("routes.ratePlanPolicies")
		expect(manage).not.toContain('key: "restrictions"')
		expect(manage).toContain("Venta ajustada")
		expect(manage).not.toContain("href={routes.rateRestrictions()}")
		expect(manage).not.toContain(">Precios</")
		expect(manage).not.toContain("Completar condiciones")
		expect(intents).toContain("Tarifa flexible")
		expect(intents).toContain("No reembolsable")
		expect(intents).toContain("Estadía larga")
		expect(intents).toContain("Anticipada")
		expect(manage).not.toContain("Nombre del plan")
		expect(detail).toContain('data-rate-plan-panel="conditions"')
		expect(detail).toContain('data-rate-plan-panel="price"')
		expect(detail).toContain('data-rate-plan-panel="details"')
		expect(detail).toContain("Editar datos de tarifa")
		expect(detail).not.toContain("Editar intención de tarifa")
		expect(detail).not.toContain("Rate Plans")
	})

	it("keeps conditions inside rates and Multicalendar without a standalone surface", () => {
		const assignment = read("src/components/policy/PolicyAssignmentFlow.astro")
		const ratePlanSurface = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const multiCalendar = read("src/pages/rates/multi-calendar.astro")
		const multiCalendarWorkspace = read("src/components/rates/MultiCalendarWorkspace.tsx")
		const routes = read("src/lib/routes.ts")

		expect(existsSync(join(process.cwd(), "src/pages/provider/policies/index.astro"))).toBe(false)
		expect(existsSync(join(process.cwd(), "src/components/policy/PolicyBuilder.astro"))).toBe(false)
		expect(routes).not.toContain("providerPolicies")
		expect(ratePlanSurface).toContain("Contrato de la tarifa")
		expect(ratePlanSurface).toContain("Cancelación y no presentación")
		expect(ratePlanSurface).toContain("Pago y garantía")
		expect(ratePlanSurface).toContain("Editar en alojamiento")
		expect(ratePlanSurface).not.toContain("/provider/policies")
		expect(multiCalendar).toContain("MultiCalendarWorkspace")
		expect(multiCalendarWorkspace).toContain('activeTab === "conditions"')
		expect(multiCalendarWorkspace).toContain("policy-assignment-open")
		expect(multiCalendarWorkspace).toContain("Editar condiciones")
		expect(assignment).toContain("Asignación de condiciones")
		expect(assignment).toContain("Nombre de la condición")
		expect(assignment).toContain("Crea y asigna desde una plantilla")
		expect(assignment).toContain("Usar condición existente")
	})

	it("keeps Multicalendario as the only sellability workspace", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const commercialRulesApi = read("src/pages/api/rates/commercial-rules.ts")
		const restrictionsSurface = read("src/lib/rates/restrictionsSurface.ts")
		const policiesPublic = read("src/modules/policies/public.ts")
		const rulesPublic = read("src/modules/rules/public.ts")
		const effectiveRestrictionMaterializer = read(
			"src/modules/rules/infrastructure/materializers/recompute-effective-restrictions.db.ts"
		)
		const effectiveRestrictionUseCase = read(
			"src/modules/rules/application/use-cases/recompute-effective-restrictions.ts"
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

		expect(governance).not.toContain("/rates/restrictions")
		expect(governance).not.toContain('planned: ["ARI Summary", "Restrictions"')
		expect(existsSync("src/pages/rates/restrictions.astro")).toBe(false)
		expect(existsSync("src/components/rates/PricingAutomationPanel.astro")).toBe(false)
		expect(commercialRulesApi).toContain("createRestrictionsSurfaceRule")
		expect(commercialRulesApi).toContain('action === "create-batch"')
		expect(commercialRulesApi).toContain('action === "create-pricing-automation"')
		expect(commercialRulesApi).toContain('action === "delete-pricing-automation"')
		expect(restrictionsSurface).toContain('label: "Cierre de venta"')
		expect(restrictionsSurface).toContain('label: "Sin llegada"')
		expect(restrictionsSurface).toContain('label: "Sin salida"')
		expect(restrictionsSurface).toContain('category: "Ventana de reserva"')
		expect(restrictionsSurface).not.toContain('label: "Stop Sell"')
		expect(restrictionsSurface).not.toContain('category: "LOS"')
		expect(restrictionsSurface).not.toContain('label: "CTA"')
		expect(restrictionsSurface).not.toContain('label: "CTD"')
		expect(restrictionsSurface).not.toContain('category: "Booking Window"')
		expect(commercialRulesApi).toContain("redirectToMultiCalendar")
		expect(commercialRulesApi).toContain('success: "sellability-created"')
		expect(restrictionsSurface).toContain("recomputeEffectiveRestrictionsForScope")
		expect(restrictionsSurface).toContain("materializeSearchUnitRange")
		expect(policiesPublic).not.toContain("restrictions")
		expect(policiesPublic).not.toContain("RestrictionService")
		expect(rulesPublic).toContain("RestrictionRuleEngine")
		expect(rulesPublic).toContain("recompute-effective-restrictions")
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
		expect(governance).not.toContain(
			"Future restriction workspace; no runtime channel manager exists yet."
		)
		expect(governance).not.toContain("Rooms & Rates is the enterprise ARI hub")
		expect(ratePlanQueryRepository).toContain('scope === "rate_plan"')
		expect(ratePlanQueryRepository).toContain('scope === "variant"')
		expect(ratePlanQueryRepository).toContain('scope === "product"')
	})

	it("keeps Multicalendario dense, neutral, and task-focused across breakpoints", () => {
		const workspace = read("src/components/rates/MultiCalendarWorkspace.tsx")

		expect(workspace).toContain('ok: "border-slate-200 bg-white')
		expect(workspace).toContain("border-l-amber-400")
		expect(workspace).toContain("Base ${cell.basePrice}")
		expect(workspace).not.toContain("secondary: cell.hasPrice ? cell.basePrice")
		expect(workspace).toContain("activeFilterCount")
		expect(workspace).toContain("Tarifa visible")
		expect(workspace).toContain("const visibleDays = surface.days")
		expect(workspace).toContain("repeat(${visibleDays.length}, minmax(4.5rem, 1fr))")
		expect(workspace).toContain("visibleRows.flatMap")
		expect(workspace).toContain("Gestionar regla")
		expect(workspace).toContain("Resolver pendientes")
		expect(workspace).toContain("Seleccionar ${row.ratePlanName}")
		expect(workspace).toContain(
			"w-full min-w-0 items-center justify-center gap-2 sm:w-auto sm:justify-start"
		)
		expect(workspace).toContain("data-multi-calendar-range-presets")
		expect(workspace).toContain("hidden flex-wrap justify-end gap-1.5 sm:flex")
	})

	it("keeps Calendar as an interactive single-rate workspace with contextual Pro handoffs", () => {
		const calendar = read("src/pages/rates/calendar.astro")
		const workspace = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const endpoint = read("src/pages/api/rates/calendar.ts")
		const surface = read("src/lib/rates/singleCalendarSurface.ts")
		const catalog = read("src/lib/rates/calendarControlCatalog.ts")
		const multiCalendar = read("src/components/rates/MultiCalendarWorkspace.tsx")

		expect(calendar).toContain("SingleCalendarWorkspace")
		expect(calendar).toContain("client:load")
		expect(calendar).toContain("buildSingleCalendarSurface")
		expect(calendar).toContain('requestedFocus === "availability"')
		expect(calendar).toContain('"restrictions", "sellability"')
		expect(calendar).not.toContain("CalendarOperationalPanel")
		expect(calendar).not.toContain("initRatesCalendar")
		expect(workspace).toContain("fetch(`/api/rates/calendar?")
		expect(workspace).toContain("window.history.replaceState")
		expect(workspace).toContain('role="tablist"')
		expect(workspace).toContain('role="tab"')
		expect(workspace).toContain("CALENDAR_CONTROL_MODES")
		expect(workspace).toContain("visibleCalendarActions")
		expect(catalog).toContain('{ key: "price", label: "Precio"')
		expect(catalog).toContain('{ key: "availability", label: "Disponibilidad"')
		expect(catalog).toContain('{ key: "sellability", label: "Venta"')
		expect(catalog).toContain('{ key: "conditions", label: "Condiciones"')
		expect(workspace).toContain(
			'CALENDAR_CONTROL_MODES.filter((item) => item.key !== "conditions")'
		)
		expect(workspace).not.toContain('"Completar contrato"')
		expect(workspace).not.toContain('"Ver contrato"')
		expect(catalog).not.toContain('key: "pro"')
		expect(workspace).not.toContain('mode === "pro"')
		expect(catalog).toContain("professionalOnly")
		expect(workspace).toContain("/rates/multi-calendar?")
		expect(workspace).toContain('fetch("/api/pricing/rules/v2/bulk-preview"')
		expect(workspace).toContain('fetch("/api/pricing/rules/v2/bulk-apply"')
		expect(workspace).toContain('fetch("/api/inventory/bulk-preview"')
		expect(workspace).toContain('fetch("/api/inventory/bulk-apply"')
		expect(workspace).toContain('fetch("/api/rates/commercial-rules"')
		expect(workspace).toContain("surface.conditions.summary")
		expect(workspace).not.toContain("Sin excepción")
		expect(workspace).not.toContain("La condición general pertenece a la tarifa")
		expect(endpoint).toContain("requireProvider")
		expect(endpoint).toContain('"Cache-Control": "private, no-store"')
		expect(endpoint).toContain("loadRatePlansReadModel")
		expect(surface).toContain("buildPricingCalendarSurface")
		expect(multiCalendar).toContain("CALENDAR_CONTROL_MODES")
		expect(
			existsSync(join(process.cwd(), "src/components/rates/CalendarOperationalPanel.astro"))
		).toBe(false)
		expect(existsSync(join(process.cwd(), "src/lib/rates/calendarOperationalController.ts"))).toBe(
			false
		)
	})

	it("keeps both calendars on one responsive motion and selection system", () => {
		const singleCalendar = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const multiCalendar = read("src/components/rates/MultiCalendarWorkspace.tsx")
		const drawer = read("src/components/rates/CalendarResponsiveDrawer.tsx")
		const globalStyles = read("src/styles/global.css")

		for (const workspace of [singleCalendar, multiCalendar]) {
			expect(workspace).toContain("CalendarResponsiveDrawer")
			expect(workspace).toContain("calendar-cell")
			expect(workspace).toContain("calendar-grid-enter")
			expect(workspace).toContain("calendar-loading-bar")
			expect(workspace).toContain("data-selection-edge")
		}

		expect(drawer).toContain('role="dialog"')
		expect(drawer).toContain('aria-modal="true"')
		expect(drawer).toContain('event.key === "Escape"')
		expect(globalStyles).toContain("--fastt-motion-standard")
		expect(globalStyles).toContain("calendar-sheet-enter")
		expect(globalStyles).toContain("prefers-reduced-motion")
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
		expect(inventoryBulk).toContain('target.searchParams.set("focus", "availability")')
		expect(inventoryBulk).toContain('target.searchParams.set("source", "inventory-bulk-redirect")')
		expect(inventoryBulk).toContain("return Astro.redirect")
		expect(inventoryHoldRepository).not.toContain("DailyInventory.stopSell")
		expect(inventoryCalendarApi).not.toContain("EffectiveAvailability.stopSell")
		expect(inventoryCalendarApi).not.toContain("isSellable")
		expect(inventoryCalendarApi).toContain("Inventory")
		expect(inventoryCalendarApi).toContain("physical-only")
	})
})
