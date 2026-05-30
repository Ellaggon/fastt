import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { backofficeRouteClassifications } from "../../src/lib/backoffice-governance"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
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
			"src/pages/product/index.astro": ["Catálogo", "Lista de", "Flujo de publicación"],
			"src/pages/product/create.astro": ["Crear oferta", "Tipo de oferta"],
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
			"src/pages/product/[id]/rooms/new.astro",
			"src/pages/product/[id]/rooms/[roomId]/index.astro",
			"src/pages/product/[id]/rooms/[roomId]/capacity.astro",
			"src/pages/product/[id]/rooms/[roomId]/inventory.astro",
			"src/pages/product/[id]/rooms/[roomId]/subtype.astro",
			"src/pages/product/[id]/rooms/[roomId]/availability.astro",
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
					pattern: "/product/:id/rooms/**",
					status: "canonical",
					owner: "Property Content",
				}),
				expect.objectContaining({
					pattern: "/product/:id/variants/**",
					status: "legacy",
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

	it("keeps Product as generic catalog while rooms stay Hotel-only", () => {
		const registry = read("src/lib/productVerticalRegistry.ts")
		const productList = read("src/pages/product/index.astro")
		const productCreate = read("src/pages/product/create.astro")
		const roomsAggregate = read("src/pages/catalog/accommodations/rooms/index.astro")
		const roomsByProduct = read("src/pages/product/[id]/rooms.astro")
		const roomWizard = read("src/pages/product/[id]/rooms/new.astro")
		const roomProfileEditor = read("src/components/rooms/RoomProfileEditor.astro")
		const roomProfileApi = read("src/pages/api/variant/room-profile.ts")

		expect(registry).toContain('storageType: "Hotel"')
		expect(registry).toContain('storageType: "Tour"')
		expect(registry).toContain('storageType: "Package"')
		expect(registry).toContain("normalizeProductTypeForStorage")
		expect(productList).toContain("Catálogo")
		expect(productList).toContain("PRODUCT_VERTICAL_OPTIONS")
		expect(productCreate).toContain("PRODUCT_VERTICAL_OPTIONS")
		expect(productCreate).toContain("Crear oferta")
		expect(roomsAggregate).toContain("lower(${Product.productType}) = 'hotel'")
		expect(roomsByProduct).toContain("isHotelProductType")
		expect(roomWizard).toContain("RoomProfileEditor")
		expect(roomProfileEditor).toContain('value="hotel_room"')
		expect(roomProfileApi).toContain('kind: "hotel_room"')
		expect(`${roomWizard}\n${roomProfileEditor}`).not.toContain('value="tour_slot"')
		expect(`${roomWizard}\n${roomProfileEditor}`).not.toContain('value="package_base"')
	})

	it("integrates House Rules into the provider publish confidence loop", () => {
		const worklist = read("src/pages/product/index.astro")
		const readiness = read("src/pages/product/[id]/index.astro")
		const preview = read("src/pages/product/[id]/preview.astro")
		const houseRules = read("src/pages/provider/house-rules.astro")
		const routes = read("src/lib/routes.ts")
		const contentPage = read("src/pages/product/[id]/content.astro")
		const productContentApi = read("src/pages/api/product/content.ts")
		const rulesResolver = read("src/modules/rules/application/use-cases/resolve-effective-rules.ts")
		const dbConfig = read("db/config.ts")
		const productContentTable =
			dbConfig.match(/const ProductContent = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const houseRuleTable =
			dbConfig.match(/const HouseRule = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
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
		expect(houseRuleRepository).toContain("payloadJson: HouseRuleTable.payloadJson")
		expect(houseRuleRepository).not.toContain("description")
		expect(houseRuleRepository).not.toMatch(new RegExp(["isMissing", "PayloadJsonColumn"].join("")))
		expect(houseRuleRepository).not.toMatch(/payloadJson:\s*null/)
		expect(backofficeGovernance).not.toContain("/api/house-rules")
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
