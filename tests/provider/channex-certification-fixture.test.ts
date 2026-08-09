import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Channex certification fixture bootstrap", () => {
	it("uses a dedicated non-commercial provider and never borrows local QA configuration", () => {
		const source = readFileSync("src/scripts/bootstrap-channex-certification-fixture.ts", "utf8")

		expect(source).toContain('const PROVIDER_ID = "fastt-channex-certification-provider-v1"')
		expect(source).toContain('accountPurpose: "integration_certification"')
		expect(source).not.toContain("LOCAL_QA_PROVIDER_ID")
		expect(source).not.toContain('mode: "production"')
	})

	it("prepares the certification dataset, encrypted connection and auditable ready session", () => {
		const source = readFileSync("src/scripts/bootstrap-channex-certification-fixture.ts", "utf8")

		expect(source).toContain("const DAYS = 500")
		expect(source).toContain("const rooms = [")
		expect(source).toContain("const ratePlans = [")
		expect(source).toContain("credentialSecret: apiKey")
		expect(source).toContain("decryptProviderIntegrationSecret")
		expect(source).toContain('status: "ready"')
		expect(source).toContain("writeProviderAuditLog")
		expect(source).toContain("canRunIntegrationCertification: true")
		expect(source).toContain("configuredPropertyId || existing?.externalPropertyId || null")
		expect(source).toContain("CHANNEX_CERTIFICATION_REMOTE_ROOM_COVERAGE")
		expect(source).toContain("CHANNEX_CERTIFICATION_REMOTE_RATE_PLAN_COVERAGE")
	})

	it("only applies deterministic mappings inside the isolated fixture", () => {
		const source = readFileSync("src/scripts/bootstrap-channex-certification-fixture.ts", "utf8")

		expect(source).toContain("function exactRemoteMatch")
		expect(source).toContain("CHANNEX_CERTIFICATION_ROOM_MAPPING_AMBIGUOUS")
		expect(source).toContain("CHANNEX_CERTIFICATION_RATE_MAPPING_AMBIGUOUS")
		expect(source).toContain("upsertProviderIntegrationMappings")
		expect(source).toContain('source: "certification_fixture"')
	})
})
