import { existsSync, readFileSync } from "node:fs"
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
	it("keeps Property Content framed as a client-first accommodation shell", () => {
		const requiredSignals: Record<string, string[]> = {
			"src/pages/product/index.astro": ["Astro.redirect", "routes.catalogAccommodations"],
			"src/pages/dashboard/index.astro": [
				"Resumen Operativo",
				"¿Administras otro servicio?",
				"Agregar otro servicio",
			],
			"src/pages/product/create.astro": [
				"¿Qué quieres ofrecer?",
				"Tipo de servicio",
				"workspaceCreateHref",
			],
			"src/pages/product/[id]/index.astro": [
				"Ficha del alojamiento",
				"Descripción",
				"Tipo y características",
				"Preparación de la estancia",
				"Operación",
			],
			"src/pages/product/_client/product-summary-hydration.ts": [
				"astro:page-load",
				"payload?.variants?.count",
				"payload?.images?.cover?.url",
			],
			"src/pages/product/[id]/preview.astro": [
				"Vista previa",
				"Pendientes para publicar",
				"Condiciones que verá el huésped",
				"Reglas para huéspedes",
			],
			"src/pages/product/[id]/content.astro": ["Contenido", "Contenido principal"],
			"src/pages/product/[id]/images.astro": ["Fotos", "Galería del alojamiento"],
			"src/pages/product/[id]/location.astro": ["Ubicación", "Metadata geográfica"],
			"src/pages/product/[id]/subtype.astro": ["Detalles del alojamiento"],
			"src/pages/product/[id]/rooms.astro": [
				"Experiencia de descanso de",
				"Nueva habitación",
				"Editar habitación",
				"Calendario",
				"Tarifas",
				"Condiciones",
				"Siguiente paso recomendado",
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
			`Property Content surfaces must communicate accommodation ownership and client-first publishing boundaries:\n${violations.join("\n")}`
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
		const forbiddenWritePatterns = [
			/\/api\/pricing\//,
			/\/api\/inventory\//,
			/\/pricing\/bulk/,
			/\/inventory\/bulk/,
			/EffectivePricing/,
			/EffectiveAvailability/,
		]
		const forbiddenOwnershipOutsidePreview = [/ratePlanId/, /RatePlan/, /DailyInventory/]
		const previewPath = "src/pages/product/[id]/preview.astro"

		const violations = editorialSurfaces.flatMap((relativePath) => {
			const source = read(relativePath)
			const writeHits = forbiddenWritePatterns.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: forbidden operational ownership ${pattern}`] : []
			)
			if (relativePath === previewPath) {
				// Preview may read RatePlan/DailyInventory for contextual sellability readiness only.
				return writeHits
			}
			return [
				...writeHits,
				...forbiddenOwnershipOutsidePreview.flatMap((pattern) =>
					pattern.test(source)
						? [`${relativePath}: forbidden operational ownership ${pattern}`]
						: []
				),
			]
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

	it("keeps retired room and variant URLs out of the router", () => {
		const routes = read("src/lib/routes.ts")
		const roomWorkspace = read("src/pages/product/[id]/rooms/[roomId]/index.astro")
		const removedLegacyVariantRoutes = [
			"src/pages/rooms.astro",
			"src/pages/catalog/accommodations/rooms/index.astro",
			"src/pages/product/[id]/rooms/[roomId]/inventory.astro",
			"src/pages/product/[id]/rooms/[roomId]/availability.astro",
			"src/pages/product/[id]/variants/new.astro",
			"src/pages/product/[id]/variants/[variantId]/index.astro",
			"src/pages/product/[id]/variants/[variantId]/capacity.astro",
			"src/pages/product/[id]/variants/[variantId]/subtype.astro",
			"src/pages/product/[id]/variants/[variantId]/[...legacy].astro",
		]

		expect(routes).not.toContain("#disponibilidad")
		expect(routes).toContain("/rates/calendar?variantId=")
		expect(roomWorkspace).toContain("window.location.hash")
		expect(roomWorkspace).toContain("hashchange")
		expect(roomWorkspace).toContain("Galería de la habitación")
		expect(roomWorkspace).toContain("Visible en Dónde dormirás")
		expect(roomWorkspace).toContain("GuestRoomPreviewCards")
		expect(roomWorkspace).toContain("Así lo verá el huésped")
		expect(roomWorkspace).toContain("workspaceGuestRoomPreviewCards")
		expect(roomWorkspace).toContain("renderGuestRoomPreviewCards")
		expect(roomWorkspace).toContain("#fotos")
		expect(roomWorkspace).toContain("roomPhotoReadiness")
		for (const relativePath of removedLegacyVariantRoutes) {
			expect(
				existsSync(join(process.cwd(), relativePath)),
				`${relativePath} should stay removed`
			).toBe(false)
		}
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
					pattern: "/api/internal/rooms-summary",
					status: "canonical",
					owner: "Property Content",
				}),
				expect.objectContaining({
					pattern: "/api/internal/room-summary",
					status: "canonical",
					owner: "Property Content",
				}),
			])
		)
	})

	it("keeps accommodation content navigation operational and free of roadmap copy", () => {
		const governance = read("src/lib/backoffice-governance.ts")
		const sidebar = read("src/components/dashboard/DashboardSidebar.astro")

		expect(governance).toContain("Servicios")
		expect(governance).toContain("Alojamiento")
		expect(governance).toContain("Habitaciones")
		expect(governance).toContain("Reglas para huéspedes")
		expect(governance).toContain("Gestiona solo los rubros activos")
		expect(sidebar).not.toContain("Próximamente")
		expect(governance).not.toContain("Property Content NO")
	})

	it("keeps Product as generic catalog while rooms stay Hotel-only", () => {
		const registry = read("src/lib/catalog/productVerticalRegistry.ts")
		const productCreate = read("src/pages/product/create.astro")
		const roomsAggregate = read("src/pages/dashboard/index.astro")
		const roomsByProduct = read("src/pages/product/[id]/rooms.astro")
		const roomWizard = read("src/pages/product/[id]/rooms/new.astro")
		const roomProfileEditor = read("src/components/rooms/RoomProfileEditor.astro")
		const roomProfileApi = read("src/pages/api/variant/room-profile.ts")

		expect(registry).toContain('productType: "hotel"')
		expect(registry).toContain('productType: "tour"')
		expect(registry).toContain('productType: "package"')
		expect(registry).toContain('productType: "limousine"')
		expect(registry).toContain("normalizeProductTypeForStorage")
		expect(productCreate).toContain("listActiveProductVerticalEntries")
		expect(productCreate).toContain("¿Qué quieres ofrecer?")
		expect(productCreate).toContain("Tipo de servicio")
		expect(roomsAggregate).toContain('product.type.toLowerCase() === "hotel"')
		expect(roomsAggregate).toContain("Resumen Operativo")
		expect(roomsAggregate).toContain("buildAddRoomHref")
		expect(roomsAggregate).toContain("¿Administras otro servicio?")
		expect(roomsByProduct).toContain("isHotelProductType")
		expect(roomWizard).toContain("RoomProfileEditor")
		expect(roomProfileEditor).toContain('value="hotel_room"')
		expect(roomProfileApi).toContain('kind: "hotel_room"')
		expect(`${roomWizard}\n${roomProfileEditor}`).not.toContain('value="tour_slot"')
		expect(`${roomWizard}\n${roomProfileEditor}`).not.toContain('value="package_base"')
	})

	it("integrates House Rules into the provider publish confidence loop", () => {
		const worklist = read("src/pages/dashboard/index.astro")
		const readiness = read("src/pages/product/[id]/index.astro")
		const preview = read("src/pages/product/[id]/preview.astro")
		const houseRules = read("src/pages/provider/house-rules.astro")
		const arrivalSync = read("src/lib/policies/syncHotelArrivalPolicy.ts")
		const routes = read("src/lib/routes.ts")
		const contentPage = read("src/pages/product/[id]/content.astro")
		const productContentApi = read("src/pages/api/product/content.ts")
		const rulesResolver = read("src/modules/rules/application/use-cases/resolve-effective-rules.ts")
		const dbConfig = read("src/shared/infrastructure/db/schema/tables.ts")
		const productContentStart = dbConfig.indexOf("export const ProductContent = pgTable")
		const houseRuleStart = dbConfig.indexOf("export const HouseRule = pgTable")
		const productContentTable = dbConfig.slice(productContentStart, houseRuleStart)
		const nextAfterHouseRule = dbConfig.indexOf("\nexport const ", houseRuleStart + 1)
		const houseRuleTable = dbConfig.slice(houseRuleStart, nextAfterHouseRule)
		const houseRuleRepository = read(
			"src/modules/house-rules/infrastructure/repositories/HouseRuleRepository.ts"
		)
		const backofficeGovernance = read("src/lib/backoffice-governance.ts")

		expect(routes).toContain("productPreview")
		expect(worklist).toContain("routes.productRoomsForProduct(product.id)")
		expect(worklist).toContain("routes.productRoomNew(product.id)")
		expect(readiness).toContain("routes.productPreview(productId)")
		expect(readiness).toContain("routes.providerHouseRules()}?productId=")
		expect(houseRules).toContain("routes.productPreview(selectedProduct.id)")
		expect(houseRules).toContain("requestedProductId")
		expect(houseRules).toContain("visibleProducts")
		expect(houseRules).toContain("Ver ficha completa")
		expect(houseRules).toContain("TabsOutsidePanel")
		expect(houseRules).toContain("fastt-tabs-outside-panel__item")
		expect(houseRules).not.toContain("SegmentedControl")
		expect(houseRules).toContain("syncHotelArrivalPolicy")
		const houseRuleEditor = read("src/components/house-rules/HouseRuleEditorRow.astro")
		expect(houseRules).toContain("HouseRuleEditorRow")
		expect(houseRules).toContain("Pendientes")
		expect(houseRules).toContain("Áreas completadas")
		expect(houseRules).toContain("data-house-rules-complete-areas")
		expect(houseRuleEditor).toContain("fastt-row-card")
		expect(`${houseRules}\n${houseRuleEditor}`).toContain('name="checkInFrom"')
		expect(`${houseRules}\n${houseRuleEditor}`).toContain('name="checkInUntil"')
		expect(arrivalSync).toContain('scope: "product"')
		expect(arrivalSync).toContain('category: "CheckIn"')
		expect(arrivalSync).toContain("replacePolicyAssignmentCapa6")

		expect(preview).toContain("Pendientes para publicar")
		expect(preview).toContain("Dónde dormirán los huéspedes")
		expect(preview).toContain("Condiciones que verá el huésped")
		expect(preview).toContain("Reglas para huéspedes")
		expect(preview).toContain("routes.providerHouseRules()")
		expect(preview).toContain("routes.rates()")
		expect(preview).not.toContain("/api/pricing/")
		expect(preview).not.toContain("/api/inventory/")

		expect(contentPage).not.toContain('name="rules"')
		expect(productContentApi).not.toContain('form.get("rules")')
		expect(productContentTable).not.toContain("rules:")
		expect(houseRuleTable).toContain("payloadJson:")
		expect(houseRuleTable).toContain('scope: text("scope")')
		expect(houseRuleTable).toContain("scopeId:")
		expect(houseRuleTable).toContain("HouseRule_variant_type_unique")
		expect(houseRuleTable).not.toContain("description:")
		expect(rulesResolver).not.toContain(["ProductContent", "rules"].join("."))
		expect(rulesResolver).not.toContain(["product_content", "rules"].join("_"))
		expect(houseRuleRepository).toContain("payloadJson: HouseRuleTable.payloadJson")
		expect(houseRuleRepository).toContain("listVariantOverrides")
		expect(houseRuleRepository).not.toContain("description")
		expect(houseRuleRepository).not.toMatch(new RegExp(["isMissing", "PayloadJsonColumn"].join("")))
		expect(houseRuleRepository).not.toMatch(/payloadJson:\s*null/)
		expect(backofficeGovernance).not.toContain("/api/house-rules")
	})

	it("feeds the product surface with real rooms and an explicit cover image", () => {
		const summaryEndpoint = read("src/pages/api/internal/product-summary.ts")
		const productHydration = read("src/pages/product/_client/product-summary-hydration.ts")

		expect(summaryEndpoint).toContain("getProductVariantsAggregate")
		expect(summaryEndpoint).not.toContain("const hasVariants = false")
		expect(summaryEndpoint).toContain("activeVariants.length > 0")
		expect(summaryEndpoint).toContain("coverImage")
		expect(summaryEndpoint).toContain("variants:")

		expect(productHydration).toContain("payload?.variants?.count")
		expect(productHydration).toContain("payload?.images?.cover?.url")
	})

	it("keeps the product location preview read-only and navigation-safe", () => {
		const summaryEndpoint = read("src/pages/api/internal/product-summary.ts")
		const productSurface = read("src/pages/product/[id]/index.astro")
		const productHydration = read("src/pages/product/_client/product-summary-hydration.ts")
		const locationPreview = read("src/components/product/ProductLocationPreview.astro")

		expect(summaryEndpoint).toContain("latitude: aggregate.location.lat")
		expect(summaryEndpoint).toContain("longitude: aggregate.location.lng")
		expect(productSurface).toContain("ProductLocationPreview")
		expect(productHydration).toContain("product-location-preview:update")
		expect(locationPreview).toContain("IntersectionObserver")
		expect(locationPreview).toContain("dragging: false")
		expect(locationPreview).toContain("scrollWheelZoom: false")
		expect(locationPreview).toContain("astro:before-swap")
		expect(locationPreview).toContain("destroyPreview")
	})

	it("uses the complete-to-publish evaluation for preparation totals", () => {
		const productSurface = read("src/pages/product/[id]/index.astro")
		const summaryEndpoint = read("src/pages/api/internal/product-summary.ts")
		const completeToPublishProgress = read(
			"src/lib/playbook/evaluate-complete-to-publish-progress.ts"
		)

		expect(productSurface).toContain("summarizeProductPreparation")
		expect(productSurface).not.toContain("requiredPreparationSections")
		expect(summaryEndpoint).toContain("canonical playbook totals")
		expect(completeToPublishProgress).toContain("const orderedSteps = state.checks")
	})

	it("uses the same commercial readiness checks when evaluating or publishing a product", () => {
		const evaluateEndpoint = read("src/pages/api/product/evaluate.ts")
		const publishEndpoint = read("src/pages/api/product/publish.ts")
		const publicationReadiness = read("src/lib/product/canonical-product-publication.ts")
		const completeToPublishProgress = read(
			"src/lib/playbook/evaluate-complete-to-publish-progress.ts"
		)

		expect(evaluateEndpoint).toContain("resolveCanonicalProductPublicationValidationErrors")
		expect(publishEndpoint).toContain("resolveCanonicalProductPublicationValidationErrors")
		expect(publicationReadiness).toContain("publicationValidationErrorsFromState")
		expect(completeToPublishProgress).toContain("sellableRoomCount")
		expect(completeToPublishProgress).toContain("statusLabel")
	})

	it("keeps product deletion protected but out of the operational surface", () => {
		const productSurface = read("src/pages/product/[id]/index.astro")
		const deleteControls = read("src/components/product/ProductDeleteControls.astro")

		expect(deleteControls).toContain("data-product-delete-zone")
		expect(productSurface).not.toContain("data-product-action-menu")
		expect(deleteControls).toContain("data-product-delete-confirmation")
		expect(deleteControls).toContain("data-confirm-product-delete")
		expect(deleteControls).toContain("/api/products/${encodeURIComponent(productId)}/delete")
	})

	it("keeps the room ficha guest-facing while reading operational context through summaries", () => {
		const roomsSurface = read("src/pages/product/[id]/rooms.astro")
		const roomWorkspace = read("src/pages/product/[id]/rooms/[roomId]/index.astro")
		const productPreview = read("src/pages/product/[id]/preview.astro")
		const publicRooms = read("src/components/productUI/RoomSection.astro")
		const roomModal = read("src/components/productUI/RoomModal.astro")
		const sharedRoomPreview = read("src/components/productUI/GuestRoomPreviewCards.astro")
		const roomsSummary = read("src/pages/api/internal/rooms-summary.ts")
		const roomSummary = read("src/pages/api/internal/room-summary.ts")
		const roomProfileEditor = read("src/components/rooms/RoomProfileEditor.astro")

		expect(roomsSurface).toContain("Experiencia de descanso")
		expect(roomsSurface).toContain("Tarifas")
		expect(roomsSurface).toContain("Calendario")
		expect(roomsSurface).toContain("Condiciones")
		expect(roomsSurface).toContain("Siguiente paso recomendado")
		expect(roomsSurface).not.toContain("Inventario base")
		expect(roomsSurface).not.toContain("Detalle interno")
		expect(roomsSurface).toContain("/api/internal/rooms-summary")
		expect(roomsSurface).not.toContain("RatePlan")
		expect(roomsSurface).not.toContain("DailyInventory")
		expect(roomWorkspace).toContain("Resumen")
		expect(roomWorkspace).toContain("Experiencia huésped")
		expect(roomWorkspace).toContain("Fotos")
		expect(roomWorkspace).toContain("Previsualización")
		expect(roomWorkspace).toContain("Accesos rápidos")
		expect(roomWorkspace).toContain("Estado de venta de la habitación")
		expect(roomWorkspace).toContain("overviewPrimaryAction")
		expect(roomWorkspace).toContain("Dónde dormirás")
		expect(roomWorkspace).toContain('data-room-tab="previsualizacion"')
		expect(roomWorkspace).not.toContain('data-room-tab="publicacion"')
		expect(roomWorkspace).not.toContain('data-room-tab="disponibilidad"')
		expect(roomWorkspace).not.toContain("Próximos pasos")
		expect(roomWorkspace).not.toContain("Resumen para gestión")
		expect(roomProfileEditor).toContain("xl:grid-cols-[minmax(0,1fr)_380px]")
		expect(roomProfileEditor).toContain("Preview huésped")
		expect(roomProfileEditor).toContain("roomEditorPreviewBeds")
		expect(roomProfileEditor).toContain("renderEditorPreview")
		expect(roomProfileEditor).toContain("roomPreset")
		expect(roomProfileEditor).toContain("Setup guiado de habitación")
		expect(roomProfileEditor).toContain('data-guide-section="nombre-tipo"')
		expect(roomProfileEditor).toContain('data-guide-section="capacidad"')
		expect(roomProfileEditor).toContain('data-guide-section="dormir"')
		expect(roomProfileEditor).toContain('data-guide-section="bano-espacio"')
		expect(roomProfileEditor).toContain('data-guide-section="comodidades"')
		expect(roomProfileEditor).toContain('data-guide-section="preview"')
		expect(roomProfileEditor).toContain("presetImpact")
		expect(roomProfileEditor).toContain("renderGuideProgress")
		expect(roomProfileEditor).toContain("Código interno")
		expect(roomProfileEditor).toContain("Unidades disponibles de esta configuración")
		expect(publicRooms).toContain("Dónde dormirás")
		expect(publicRooms).toContain("guestRoomPreviews")
		expect(publicRooms).toContain("GuestRoomPreviewCards")
		expect(productPreview).toContain("GuestRoomPreviewCards")
		expect(sharedRoomPreview).toContain("Dónde dormirás")
		expect(sharedRoomPreview).toContain("Comodidades de la habitación")
		expect(sharedRoomPreview).toContain("Notas para huéspedes")
		expect(sharedRoomPreview).toContain("enableModal")
		expect(roomModal).toContain("Dónde dormirás")
		expect(roomModal).toContain("Notas para huéspedes")

		expect(roomsSummary).toContain("photos:")
		expect(roomsSummary).toContain("tariffs:")
		expect(roomsSummary).toContain("inventory:")
		expect(roomsSummary).toContain("resolveRatePlanNameColumn")
		expect(roomsSummary).not.toContain("RatePlanTemplate")
		expect(roomSummary).toContain("guestPreview")
		expect(roomSummary).toContain("sleepAreas")
		expect(roomSummary).toContain("amenityGroups")
	})
})
