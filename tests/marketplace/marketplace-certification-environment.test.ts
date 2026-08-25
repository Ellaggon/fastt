import { describe, expect, it } from "vitest"

import { databaseFingerprint } from "@/shared/infrastructure/db/data-environment"
import { prepareMarketplaceCertificationEnvironment } from "@/scripts/marketplace-certification-environment"

const isolatedUrl = "postgresql://postgres:postgres@localhost:5432/fastt_certification"

function isolatedEnvironment(): NodeJS.ProcessEnv {
	return {
		FASTT_DATA_ENV: "test",
		FASTT_TEST_DATABASE_URL: isolatedUrl,
		FASTT_TEST_DIRECT_URL: isolatedUrl,
		FASTT_TEST_DATABASE_FINGERPRINT: databaseFingerprint(isolatedUrl),
		FASTT_PRODUCTION_DATABASE_FINGERPRINTS: "dbfp_known_production",
	}
}

describe("marketplace commercial certification environment", () => {
	it("refuses every write outside an explicitly fingerprinted test database", () => {
		for (const FASTT_DATA_ENV of ["development", "staging", "production"]) {
			expect(() =>
				prepareMarketplaceCertificationEnvironment({
					apply: true,
					confirmed: true,
					env: { FASTT_DATA_ENV },
				})
			).toThrow("MARKETPLACE_CERTIFICATION_APPLY_REQUIRES_ISOLATED_TEST_ENV")
		}
	})

	it("refuses an inherited or production-fingerprinted database", () => {
		expect(() =>
			prepareMarketplaceCertificationEnvironment({
				apply: true,
				confirmed: true,
				env: { FASTT_DATA_ENV: "test", DATABASE_URL: isolatedUrl },
			})
		).toThrow("Vitest refuses DATABASE_URL")

		const env = isolatedEnvironment()
		env.FASTT_PRODUCTION_DATABASE_FINGERPRINTS = databaseFingerprint(isolatedUrl)
		expect(() =>
			prepareMarketplaceCertificationEnvironment({ apply: true, confirmed: true, env })
		).toThrow("registered as production")
	})

	it("prepares the isolated URL only after explicit confirmation", () => {
		expect(() =>
			prepareMarketplaceCertificationEnvironment({
				apply: true,
				confirmed: false,
				env: isolatedEnvironment(),
			})
		).toThrow("MARKETPLACE_CERTIFICATION_CONFIRMATION_REQUIRED")

		const env = isolatedEnvironment()
		const result = prepareMarketplaceCertificationEnvironment({
			apply: true,
			confirmed: true,
			env,
		})
		expect(result.databaseConfigured).toBe(true)
		expect(env.DATABASE_URL).toBe(isolatedUrl)
	})
})
