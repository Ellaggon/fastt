import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	normalizeProviderIntegrationMappingInput,
	providerIntegrationMappingLocalEntityTypeByMappingType,
} from "@/lib/provider-integration-operations"

const validInput = {
	mappingType: "room_type",
	localEntityType: "variant",
	localEntityId: "variant_1",
	externalEntityType: "room_type",
	externalEntityId: "remote_room_1",
} as const

describe("provider integration mapping contract", () => {
	it("keeps a single canonical local entity type for every mapping type", () => {
		expect(providerIntegrationMappingLocalEntityTypeByMappingType).toEqual({
			property: "product",
			room_type: "variant",
			rate_plan: "rate_plan",
			tax: "tax",
			account: "provider",
			calendar: "calendar",
		})
	})

	it("rejects a syntactically valid but semantically mismatched local type", () => {
		expect(() =>
			normalizeProviderIntegrationMappingInput({ ...validInput, localEntityType: "product" })
		).toThrow("MAPPING_LOCAL_TYPE_MISMATCH")
	})

	it("normalizes only canonical mapping pairs", () => {
		expect(normalizeProviderIntegrationMappingInput(validInput)).toMatchObject(validInput)
	})

	it("enforces the contract in PostgreSQL for fresh installations and runtime writes", () => {
		const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		const integrity = readFileSync(
			"src/shared/infrastructure/db/schema/postgres-integrity.sql",
			"utf8"
		)
		const baseline = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")

		expect(schema).toContain("ProviderIntegrationMapping_local_entity_type_check")
		expect(schema).toContain("ProviderIntegrationMapping_type_local_entity_pair_check")
		expect(schema).toContain('fixtureProductId: txtOpt("fixtureProductId").references')
		expect(integrity).toContain("fastt_validate_provider_integration_mapping_local_entity")
		expect(integrity).toContain("fastt_validate_provider_integration_certification_fixture")
		expect(integrity).toContain("fastt_prevent_certification_fixture_product_drift")
		expect(integrity).toContain("fastt_prevent_certification_provider_purpose_drift")
		expect(baseline).toContain("ProviderIntegrationCertification_fixtureProductId_fk")
		expect(baseline).toContain("trg_ProviderIntegrationMapping_local_entity")
		expect(baseline).toContain("trg_ProviderIntegrationCertification_fixture")
	})
})
