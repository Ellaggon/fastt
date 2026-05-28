import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { backofficeRouteClassifications } from "../../src/lib/backoffice-governance"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

function listFiles(relativePath: string): string[] {
	const absolutePath = join(process.cwd(), relativePath)
	if (!existsSync(absolutePath)) return []
	const stat = statSync(absolutePath)
	if (stat.isFile()) return [relativePath]
	return readdirSync(absolutePath).flatMap((entry) => {
		if (entry === "node_modules" || entry === "dist" || entry === ".astro") return []
		return listFiles(`${relativePath}/${entry}`)
	})
}

const editorialSurfaces = [
	"src/pages/product/index.astro",
	"src/pages/product/create.astro",
	"src/pages/product/[id]/index.astro",
	"src/pages/product/[id]/preview.astro",
	"src/pages/product/[id]/content.astro",
	"src/pages/product/[id]/images.astro",
	"src/pages/product/[id]/location.astro",
	"src/pages/product/[id]/subtype.astro",
	"src/pages/product/[id]/rooms.astro",
]

describe("Guardrail: Property Content operational semantics", () => {
	it("keeps Property Content framed as catalog readiness instead of generic CRUD", () => {
		const requiredSignals: Record<string, string[]> = {
			"src/pages/product/index.astro": [
				"Alojamientos",
				"Lista de alojamientos",
				"Flujo de publicación",
			],
			"src/pages/product/create.astro": ["Crear alojamiento", "identidad mínima del alojamiento"],
			"src/pages/product/[id]/index.astro": [
				"Ficha del alojamiento",
				"Descripción",
				"Habitaciones",
				"Tipo y características",
				"Detalle interno",
			],
			"src/pages/product/[id]/preview.astro": [
				"Vista previa",
				"Antes de publicar",
				"Condiciones que verá el huésped",
				"Reglas para huéspedes",
			],
			"src/pages/product/[id]/content.astro": ["Contenido", "Contenido principal"],
			"src/pages/product/[id]/images.astro": ["Fotos", "Galería del alojamiento"],
			"src/pages/product/[id]/location.astro": ["Ubicación", "Metadata geográfica"],
			"src/pages/product/[id]/subtype.astro": ["Detalles del alojamiento", "Detalles específicos"],
			"src/pages/product/[id]/rooms.astro": [
				"Habitaciones de",
				"Nueva habitación",
				"Editar habitación",
				"Inventario base",
				"Tarifas vinculadas",
				"Detalle interno",
			],
		}

		const violations = Object.entries(requiredSignals).flatMap(([relativePath, signals]) => {
			const source = read(relativePath)
			return signals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${relativePath}: missing "${signal}"`]
			)
		})

		expect(
			violations,
			`Property Content surfaces must communicate editorial/catalog ownership and readiness boundaries:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps page-level governance light because WorkspaceLayout owns context framing", () => {
		const bannedDecorativeSignals = [
			"Readiness ownership",
			"Sellability readiness context",
			"Owned by",
			"Owned here",
			"Not owned here",
			"Commercial context",
			"Inventory context",
			"Quality signal",
			"Boundary",
			"Property Content · Editorial Ownership",
			"Property Content · Catalog Layer",
		]

		const violations = editorialSurfaces.flatMap((relativePath) => {
			const source = read(relativePath)
			return bannedDecorativeSignals.flatMap((signal) =>
				source.includes(signal) ? [`${relativePath}: duplicate governance signal "${signal}"`] : []
			)
		})

		expect(
			violations,
			`Property Content pages should operate after the shell frames context; avoid governance-on-governance:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("prevents editorial catalog pages from owning pricing or inventory runtime", () => {
		const forbiddenRuntimePatterns = [
			/\/api\/pricing\//,
			/\/api\/inventory\//,
			/\/pricing\/bulk/,
			/\/inventory\/bulk/,
			/ratePlanId/,
			/RatePlan/,
			/EffectivePricing/,
			/DailyInventory/,
			/EffectiveAvailability/,
		]

		const violations = editorialSurfaces.flatMap((relativePath) => {
			const source = read(relativePath)
			return forbiddenRuntimePatterns.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: forbidden operational ownership ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Property Content may show contextual sellability signals, but must not own pricing/inventory runtime:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps physical variant surfaces from reverting to variant-pricing language", () => {
		const files = [
			"src/pages/product/[id]/variants.astro",
			"src/pages/product/[id]/variants/[variantId].astro",
			"src/pages/product/[id]/variants/new.astro",
			"src/pages/product/[id]/variants/[variantId]/capacity.astro",
			"src/pages/product/[id]/variants/[variantId]/inventory.astro",
			"src/pages/product/[id]/variants/[variantId]/subtype.astro",
			"src/pages/product/[id]/variants/[variantId]/availability.astro",
		]
		const bannedCopy = [/Precios/, /Sin pricing configurado/, /pricing por variante/i, /Producto ·/]

		const violations = files.flatMap((relativePath) => {
			const source = read(relativePath)
			return bannedCopy.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: banned variant-pricing language ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Variant surfaces must keep commercial coverage contextual and never revive variant-pricing language:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("classifies variant surfaces as physical context instead of broad editorial catalog", () => {
		expect(backofficeRouteClassifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					pattern: "/product/:id/rooms",
					status: "canonical",
					owner: "Property Content",
				}),
				expect.objectContaining({
					pattern: "/product/:id/variants/**",
					status: "transitional",
					owner: "Physical Inventory Context",
				}),
				expect.objectContaining({
					pattern: "/api/internal/variants-summary",
					status: "transitional",
					owner: "Physical Inventory Context",
				}),
				expect.objectContaining({
					pattern: "/api/internal/variant-summary",
					status: "transitional",
					owner: "Physical Inventory Context",
				}),
			])
		)
	})

	it("keeps Property Content navigation honest about planned maturity", () => {
		const governance = read("src/lib/backoffice-governance.ts")

		expect(governance).toContain("Alojamientos")
		expect(governance).toContain("Habitaciones")
		expect(governance).toContain("Reglas para huéspedes")
		expect(governance).toContain("Revisión de fotos")
		expect(governance).toContain("Metadata SEO")
		expect(governance).toContain("Flujo de calidad de contenido")
		expect(governance).toContain("Gestiona alojamientos")
		expect(governance).not.toContain("Property Content NO")
	})

	it("integrates House Rules into the provider publish confidence loop", () => {
		const worklist = read("src/pages/product/index.astro")
		const readiness = read("src/pages/product/[id]/index.astro")
		const preview = read("src/pages/product/[id]/preview.astro")
		const houseRules = read("src/pages/provider/house-rules.astro")
		const houseRulesPublicApi = read("src/modules/house-rules/public.ts")
		const guestSnapshot = read("src/modules/house-rules/domain/guestStayExpectationsSnapshot.ts")
		const routes = read("src/lib/routes.ts")
		const contentPage = read("src/pages/product/[id]/content.astro")
		const productContentApi = read("src/pages/api/product/content.ts")
		const rulesResolver = read("src/modules/rules/application/use-cases/resolve-effective-rules.ts")
		const createInventoryHold = read(
			"src/modules/inventory/application/use-cases/create-inventory-hold.ts"
		)
		const rulesPublicApi = read("src/modules/rules/public.ts")
		const ruleEntities = read("src/modules/rules/domain/rule.entities.ts")
		const ruleTypes = read("src/modules/rules/domain/rule.types.ts")
		const dbConfig = read("db/config.ts")
		const productContentTable =
			dbConfig.match(/const ProductContent = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const houseRuleTable =
			dbConfig.match(/const HouseRule = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const holdTable = dbConfig.match(/const Hold = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const houseRuleRepository = read(
			"src/modules/house-rules/infrastructure/repositories/HouseRuleRepository.ts"
		)
		const backofficeGovernance = read("src/lib/backoffice-governance.ts")

		expect(routes).toContain("productPreview")
		expect(worklist).toContain("routes.productPreview(product.id)")
		expect(readiness).toContain("routes.productPreview(productId)")
		expect(readiness).toContain("routes.providerHouseRules()}?productId=")
		expect(houseRules).toContain("routes.productPreview(selectedProduct.id)")
		expect(houseRules).toContain("requestedProductId")
		expect(houseRules).toContain("visibleProducts")
		expect(houseRules).toContain("Ver ficha completa")

		expect(preview).toContain("Antes de publicar")
		expect(preview).toContain("Condiciones que verá el huésped")
		expect(preview).toContain("Reglas para huéspedes")
		expect(preview).toContain("buildGuestStayExpectationsSnapshot")
		expect(preview).toContain("routes.providerHouseRules()")
		expect(preview).toContain("routes.providerPolicies()")
		expect(preview).not.toContain("/api/pricing/")
		expect(preview).not.toContain("/api/inventory/")

		expect(contentPage).not.toContain('name="rules"')
		expect(productContentApi).not.toContain('form.get("rules")')
		expect(productContentTable).not.toContain("rules:")
		expect(houseRuleTable).toContain("payloadJson:")
		expect(houseRuleTable).not.toContain("description:")
		expect(rulesResolver).not.toContain(["ProductContent", "rules"].join("."))
		expect(rulesResolver).not.toContain(["product_content", "rules"].join("_"))
		expect(rulesResolver).not.toContain("listHouseRulesByProduct")
		expect(rulesResolver).not.toContain("mapHouseRulesToRules")
		expect(rulesResolver).not.toContain("houseRules")
		expect(rulesPublicApi).not.toContain("house-rule-to-rule")
		expect(ruleEntities).not.toContain('"house_rule"')
		expect(ruleTypes).not.toContain('"INFO"')
		expect(ruleTypes).not.toContain("InformativeRuleContent")
		expect(houseRuleRepository).toContain("payloadJson: HouseRuleTable.payloadJson")
		expect(houseRuleRepository).not.toContain("description")
		expect(houseRuleRepository).not.toMatch(new RegExp(["isMissing", "PayloadJsonColumn"].join("")))
		expect(houseRuleRepository).not.toMatch(/payloadJson:\s*null/)
		expect(backofficeGovernance).not.toContain("/api/house-rules")
		expect(houseRulesPublicApi).toContain("buildGuestStayExpectationsSnapshot")
		expect(guestSnapshot).toContain('source: "house_rule"')
		expect(guestSnapshot).not.toContain("EffectiveRule")
		expect(holdTable).toContain("guestExpectationsSnapshotJson")
		expect(createInventoryHold).toContain("guestExpectationsSnapshotJson")
		expect(createInventoryHold).not.toContain("policySnapshot.guestExpectations")
	})

	it("keeps House Rules out of operational pricing, restrictions, availability, search, and policy resolution", () => {
		const forbiddenOperationalRoots = [
			"src/modules/pricing",
			"src/modules/restrictions",
			"src/modules/search",
			"src/modules/rules",
			"src/modules/policies",
			"src/pages/pricing",
			"src/pages/rates/restrictions.astro",
			"src/pages/api/pricing",
			"src/pages/api/policies",
			"src/pages/api/search",
		]
		const forbiddenPatterns = [
			/HouseRule/,
			/house-rules/,
			/listHouseRulesByProduct/,
			/buildGuestStayExpectationsSnapshot/,
			/house_rule/,
		]

		const violations = forbiddenOperationalRoots.flatMap((root) =>
			listFiles(root).flatMap((relativePath) => {
				if (!/\.(ts|astro)$/.test(relativePath)) return []
				const source = read(relativePath)
				return forbiddenPatterns.flatMap((pattern) =>
					pattern.test(source) ? [`${relativePath}: forbidden HouseRule dependency ${pattern}`] : []
				)
			})
		)

		expect(
			violations,
			`HouseRule is guest-facing content only; it must not affect pricing, restrictions, availability, search sellability, rules, or policy contract resolution:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("limits cross-module House Rule consumers to guest-facing surfaces and guest expectation snapshots", () => {
		const allowedConsumers = new Set([
			"src/container/house-rules.container.ts",
			"src/modules/house-rules/public.ts",
			"src/pages/provider/house-rules.astro",
			"src/pages/product/[id]/preview.astro",
			"src/pages/hotels/[id]/index.astro",
			"src/pages/api/internal/product-summary.ts",
			"src/pages/api/inventory/hold.ts",
			"src/modules/inventory/application/use-cases/create-inventory-hold.ts",
			"src/modules/inventory/application/use-cases/hold-inventory.ts",
			"src/modules/inventory/application/ports/InventoryHoldRepositoryPort.ts",
			"src/modules/inventory/infrastructure/repositories/InventoryHoldRepository.ts",
			"src/modules/catalog/infrastructure/repositories/ProductRepository.ts",
		])
		const sourceFiles = listFiles("src").filter((relativePath) =>
			/\.(ts|astro)$/.test(relativePath)
		)
		const dependencyPatterns = [
			/from\s+["']@\/modules\/house-rules/,
			/\bHouseRule\b/,
			/\blistHouseRulesByProduct\b/,
			/\bbuildGuestStayExpectationsSnapshot\b/,
			/"house_rule"/,
			/guestExpectationsSnapshotJson/,
		]

		const violations = sourceFiles.flatMap((relativePath) => {
			if (relativePath.startsWith("src/modules/house-rules/")) return []
			if (relativePath === "src/test-support/astro-db.ts") return []
			if (allowedConsumers.has(relativePath)) return []
			const source = read(relativePath)
			return dependencyPatterns.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: unexpected HouseRule consumer ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Only guest-facing surfaces, product readiness/summary, the guest expectations snapshot flow, hold snapshot storage, and delete cascade may consume HouseRule concepts:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("feeds the product surface with real rooms and an explicit cover image", () => {
		const summaryEndpoint = read("src/pages/api/internal/product-summary.ts")
		const productSurface = read("src/pages/product/[id]/index.astro")

		expect(summaryEndpoint).toContain("getProductVariantsAggregate")
		expect(summaryEndpoint).not.toContain("const hasVariants = false")
		expect(summaryEndpoint).toContain("activeVariants.length > 0")
		expect(summaryEndpoint).toContain("coverImage")
		expect(summaryEndpoint).toContain("variants:")

		expect(productSurface).toContain("payload?.variants?.count")
		expect(productSurface).toContain("payload?.images?.cover?.url")
	})

	it("keeps the room ficha guest-facing while reading operational context through summaries", () => {
		const roomsSurface = read("src/pages/product/[id]/rooms.astro")
		const variantsSummary = read("src/pages/api/internal/variants-summary.ts")

		expect(roomsSurface).toContain("Ficha de habitaciones")
		expect(roomsSurface).toContain("Tarifas vinculadas")
		expect(roomsSurface).toContain("Inventario base")
		expect(roomsSurface).toContain("Detalle interno")
		expect(roomsSurface).toContain("/api/internal/variants-summary")
		expect(roomsSurface).not.toContain("RatePlan")
		expect(roomsSurface).not.toContain("DailyInventory")

		expect(variantsSummary).toContain("photos:")
		expect(variantsSummary).toContain("tariffs:")
		expect(variantsSummary).toContain("inventory:")
		expect(variantsSummary).toContain("RatePlanTemplate")
	})
})
