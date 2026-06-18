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
		expect(manage).toContain("Reglas de venta")
		expect(manage).toContain("Estado vendible")
		expect(manage).toContain("Lista")
		expect(manage).toContain("No lista")
		expect(manage).toContain("Resolver")
		expect(manage).toContain('calendarResolveHref(ratePlanId, "price")')
		expect(manage).toContain('calendarResolveHref(ratePlanId, "availability")')
		expect(manage).toContain('calendarResolveHref(ratePlanId, "restrictions")')
		expect(manage).toContain("routes.ratePlanPolicies")
		expect(manage).toContain('blocker.key === "restrictions"')
		expect(manage).toContain("Revisar venta")
		expect(manage).not.toContain("href={routes.rateRestrictions()}")
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

	it("keeps Condiciones simple-first and moves technical controls to professional mode", () => {
		const policies = read("src/pages/provider/policies/index.astro")
		const assignment = read("src/components/policy/PolicyAssignmentFlow.astro")
		const builder = read("src/components/policy/PolicyBuilder.astro")
		const newPage = read("src/pages/provider/policies/new.astro")
		const editPage = read("src/pages/provider/policies/[policyId]/edit.astro")

		expect(policies).toContain("Tarifas incompletas")
		expect(policies).toContain("Listas para vender")
		expect(policies).toContain("Matriz profesional")
		expect(policies).toContain("Historial avanzado")
		expect(policies).toContain("Biblioteca básica")
		expect(policies).toContain("Biblioteca Pro")
		expect(policies).toContain("data-policy-tabs")
		expect(policies).toContain('data-policy-tab="incomplete"')
		expect(policies).toContain('aria-selected="true"')
		expect(policies).toContain("isProfessionalPolicies &&")
		expect(policies).toContain('data-policy-tab-panel="detail"')
		expect(policies).toContain('data-policy-tab-panel="library"')
		expect(policies).toContain('data-policy-tab-panel="history"')
		expect(policies).toContain('data-policy-tab="history"')
		expect(policies).toContain("data-policy-library-tab")
		expect(policies).toContain("Condiciones reutilizables")
		expect(policies).toContain("data-policy-history-tab")
		expect(policies).toContain("Cambios recientes")
		expect(policies).toContain("Ir a biblioteca")
		expect(policies).toContain("Detalle técnico")
		expect(policies).toContain("Usar existente")
		expect(policies).toContain("<table")
		expect(policies).not.toContain("Biblioteca secundaria")
		expect(policies).not.toContain("data-policy-library-secondary")
		expect(policies).not.toContain(">Antes</")
		expect(policies).not.toContain(">Después</")
		expect(policies).toContain("activatePolicyTab")
		expect(policies).toContain('button.getAttribute("data-policy-tab") === requestedTab')
		expect(policies).toContain("Resolver")
		expect(policies).toContain("const nextMissingCell = missingCells[0]")
		expect(policies).toContain("Falta {cell.categoryLabel}")
		expect(policies).not.toContain("Asignar {cell.categoryLabel}")
		expect(policies).toContain('data-assignment-mode="preset"')
		expect(policies).toContain('data-assignment-channel=""')
		expect(policies).toContain("Todos los canales")
		expect(policies).toContain('if (!isProfessionalPolicies) return [""]')
		expect(policies).toContain("PolicyAssignmentFlow isProfessionalMode={isProfessionalPolicies}")
		expect(policies).toContain("isProfessionalPolicies &&")

		expect(assignment).toContain("isProfessionalMode?: boolean")
		expect(assignment).toContain("Asignación de condiciones")
		expect(assignment).toContain("Canal avanzado")
		expect(assignment).toContain("Canal: <span")
		expect(assignment).toContain('if (!isProfessionalMode) return "preset"')
		expect(assignment).toContain("channelSelect.value = defaultChannel")
		expect(assignment).toContain('if (!isProfessionalMode) channelSelect.value = ""')
		expect(assignment).toContain("Crea y asigna desde una plantilla")
		expect(assignment).toContain("Usar condición existente")
		expect(assignment).toContain('!isProfessionalMode && "hidden"')
		expect(assignment).toContain("bg-blue-600")

		expect(builder).toContain("showTechnicalAdvanced?: boolean")
		expect(builder).toContain('!showTechnicalAdvanced && "hidden"')
		expect(newPage).toContain("showTechnicalAdvanced={isProfessionalPolicies}")
		expect(editPage).toContain("showTechnicalAdvanced={isProfessionalPolicies}")
	})

	it("keeps Multicalendario as the only sellability workspace", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const commercialRulesApi = read("src/pages/api/rates/commercial-rules.ts")
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

	it("keeps Calendar operational and moves recurring sellability rules into Multicalendario", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const routes = read("src/lib/routes.ts")
		const pricing = read("src/pages/rates/calendar.astro")
		const multiCalendar = read("src/pages/rates/multi-calendar.astro")
		const multiCalendarSurface = read("src/lib/rates/multiCalendarSurface.ts")
		const commercialRulesApi = read("src/pages/api/rates/commercial-rules.ts")
		const inventory = read("src/pages/inventory/index.astro")
		const inventoryBulk = read("src/pages/inventory/bulk.astro")
		const variantInventory = read("src/pages/product/[id]/rooms/[roomId]/inventory.astro")
		const surfaces = read("src/lib/rates/calendarSurfaces.ts")
		const pricingAutomation = read("src/lib/pricing/pricingAutomationSurface.ts")
		const pricingOperationCopy = read("src/lib/pricing/pricingOperationCopy.ts")
		const pricingExtensionPresenter = read("src/lib/pricing/pricingExtensionPresenter.ts")
		const calendarOperationalPanel = read("src/components/rates/CalendarOperationalPanel.astro")
		const calendarOperationalController = read("src/lib/rates/calendarOperationalController.ts")
		const mobileInteraction = read("src/lib/rates/mobileCalendarInteraction.ts")
		const mobileSheetStyles = read("src/components/rates/MobileCalendarSheetStyles.astro")

		expect(routes).toContain('ratesCalendar: () => "/rates/calendar"')
		expect(routes).toContain('ratesMultiCalendar: () => "/rates/multi-calendar"')
		expect(routes).toContain('pricing: () => "/rates/calendar"')
		expect(routes).toContain('inventory: () => "/rates/calendar?focus=availability"')
		expect(routes).toContain("focus=availability")
		expect(governance).toContain('label: "Calendario"')
		expect(governance).toContain('label: "Multicalendario"')
		expect(governance).toContain('pattern: "/rates/multi-calendar"')
		expect(governance).toContain("href: routes.pricing()")
		expect(governance).not.toContain('label: "Inventario físico"')
		expect(governance).not.toContain("href: routes.inventory()")
		expect(governance).toContain('pattern: "/product/:id/rooms/:roomId/inventory"')
		expect(governance).toContain("Compat redirect hacia /rates/calendar")
		expect(governance).toContain('label: "Tarifas"')
		expect(governance).not.toContain('label: "Reglas de venta"')
		expect(governance).toContain('pattern: "/inventory"')
		expect(governance).toContain('pattern: "/inventory/bulk"')
		expect(governance).toContain("Compat redirect hacia /rates/calendar con foco de disponibilidad")
		expect(governance).not.toContain('"Pricing Calendar", "Inventory Calendar"')
		expect(pricing).toContain("Revisa qué noches se pueden vender")
		expect(pricing).toContain("Multicalendario")
		expect(pricing).toContain("routes.ratesMultiCalendar()")
		expect(routes).not.toContain("rateRestrictions")
		expect(governance).not.toContain("/rates/restrictions")
		expect(multiCalendar).toContain('WorkspaceLayout title="Multicalendario"')
		expect(multiCalendar).toContain('sidebarData.disclosureMode === "small-provider"')
		expect(multiCalendar).toContain("buildRatesMultiCalendarSurface")
		expect(multiCalendar).toContain("Precio")
		expect(multiCalendar).toContain("Disponibilidad")
		expect(multiCalendar).toContain("Venta")
		expect(multiCalendar).toContain("Estancia")
		expect(multiCalendar).toContain("Llegada/salida")
		expect(multiCalendar).toContain("Condiciones")
		expect(multiCalendar).toContain("Reglas aplicadas")
		expect(multiCalendar).toContain("data-multi-calendar-tab-button")
		expect(multiCalendar).toContain('role="tablist"')
		expect(multiCalendar).toContain('role="tab"')
		expect(multiCalendar).toContain('aria-selected={surface.tab === tab.key ? "true" : "false"}')
		expect(multiCalendar).toContain("setActiveTab")
		expect(multiCalendar).toContain('button.classList.remove(\n\t\t\t\t\t"border-slate-200/80"')
		expect(multiCalendar).toContain('button.setAttribute("aria-selected", String(active))')
		expect(multiCalendar).toContain("renderContextualActions")
		expect(multiCalendar).toContain("actionCatalog")
		expect(multiCalendar).toContain("syncContextualActionState")
		expect(multiCalendar).toContain("String(button.dataset.multiCalendarAction === activeAction)")
		expect(multiCalendar).toContain('.multi-calendar-context-action[aria-pressed="true"]')
		expect(multiCalendar).toContain("data-multi-calendar-grid")
		expect(multiCalendar).toContain("data-multi-calendar-cell")
		expect(multiCalendar).toContain("data-multi-calendar-selection-bar")
		expect(multiCalendar).toContain("data-multi-calendar-select-date")
		expect(multiCalendar).toContain("data-multi-calendar-select-row")
		expect(multiCalendar).toContain("data-multi-calendar-actions")
		expect(multiCalendar).not.toContain('data-multi-calendar-action="rule"')
		expect(multiCalendar).toContain('id="multiCalendarPriceForm"')
		expect(multiCalendar).toContain('id="multiCalendarAvailabilityForm"')
		expect(multiCalendar).toContain('id="multiCalendarRuleForm"')
		expect(multiCalendar).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(multiCalendar).toContain("/api/inventory/bulk-apply")
		expect(multiCalendar).toContain('name="action" value="create-batch"')
		expect(multiCalendar).toContain('name="scopeIds"')
		expect(multiCalendar).toContain("Ajuste de precio base")
		expect(multiCalendar).toContain("Descuento por estadía")
		expect(multiCalendar).toContain("Anticipación mínima")
		expect(multiCalendar).toContain("Bloquear llegada")
		expect(multiCalendar).toContain("Crear regla para la selección")
		expect(multiCalendar).toContain("Continuar en Calendario")
		expect(multiCalendar).toContain("Ver reglas aplicadas")
		expect(multiCalendar).toContain("Resolver condiciones")
		expect(multiCalendar).toContain('if (drawer && !drawer.classList.contains("hidden"))')
		expect(multiCalendar).not.toContain("href={hrefWith({ tab: tab.key })}")
		expect(multiCalendar).not.toContain('href="/pricing')
		expect(multiCalendar).not.toContain("href={`/pricing")
		expect(multiCalendarSurface).toContain("buildPricingCalendarSurface")
		expect(multiCalendarSurface).toContain("policyCoverage")
		expect(multiCalendarSurface).toContain("restrictionSummary")
		expect(multiCalendarSurface).toContain("availableUnits")
		expect(multiCalendarSurface).toContain("routes.ratesMultiCalendar()")
		expect(multiCalendarSurface).toContain("routes.providerPolicies()")
		expect(multiCalendarSurface).toContain("routes.pricing()")
		expect(calendarOperationalPanel).toContain("data-operational-calendar-panel")
		expect(pricing).toContain("reglas y condiciones")
		expect(pricing).not.toContain("vendibilidad diaria")
		expect(pricing).not.toContain("contrato de tarifa")
		expect(pricing).toContain("pricingAddMonthBtn")
		expect(pricing).toContain("Añadir mes siguiente")
		expect(calendarOperationalController).toContain("Ocultar mes siguiente")
		expect(pricing).toContain("data-pricing-extra-month={monthIndex > 0")
		expect(calendarOperationalController).toContain('[data-pricing-extra-month="true"]')
		expect(pricing).toContain("initRatesCalendar()")
		expect(calendarOperationalController).toContain("export function initRatesCalendar")
		expect(pricing).not.toContain("PricingAutomationPanel")
		expect(pricing).not.toContain("automationSurface={automationSurface}")
		expect(pricing).not.toContain('<Card id="pricing-automation"')
		expect(commercialRulesApi).toContain('action === "create-pricing-automation"')
		expect(commercialRulesApi).toContain('action === "delete-pricing-automation"')
		expect(commercialRulesApi).toContain("createRestrictionsSurfaceRule")
		expect(commercialRulesApi).toContain('action === "create"')
		expect(commercialRulesApi).toContain('action === "create-batch"')
		expect(calendarOperationalPanel).toContain("Reglas aplicadas")
		expect(calendarOperationalPanel).toContain("Crear regla de venta")
		expect(calendarOperationalPanel.match(/data-panel-restrictions-action/g) ?? []).toHaveLength(1)
		expect(calendarOperationalController).toContain("restrictionSimpleOpenBtns")
		expect(pricing).not.toContain('title="Cambios del calendario"')
		expect(pricing).toContain("Historial del calendario")
		expect(pricing).toContain("data-calendar-history-drawer")
		expect(pricing).toContain('id="pricingCalendarHistoryDrawer"')
		expect(pricing).toContain('id="pricingCalendarHistoryBackdrop"')
		expect(pricing).toContain('id="pricingCalendarHistoryCloseBtn"')
		expect(calendarOperationalPanel).not.toContain("href={routes.pricingAutomation()}")
		expect(calendarOperationalController).not.toContain("setAutomationPopoverOpen")
		expect(calendarOperationalController).not.toContain("setAutomationDrawerOpen")
		expect(calendarOperationalController).not.toContain("pricingAutomationDrawer")
		expect(calendarOperationalController).not.toContain("pricingAutomationBackdrop")
		expect(calendarOperationalController).not.toContain("pricingAutomationCloseBtn")
		expect(calendarOperationalController).not.toContain(
			'window.location.hash === "#pricing-automation"'
		)
		expect(calendarOperationalController).toContain('event.key === "Escape"')
		expect(calendarOperationalController).not.toContain("automationPresets.contains")
		expect(calendarOperationalController).not.toContain("automationSelectedTitle.textContent")
		expect(pricingAutomation).toContain("Descuento por porcentaje")
		expect(pricingAutomation).toContain("Reserva anticipada")
		expect(pricingAutomation).toContain("Último minuto")
		expect(pricingAutomation).toContain("Descuento por estadía")
		expect(pricingAutomation).toContain("Descuento por monto")
		expect(pricingAutomation).toContain("Aumento por porcentaje")
		expect(pricingAutomation).toContain("Aumento por monto")
		expect(pricingAutomation).toContain("Precio programado por fechas")
		expect(pricingAutomation).not.toContain("Promoción por porcentaje")
		expect(pricingAutomation).not.toContain("Promoción simple")
		expect(pricingAutomation).not.toContain("Precio fijo programado")
		expect(pricingAutomation).not.toContain("Descuento fijo")
		expect(pricingAutomation).not.toContain("Estadía larga")
		expect(`${pricing}\n${pricingOperationCopy}`).not.toContain("Manual = cambia ahora")
		expect(pricingExtensionPresenter).not.toContain("Aumentar este precio por %")
		expect(pricingExtensionPresenter).not.toContain("Reducir este precio por %")
		expect(pricingExtensionPresenter).not.toContain("Ajustar este precio por monto")
		expect(pricing).not.toContain("Simple primero")
		expect(pricing).not.toContain("Tres intenciones, un solo origen")
		expect(pricing).not.toContain("Ayudas automáticas recurrentes")
		expect(pricing).not.toContain("data-pricing-advanced-panel")
		expect(pricing).not.toContain("Acciones avanzadas para la selección")
		expect(`${pricing}\n${calendarOperationalController}`).not.toContain("Extender cambio actual")
		expect(pricing).not.toContain("Convertir en ayuda recurrente")
		expect(pricing).not.toContain("Crear regla recurrente")
		expect(calendarOperationalPanel).not.toContain("Extender este cambio")
		expect(calendarOperationalPanel).toContain("Extender cambio")
		expect(pricing).toContain("data-pricing-extension-drawer")
		expect(calendarOperationalPanel).toContain("data-pricing-open-extension")
		expect(calendarOperationalController).toContain("pricingExtensionDrawer")
		expect(pricing).toContain("Revisar extensión")
		expect(calendarOperationalPanel).not.toContain("Hacer recurrente")
		expect(calendarOperationalPanel).toContain("Reglas aplicadas")
		expect(calendarOperationalPanel).toContain("Crear regla de venta")
		expect(calendarOperationalPanel.match(/data-panel-restrictions-action/g) ?? []).toHaveLength(1)
		expect(pricing).toContain("Revisa qué noches se pueden vender")
		expect(pricing).toContain("Revisa qué noches se pueden vender")
		expect(pricing).toContain("CalendarOperationalPanel")
		expect(pricing).toContain("isProfessionalCalendar={isProfessionalCalendar}")
		expect(pricing).not.toContain("selectedVariantId={selectedVariantId}")
		expect(pricing).not.toContain("data-operational-calendar-panel")
		expect(pricing).not.toContain("xl:grid-cols-[minmax(0,1fr)_22rem]")
		expect(pricing.indexOf("<CalendarOperationalPanel")).toBeLessThan(
			pricing.indexOf("data-pricing-two-month-calendar")
		)
		expect(pricing).not.toContain("Precio final")
		expect(pricing).not.toContain("¿Se vende esta noche?")
		expect(pricing).not.toContain("Cupo:")
		expect(pricing).not.toContain("Reservas:")
		expect(pricing).not.toContain("Holds:")
		expect(pricing).not.toContain("Regla:")
		expect(pricing).not.toContain("Condiciones:")
		expect(pricing).not.toContain("venta estándar")
		expect(pricing).not.toContain("Vendibilidad:")
		expect(pricing).toContain("data-operational-status")
		expect(pricing).toContain("data-pricing-signal-row")
		expect(pricing).toContain("data-conditions-signal")
		expect(calendarOperationalController).toContain("syncConditionSignals")
		expect(calendarOperationalController).toContain('activeOperationalTab === "policies"')
		expect(calendarOperationalPanel).toContain("data-panel-policies")
		expect(pricing).toContain("const isProfessionalCalendar")
		expect(pricing).toContain("sidebarData.disclosureMode !==")
		expect(calendarOperationalPanel).toContain("data-operational-calendar-panel")
		expect(calendarOperationalPanel).toContain("data-operational-panel-title")
		expect(calendarOperationalPanel).toContain("data-operational-panel-summary")
		expect(calendarOperationalPanel).not.toContain("Detalle de fecha")
		expect(
			`${pricing}\n${calendarOperationalPanel}\n${calendarOperationalController}`
		).not.toContain("Detalle de fecha")
		expect(`${calendarOperationalPanel}\n${calendarOperationalController}`).not.toContain(
			"Detalle técnico"
		)
		expect(`${calendarOperationalPanel}\n${calendarOperationalController}`).not.toContain(
			"detalle técnico"
		)
		expect(calendarOperationalPanel).not.toContain("estado técnico")
		expect(calendarOperationalController).toContain("selectedOperationalRangeLabel")
		expect(calendarOperationalController).toContain("operationalSummaryForTab")
		expect(calendarOperationalController).toContain("updateOperationalPanelHeader")
		expect(calendarOperationalController).toContain("summaryByTab")
		expect(calendarOperationalController).toContain("price: `${scopeLabel}")
		expect(calendarOperationalController).toContain("availability:")
		expect(calendarOperationalController).toContain("restrictions:")
		expect(calendarOperationalController).toContain("policies:")
		expect(calendarOperationalController).toContain("pro:")
		expect(calendarOperationalController).toContain("updateOperationalPanelHeader(day)")
		expect(calendarOperationalController).toContain("activeOperationalTab")
		expect(calendarOperationalPanel).toContain('data-operational-tab="price"')
		expect(calendarOperationalPanel).toContain('data-operational-tab="availability"')
		expect(calendarOperationalPanel).toContain('data-operational-tab="restrictions"')
		expect(calendarOperationalPanel).toContain("Venta")
		expect(calendarOperationalPanel).not.toContain("Estado de venta")
		expect(calendarOperationalPanel).not.toContain('data-panel-restrictions"')
		expect(calendarOperationalPanel).toContain('data-operational-tab="policies"')
		expect(calendarOperationalPanel).toContain('data-operational-tab="pro"')
		expect(calendarOperationalPanel).not.toContain('data-operational-tab="recurring"')
		expect(calendarOperationalPanel).not.toContain('data-operational-tab="bulk"')
		expect(calendarOperationalPanel).not.toContain('data-operational-tab="technical"')
		expect(calendarOperationalPanel).toContain('data-operational-panel-section="pro"')
		expect(calendarOperationalPanel).toContain("isProfessionalCalendar ?")
		expect(calendarOperationalPanel.indexOf("isProfessionalCalendar ?")).toBeLessThan(
			calendarOperationalPanel.indexOf('data-operational-tab="pro"')
		)
		expect(calendarOperationalPanel).toContain("Pro")
		expect(calendarOperationalPanel).toContain("Reglas aplicadas")
		expect(calendarOperationalPanel.match(/data-panel-restrictions-action/g) ?? []).toHaveLength(1)
		expect(calendarOperationalPanel).toContain("Extender cambio")
		expect(calendarOperationalPanel).toContain("Mostrar ajustes")
		expect(calendarOperationalPanel).toContain("Historial")
		expect(calendarOperationalPanel).toContain("Mostrar detalle físico")
		expect(calendarOperationalPanel).toContain('id="pricingAppliedAidToggle"')
		expect(calendarOperationalPanel.indexOf('id="pricingAppliedAidToggle"')).toBeGreaterThan(
			calendarOperationalPanel.indexOf('data-operational-panel-section="price"')
		)
		expect(calendarOperationalPanel.indexOf('id="pricingAppliedAidToggle"')).toBeLessThan(
			calendarOperationalPanel.indexOf('data-operational-panel-section="availability"')
		)
		expect(calendarOperationalPanel.indexOf('id="pricingAppliedAidToggle"')).toBeLessThan(
			calendarOperationalPanel.indexOf('data-operational-panel-section="pro"')
		)
		expect(calendarOperationalPanel).not.toContain('href="#calendar-history"')
		expect(calendarOperationalPanel).toContain("data-panel-calendar-history")
		expect(pricing).not.toContain("Días aplicables")
		expect(pricing).not.toContain('name="validDays"')
		expect(pricing).not.toContain("Si no marcas días")
		expect(pricing).not.toContain('id="calendar-history"')
		expect(calendarOperationalController).toContain("setCalendarHistoryOpen")
		expect(calendarOperationalController).toContain("pricingCalendarHistoryDrawer")
		expect(calendarOperationalController).toContain("pricingCalendarHistoryBackdrop")
		expect(calendarOperationalController).toContain("pricingCalendarHistoryCloseBtn")
		expect(calendarOperationalPanel).toContain("Abre herramientas Pro para automatizar reglas")
		expect(calendarOperationalPanel).not.toContain("data-panel-status")
		expect(calendarOperationalPanel).not.toContain("data-panel-date")
		expect(calendarOperationalController).toContain("allowedOperationalTabs")
		expect(calendarOperationalController).toContain(
			'["price", "availability", "restrictions", "policies"]'
		)
		expect(calendarOperationalController).toContain(
			'["price", "availability", "restrictions", "policies", "pro"]'
		)
		expect(calendarOperationalController).toContain(
			"const allowedOperationalTabs = isProfessionalCalendar"
		)
		expect(calendarOperationalController).toContain("normalizeOperationalTab")
		expect(calendarOperationalController).toContain('["recurring", "bulk", "technical"]')
		expect(calendarOperationalController).toContain("calendarMutationEndpoints")
		expect(calendarOperationalController).toContain(
			'pricingPreview: "/api/pricing/rules/v2/bulk-preview"'
		)
		expect(calendarOperationalController).toContain(
			'pricingApply: "/api/pricing/rules/v2/bulk-apply"'
		)
		expect(calendarOperationalController).toContain(
			'inventoryPreview: "/api/inventory/bulk-preview"'
		)
		expect(calendarOperationalController).toContain('inventoryApply: "/api/inventory/bulk-apply"')
		expect(calendarOperationalController).toContain("buildPricingRangePayload")
		expect(calendarOperationalController).toContain("buildInventoryRangePayload")
		expect(`${pricing}\n${calendarOperationalController}`).toContain("selectedRatePlanId")
		expect(`${pricing}\n${calendarOperationalController}`).toContain("selectedVariantId")
		expect(pricing).toContain('variantId: Astro.url.searchParams.get("variantId")')
		expect(calendarOperationalPanel).toContain("data-panel-inventory-action")
		expect(calendarOperationalPanel).toContain("Cambiar cupo")
		expect(calendarOperationalPanel).toContain('id="inventoryPhysicalDrawer"')
		expect(calendarOperationalPanel).toContain('id="inventoryPhysicalBackdrop"')
		expect(calendarOperationalPanel).toContain('id="inventoryPhysicalCloseBtn"')
		expect(calendarOperationalPanel).toContain("data-inventory-range-label")
		expect(calendarOperationalPanel).toContain("data-panel-inventory-preview")
		expect(calendarOperationalPanel).toContain("data-panel-inventory-apply")
		expect(calendarOperationalPanel).not.toContain("data-panel-inventory-detail")
		expect(calendarOperationalPanel).toContain("inventoryPhysicalDetailToggle")
		expect(calendarOperationalPanel).toContain("Mostrar detalle físico")
		expect(calendarOperationalPanel).not.toContain("Detalle físico")
		expect(calendarOperationalController).not.toContain("hasInventoryIssue")
		expect(calendarOperationalController).not.toContain("data-panel-inventory-detail")
		expect(calendarOperationalPanel).toContain("data-panel-restrictions-action")
		expect(pricing).toContain("data-restriction-simple-drawer")
		expect(calendarOperationalController).toContain("restrictionSimpleDrawer")
		expect(calendarOperationalController).toContain("const initialFocusableCard")
		expect(calendarOperationalController).toContain(
			"selectPricingDate(initialFocusableCard.getAttribute"
		)
		expect(calendarOperationalController).toContain('activeOperationalTab === "restrictions"')
		expect(calendarOperationalController).toContain("setRestrictionDrawerOpen(true)")
		expect(pricing).toContain("Crear regla de venta")
		expect(pricing).toContain("Reglas de venta")
		expect(pricing).toContain("action={routes.ratesCommercialRulesApi()}")
		expect(pricing).toContain('name="action" value="create"')
		expect(pricing).toContain('name="scope" value="rate_plan"')
		expect(calendarOperationalController).toContain("syncRestrictionDrawerRange")
		expect(calendarOperationalController).toContain("syncSimpleRestrictionCopy")
		expect(calendarOperationalPanel).toContain("data-panel-policies-action")
		expect(calendarOperationalPanel).toContain("data-panel-policies-missing")
		expect(pricing).toContain("selectedPolicySummary")
		expect(pricing).toContain("selectedPolicyCoverage")
		expect(calendarOperationalPanel).toContain("Resolver condiciones")
		expect(calendarOperationalPanel).not.toContain("Abrir matriz de condiciones")
		expect(calendarOperationalController).toContain("policiesAction.textContent")
		expect(calendarOperationalController).toContain('"Ver condiciones"')
		expect(calendarOperationalPanel).not.toContain("data-panel-price")
		expect(calendarOperationalPanel).not.toContain("data-panel-base-price")
		expect(calendarOperationalPanel).not.toContain(
			"Los cambios de precio llaman solo al dominio de precios"
		)
		expect(calendarOperationalPanel).not.toContain(
			"md:grid-cols-[minmax(10rem,14rem)_repeat(4,minmax(0,1fr))]"
		)
		expect(calendarOperationalPanel).toContain("grid gap-2 sm:grid-cols-2")
		expect(calendarOperationalPanel).toContain("data-panel-inventory-feedback")
		expect(calendarOperationalPanel).not.toContain("data-panel-availability")
		expect(calendarOperationalPanel).not.toContain("data-panel-locks")
		expect(calendarOperationalPanel).not.toContain(
			"md:grid-cols-[minmax(10rem,14rem)_repeat(3,minmax(0,1fr))]"
		)
		expect(calendarOperationalController).toContain("inventoryPhysicalOpenBtn")
		expect(calendarOperationalController).toContain("setInventoryPhysicalDrawerOpen")
		expect(calendarOperationalController).toContain("inventory-physical-drawer-open")
		expect(calendarOperationalPanel).not.toContain("El cupo físico se guarda en Inventario")
		expect(calendarOperationalPanel).not.toContain("Las reglas de venta controlan vendibilidad")
		expect(calendarOperationalPanel).not.toContain(
			"El Calendario solo resume el contrato aplicable"
		)
		expect(calendarOperationalPanel).not.toContain("data-pricing-make-recurring")
		expect(calendarOperationalController).not.toContain("prefillRecurringFromSelection")
		expect(pricing).not.toContain("/api/pricing/rules/v2/create")
		expect(pricing).not.toContain("deletePriceRuleDirectly")
		expect(commercialRulesApi).toContain("/api/pricing/rules/v2/create")
		expect(commercialRulesApi).toContain("deletePriceRuleDirectly")
		expect(calendarOperationalPanel).toContain("Cambio manual de precio")
		expect(calendarOperationalPanel).toContain("data-panel-manual-price-action")
		expect(calendarOperationalPanel).toContain("data-selection-required-action")
		expect(calendarOperationalPanel).toContain('class="hidden h-10 items-center')
		expect(calendarOperationalPanel).toContain('id="pricingManualPriceDrawer"')
		expect(calendarOperationalPanel).toContain('id="pricingManualPriceBackdrop"')
		expect(calendarOperationalPanel).toContain('id="pricingManualPriceCloseBtn"')
		expect(calendarOperationalPanel).toContain("data-manual-price-range-label")
		expect(calendarOperationalController).toContain("manualPriceRangeLabel")
		expect(calendarOperationalPanel).not.toContain("pricingRangeSummary")
		expect(calendarOperationalPanel).toContain("Revisar cambio puntual")
		expect(calendarOperationalPanel).toContain("Guardar cambio manual")
		expect(calendarOperationalPanel).toContain('id="pricingRangePanel"')
		expect(pricing).not.toContain('id="pricingRangePanel"')
		expect(calendarOperationalPanel.indexOf('id="pricingRangePanel"')).toBeGreaterThan(-1)
		expect(calendarOperationalPanel.indexOf('id="pricingRangePanel"')).toBeGreaterThan(
			calendarOperationalPanel.indexOf('id="pricingManualPriceDrawer"')
		)
		expect(calendarOperationalController).toContain("setManualPriceDrawerOpen")
		expect(calendarOperationalController).toContain("manualPriceOpenBtn")
		expect(calendarOperationalController).toContain("syncSelectionRequiredActions")
		expect(calendarOperationalController).toContain("Boolean(selectedRange)")
		expect(calendarOperationalController).not.toContain("createMobileActionSheet")
		expect(pricing.indexOf("<CalendarOperationalPanel")).toBeLessThan(
			pricing.indexOf("data-pricing-two-month-calendar")
		)
		expect(calendarOperationalController).toContain("Cambio manual guardado")
		expect(pricing).not.toContain("Flujo avanzado multi-plan")
		expect(pricing).not.toContain("Automatización de precios</p>")
		expect(calendarOperationalPanel).toContain("data-pricing-range-preset")
		expect(calendarOperationalPanel).toContain('aria-label="Atajos de rango"')
		expect(calendarOperationalPanel).toContain("rounded-full border border-slate-200")
		expect(calendarOperationalPanel.indexOf("data-pricing-range-preset")).toBeLessThan(
			calendarOperationalPanel.indexOf('id="pricingRangePanel"')
		)
		expect(calendarOperationalPanel).toContain("pricingRangeClearBtn")
		expect(pricing).not.toContain("/pricing/bulk")
		expect(pricing).not.toContain("data-pricing-bulk-context-link")
		expect(pricing).toContain("Sin precio")
		expect(pricing).toContain("data-price-status-signal")
		expect(pricing).toContain("data-price-primary-signal")
		expect(pricing).toContain("data-price-default-row")
		expect(pricing).toContain("data-price-adjustment-row")
		expect(pricing).toContain("data-pricing-final-compare-output")
		expect(pricing).toContain("data-has-price")
		expect(pricing).toContain("data-is-past")
		expect(calendarOperationalController).toContain("syncPriceStatusSignals")
		expect(calendarOperationalController).toContain("syncPricePrimarySignals")
		expect(calendarOperationalController).toContain('activeOperationalTab === "price"')
		expect(pricing).toContain("data-availability-status-signal")
		expect(pricing).toContain("data-availability-detail-signal")
		expect(pricing).toContain("comprometido físicamente")
		expect(pricing).toContain("{!day.isPast ? (")
		expect(pricing).toContain("Reservado")
		expect(pricing).toContain("Retenido")
		expect(calendarOperationalController).toContain("syncAvailabilityStatusSignals")
		expect(calendarOperationalController).toContain("syncAvailabilityDetailSignals")
		expect(calendarOperationalController).toContain("availabilityDetailsVisible")
		expect(calendarOperationalController).toContain("inventoryPhysicalDetailToggle")
		expect(calendarOperationalController).toContain('activeOperationalTab === "availability"')
		expect(pricing).toContain("data-restriction-status-signal")
		expect(calendarOperationalController).toContain("syncRestrictionStatusSignals")
		expect(calendarOperationalController).toContain('activeOperationalTab === "restrictions"')
		expect(calendarOperationalController).not.toContain(
			'!isSelected || activeOperationalTab !== "price"'
		)
		expect(calendarOperationalController).toContain(
			'appliedAidsVisible && activeOperationalTab === "price"'
		)
		expect(calendarOperationalController).toContain("canShowPriceAdjustment")
		expect(calendarOperationalController).toContain('card.getAttribute("data-is-past") !== "true"')
		expect(calendarOperationalController).toContain(
			'card.getAttribute("data-has-price") === "true"'
		)
		expect(pricing).toContain("!day.isPast")
		expect(pricing).toContain("day.finalPrice != null")
		expect(pricing).not.toContain('day.status === "missing" ?')
		expect(pricing).toContain("data-pricing-day-card")
		expect(pricing).not.toContain("pricingDayEditor")
		expect(pricing).not.toContain("Guardar fecha")
		expect(pricing).not.toContain("data-pricing-quick-delta")
		expect(calendarOperationalPanel).not.toContain("mobile-calendar-action-sheet")
		expect(pricing).toContain("MobileCalendarSheetStyles")
		expect(pricing).toContain("mobile-calendar-grid")
		expect(pricing).toContain("mobile-priority-signal")
		expect(pricing).not.toContain("data-pricing-operational-summary")
		expect(pricing).toContain("grid-cols-7")
		expect(pricing).not.toContain("@keyframes mobile-sheet-enter")
		expect(pricing).not.toContain("pricingSheetBackdrop")
		expect(calendarOperationalPanel).not.toContain("pricingSheetCloseBtn")
		expect(calendarOperationalPanel).not.toContain("pricingSheetExpandBtn")
		expect(calendarOperationalController).toContain("manual-price-drawer-open")
		expect(pricing).not.toContain("findNextSelectableDate")
		expect(calendarOperationalController).toContain("flashAppliedRange")
		expect(calendarOperationalController).toContain("updateSelectedPricingCells")
		expect(calendarOperationalController).toContain("syncRangeValueFromSingleDate")
		expect(pricing).toContain("data-pricing-apply-result-card")
		expect(calendarOperationalController).toContain("renderOperationResult")
		expect(calendarOperationalController).toContain("buildRecoveryGuidance")
		expect(
			`${pricing}\n${calendarOperationalPanel}\n${calendarOperationalController}`
		).not.toContain("Detalle técnico")
		expect(pricing).toContain("data-pricing-adjustment-output")
		expect(pricing).not.toContain("data-pricing-day-form")
		expect(pricing).not.toContain("Seleccionar rango")
		expect(pricing).not.toContain("Estado del calendario")
		expect(pricing).not.toContain("MaterializationFreshnessStrip")
		expect(pricing).not.toContain("Estado operativo")
		expect(pricing).toContain("data-pricing-adjustment-line")
		expect(pricing).not.toContain("pricingAppliedAidToggle")
		expect(calendarOperationalPanel).toContain("pricingAppliedAidToggle")
		expect(calendarOperationalPanel).not.toContain('!isProfessionalCalendar && "hidden"')
		expect(calendarOperationalController).not.toContain("!appliedAidsVisible && !isSelected")
		expect(pricing).toContain("isProfessionalCalendar && day.bookedUnits > 0")
		expect(pricing).toContain("isProfessionalCalendar && day.heldUnits > 0")
		expect(pricing).toContain("isProfessionalCalendar && day.availableUnits <= 0 && !day.isPast")
		expect(pricing).toContain("isProfessionalCalendar &&")
		expect(pricing).toContain("!day.isPast &&")
		expect(pricing).toContain("day.finalPrice != null &&")
		expect(pricing).toContain("Number(day.ruleAdjustment ?? 0) !== 0")
		expect(pricing).toContain("isProfessionalCalendar && day.restrictionSignals.count > 0")
		expect(pricing).toContain("Venta abierta")
		expect(pricing).toContain("Con reglas")
		expect(pricing).toContain("Venta cerrada")
		expect(pricing).toContain("isProfessionalCalendar && day.restrictionSignals.minStay != null")
		expect(pricing).toContain("isProfessionalCalendar && day.restrictionSignals.cta")
		expect(pricing).toContain("isProfessionalCalendar && day.restrictionSignals.ctd")
		expect(pricing).toContain("isProfessionalCalendar && hasIncompleteConditions && !day.isPast")
		expect(pricing).not.toContain("Leyenda")
		expect(pricing).not.toContain("Ajuste solo si existe")
		expect(pricing).not.toContain("data-pricing-selected-label")
		expect(calendarOperationalController).toContain("pricing-date-selected")
		expect(pricing).toContain("Base")
		expect(pricing).toContain("Final")
		expect(pricing).toContain("data-pricing-base-output")
		expect(pricing).toContain("data-pricing-final-compare-output")
		expect(pricing).not.toContain("Ajuste manual")
		expect(pricing).not.toContain("Base heredada")
		expect(calendarOperationalController).toContain("Copiar precio")
		expect(pricing).toContain("Precio a copiar")
		expect(pricing).toContain("Listo para recibir este precio.")
		expect(pricing).toContain("Necesita un precio configurado antes de copiar.")
		expect(calendarOperationalController).toContain("No hay planes listos para copiar este precio")
		expect(pricing).not.toContain('pricingExtensionPreviewDays" type="number')
		expect(pricing).not.toContain('pricingExtensionPriority" type="number')
		expect(calendarOperationalController).toContain("con reglas de venta")
		expect(calendarOperationalController).toContain("/api/pricing/rules/v2/bulk-preview")
		expect(calendarOperationalController).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(pricing).toContain("Actualizar calendario")
		expect(pricing).not.toContain("Regenerar vista")
		expect(inventory).toContain("routes.pricing()")
		expect(inventory).toContain('target.searchParams.set("focus", "availability")')
		expect(inventory).toContain('target.searchParams.set("source", "inventory-redirect")')
		expect(inventory).toContain("return Astro.redirect")
		expect(inventoryBulk).toContain("routes.pricing()")
		expect(inventoryBulk).toContain('target.searchParams.set("focus", "availability")')
		expect(inventoryBulk).toContain('target.searchParams.set("source", "inventory-bulk-redirect")')
		expect(inventoryBulk).toContain("return Astro.redirect")
		expect(inventory).not.toContain("Inventario físico")
		expect(inventory).not.toContain("Vista avanzada de inventario")
		expect(inventory).not.toContain("getProviderSidebarData")
		expect(inventory).not.toContain("Diagnóstico físico de cupos")
		expect(inventory).not.toContain("data-inventory-diagnostic-card")
		expect(inventory).not.toContain("Inventory responde cuantos cupos existen")
		expect(inventory).not.toContain("Restrictions controla si esos cupos pueden venderse")
		expect(inventory).not.toContain("/api/inventory/update-day")
		expect(inventory).not.toContain("Ajustar cupo fisico del rango")
		expect(inventory).not.toContain("data-inventory-range-preset")
		expect(inventory).not.toContain("inventoryRangeClearBtn")
		expect(inventory).not.toContain("data-inventory-day-card")
		expect(inventory).not.toContain("inventoryDayEditor")
		expect(inventory).not.toContain("mobile-calendar-action-sheet")
		expect(inventory).not.toContain("MobileCalendarSheetStyles")
		expect(inventory).not.toContain("mobile-calendar-grid")
		expect(inventory).not.toContain("mobile-priority-signal")
		expect(inventory).not.toContain("data-mobile-calendar-summary")
		expect(inventory).not.toContain("data-mobile-operational-summary")
		expect(inventory).not.toContain("grid-cols-7")
		expect(inventory).not.toContain("@keyframes mobile-sheet-enter")
		expect(inventory).not.toContain("inventorySheetBackdrop")
		expect(inventory).not.toContain("inventorySheetCloseBtn")
		expect(inventory).not.toContain("inventorySheetExpandBtn")
		expect(inventory).not.toContain('data-sheet-state="compact"')
		expect(inventory).not.toContain("createMobileActionSheet")
		expect(inventory).not.toContain("findNextSelectableDate")
		expect(inventory).not.toContain("flashAppliedRange")
		expect(inventory).not.toContain("updateSelectedInventoryCells")
		expect(inventory).not.toContain("data-inventory-quick-delta")
		expect(inventory).not.toContain("Seguimos con")
		expect(inventory).not.toContain("data-inventory-day-form")
		expect(inventory).not.toContain("Seleccionar rango")
		expect(inventory).not.toContain("data-inventory-intelligence-strip")
		expect(inventory).not.toContain("MaterializationFreshnessStrip")
		expect(inventory).not.toContain("Actualizacion operacional")
		expect(inventory).not.toContain("Cupo bajo")
		expect(inventory).not.toContain("Agotado fisico")
		expect(inventory).not.toContain("vendibilidad se opera en reglas de venta")
		expect(inventory).not.toContain("/api/inventory/bulk-preview")
		expect(inventory).not.toContain("/api/inventory/bulk-apply")
		expect(inventory).not.toContain('type: "set_inventory"')
		expect(inventory).not.toContain('type: "open_sales"')
		expect(inventory).not.toContain('type: "close_sales"')
		expect(inventoryBulk).not.toContain('value="open_sales"')
		expect(inventoryBulk).not.toContain('value="close_sales"')
		expect(inventoryBulk).not.toContain("Abrir ventas")
		expect(inventoryBulk).not.toContain("Cerrar ventas")
		expect(inventoryBulk).not.toContain("Inventario físico · Operaciones masivas")
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
		const calendarRangeOperations = read("src/lib/rates/calendarRangeOperations.ts")
		expect(calendarRangeOperations).toContain("selectCalendarRangePreset")
		expect(calendarRangeOperations).toContain("commercialBlockers")
		expect(calendarRangeOperations).toContain(
			"`${formatHumanDateLabel(range.from)} al ${formatHumanDateLabel(range.to)}`"
		)
		expect(calendarRangeOperations).toContain("return `${day} ${month} ${date.getUTCFullYear()}`")
		expect(calendarRangeOperations).not.toContain(
			"return `${day}-${month}-${date.getUTCFullYear()}`"
		)
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
