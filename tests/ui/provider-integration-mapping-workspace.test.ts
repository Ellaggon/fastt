import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { fetchChannelManagerRemoteCatalog } from "@/lib/provider-channel-manager-properties"
import { buildChannelManagerMappingWorkspace } from "@/lib/provider-integration-mapping-workspace"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider channel-manager mapping workspace", () => {
	it("normalizes remote room types and rate plans without exposing credentials", async () => {
		const catalog = await fetchChannelManagerRemoteCatalog({
			vendorKey: "cloudbeds",
			authType: "api_key",
			credentialSecret: "test://cloudbeds-ok",
			mode: "sandbox",
			propertyId: "property_1",
		})

		expect(catalog.roomTypes[0]).toMatchObject({
			id: "cb_room_deluxe",
			name: "Deluxe King",
			propertyId: "property_1",
		})
		expect(catalog.ratePlans[0]).toMatchObject({
			id: "cb_rate_deluxe_bar",
			roomTypeId: "cb_room_deluxe",
		})
		expect(JSON.stringify(catalog)).not.toContain("test://")
	})

	it("suggests one-to-one mappings and uses room hierarchy for rate plans", async () => {
		const remoteCatalog = await fetchChannelManagerRemoteCatalog({
			vendorKey: "cloudbeds",
			authType: "api_key",
			credentialSecret: "test://cloudbeds-ok",
			mode: "sandbox",
			propertyId: "property_1",
		})
		const workspace = buildChannelManagerMappingWorkspace({
			localCatalog: {
				products: [{ id: "product_1", label: "Hotel Sol · hotel", entityType: "product" }],
				variants: [
					{
						id: "variant_1",
						label: "Hotel Sol / Deluxe King",
						name: "Deluxe King",
						entityType: "variant",
						productId: "product_1",
						productName: "Hotel Sol",
					},
				],
				ratePlans: [
					{
						id: "rate_1",
						label: "Hotel Sol / Deluxe King / Mejor tarifa disponible",
						name: "Mejor tarifa disponible",
						entityType: "rate_plan",
						variantId: "variant_1",
						variantName: "Deluxe King",
						isDefault: true,
					},
				],
				taxes: [],
			},
			remoteCatalog,
			mappings: [],
		})

		expect(workspace.roomTypes.local[0].suggestion).toMatchObject({
			externalEntityId: "cb_room_deluxe",
			confidence: "high",
		})
		expect(workspace.ratePlans.local[0].suggestion).toMatchObject({
			externalEntityId: "cb_rate_deluxe_bar",
			confidence: "high",
		})
		expect(workspace.ratePlans.local[0].suggestion?.reason).toContain("misma habitación")
	})

	it("uses a visual review flow and keeps raw IDs behind an advanced disclosure", () => {
		const page = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)
		const wizard = read("src/pages/provider/settings/integrations/connect/channel-manager.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")

		expect(page).toContain("data-mapping-workspace")
		expect(page).toContain("data-mapping-tab")
		expect(page).toContain("data-apply-suggestions")
		expect(page).toContain("data-mapping-preview")
		expect(page).toContain("Vista previa")
		expect(page).toContain("Opción avanzada: usar un ID externo")
		expect(page.indexOf("data-manual-mapping")).toBeGreaterThan(page.indexOf("data-mapping-rows"))
		expect(wizard).toContain("providerSettingsIntegrationMapping(connection.id)")
		expect(connections).toContain("providerSettingsIntegrationConnection(params.connectionId)")
		expect(connections).not.toContain("providerSettingsIntegrationMapping(params.connectionId)")
	})

	it("protects remote reads and saves mapping batches transactionally", () => {
		const workspaceEndpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/mapping-workspace.ts"
		)
		const saveEndpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/mappings.ts"
		)
		const operations = read("src/lib/provider-integration-operations.ts")
		const domain = read("src/lib/provider-integrations.ts")

		expect(workspaceEndpoint).toContain("requireProviderIntegrationManager")
		expect(workspaceEndpoint).toContain("buildChannelManagerMappingWorkspace")
		expect(workspaceEndpoint).toContain('"Cache-Control": "private, no-store"')
		expect(saveEndpoint).toContain("requireProviderIntegrationManager")
		expect(saveEndpoint).toContain("upsertProviderIntegrationMappings")
		expect(operations).toContain("db.transaction")
		expect(operations).toContain("MAPPING_EXTERNAL_ALREADY_ASSIGNED")
		expect(domain).toContain("getProviderChannelManagerRemoteCatalog")
		expect(domain).toContain("ensureProviderIntegrationCredentialFresh")
	})
})
