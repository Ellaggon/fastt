import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	assertProviderIntegrationEnvironmentAllowed,
	normalizeProviderAccountPurpose,
	providerAccountPurposes,
} from "@/lib/provider-integration-certification"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

describe("provider integration certification boundary", () => {
	it("has an explicit, closed set of provider account purposes", () => {
		expect(providerAccountPurposes).toEqual([
			"commercial",
			"internal_qa",
			"integration_certification",
		])
		expect(normalizeProviderAccountPurpose("unknown-purpose")).toBe("commercial")
	})

	it("never lets a certification tenant target production", () => {
		expect(() =>
			assertProviderIntegrationEnvironmentAllowed({
				accountPurpose: "integration_certification",
				mode: "production",
			})
		).toThrow("CERTIFICATION_PROVIDER_PRODUCTION_FORBIDDEN")

		expect(() =>
			assertProviderIntegrationEnvironmentAllowed({
				accountPurpose: "integration_certification",
				mode: "sandbox",
			})
		).not.toThrow()
	})

	it("requires a separately granted certification permission", () => {
		expect(resolveProviderPermissions({ role: "owner" }).canRunIntegrationCertification).toBe(false)
		expect(
			resolveProviderPermissions({
				role: "owner",
				permissionsJson: { canRunIntegrationCertification: true },
			}).canRunIntegrationCertification
		).toBe(true)
	})

	it("persists certification evidence and checks it in the shared execution boundary", () => {
		const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		const operations = readFileSync("src/lib/provider-integration-operations.ts", "utf8")
		const policy = readFileSync("src/lib/provider-integration-certification.ts", "utf8")
		const integrations = readFileSync("src/lib/provider-integrations.ts", "utf8")
		const initialAri = readFileSync(
			"src/lib/channel-manager/channel-manager-initial-ari.ts",
			"utf8"
		)

		expect(schema).toContain('"ProviderIntegrationCertification"')
		expect(schema).toContain('certificationId: txtOpt("certificationId")')
		expect(operations).toContain("assertProviderIntegrationCertificationRunLink")
		expect(policy).toContain("CERTIFICATION_SANDBOX_CONNECTION_REQUIRED")
		expect(policy).toContain("CERTIFICATION_VENDOR_MISMATCH")
		expect(integrations).toContain("assertProviderIntegrationModeAllowed")
		expect(initialAri).toContain("INTEGRATION_CERTIFICATION_ID_REQUIRED")
		expect(initialAri).toContain("assertProviderIntegrationCertificationExecution")
	})

	it("keeps the database baseline and migration aligned with the boundary", () => {
		const baseline = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")
		const migration = readFileSync(
			"db/migrations/2026-08-21_provider_integration_certification_boundary.sql",
			"utf8"
		)

		for (const source of [baseline, migration]) {
			expect(source).toContain("ProviderIntegrationCertification")
			expect(source).toContain("accountPurpose")
			expect(source).toContain("certificationId")
		}
	})

	it("uses the guarded Fastt worker command for a real certification run", () => {
		const script = readFileSync("src/scripts/run-channex-certification-full-sync.ts", "utf8")

		expect(script).toContain("CHANNEX_CERTIFICATION_EXECUTE_TRUE_REQUIRED")
		expect(script).toContain("enqueueProviderInitialAriSync")
		expect(script).toContain("runScheduledProviderIntegrationSync")
		expect(script).toContain("CERTIFICATION_ARI_REQUEST_COUNT_INVALID")
		expect(script).toContain("summary.execution.certificationId !== CERTIFICATION_ID")
	})
})
