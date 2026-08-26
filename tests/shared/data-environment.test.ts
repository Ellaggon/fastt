import { describe, expect, it } from "vitest"

import {
	databaseFingerprint,
	getFasttDataEnvironment,
	prepareIsolatedTestDatabase,
} from "@/shared/infrastructure/db/data-environment"

const testUrl = "postgresql://tester:secret@db.test.fastt.internal:5432/fastt_test?sslmode=require"
const productionUrl = "postgresql://operator:secret@db.prod.fastt.internal:5432/fastt"

describe("data environment isolation", () => {
	it("prefers an explicit Fastt data environment", () => {
		expect(getFasttDataEnvironment({ FASTT_DATA_ENV: "staging", VERCEL_ENV: "production" })).toBe(
			"staging"
		)
		expect(() => getFasttDataEnvironment({ FASTT_DATA_ENV: "preview" })).toThrow(
			"FASTT_DATA_ENV must be one of"
		)
	})

	it("derives local and Vercel classification when FASTT_DATA_ENV is unset", () => {
		expect(getFasttDataEnvironment({ NODE_ENV: "development" })).toBe("development")
		expect(getFasttDataEnvironment({})).toBe("development")
		expect(getFasttDataEnvironment({ VERCEL_ENV: "production" })).toBe("production")
		expect(getFasttDataEnvironment({ VERCEL_ENV: "preview" })).toBe("staging")
		expect(getFasttDataEnvironment({ VERCEL_ENV: "development" })).toBe("development")
	})

	it("records a derived classification so later reads in the same process stay stable", () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: "development" }
		expect(getFasttDataEnvironment(env)).toBe("development")
		expect(env.FASTT_DATA_ENV).toBe("development")
	})

	it("refuses unlabeled test and production processes", () => {
		expect(() => getFasttDataEnvironment({ NODE_ENV: "test" })).toThrow("FASTT_DATA_ENV is required")
		expect(() => getFasttDataEnvironment({ VITEST: "true" })).toThrow("FASTT_DATA_ENV is required")
		expect(() => getFasttDataEnvironment({ NODE_ENV: "production" })).toThrow(
			"FASTT_DATA_ENV is required"
		)
	})

	it("fingerprints connection identity without passwords or query parameters", () => {
		expect(databaseFingerprint(testUrl)).toMatch(/^dbfp_[a-f0-9]{20}$/)
		expect(databaseFingerprint(testUrl)).toBe(
			databaseFingerprint("postgresql://tester:another@db.test.fastt.internal:5432/fastt_test")
		)
	})

	it("distinguishes Supabase projects that share a regional pooler", () => {
		const backup = "postgresql://postgres.backup_ref:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
		const operational = "postgresql://postgres.operational_ref:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
		expect(databaseFingerprint(backup)).not.toBe(databaseFingerprint(operational))
	})

	it("rejects inherited runtime URLs and production fingerprints", () => {
		expect(() =>
			prepareIsolatedTestDatabase({ FASTT_DATA_ENV: "test", DATABASE_URL: productionUrl })
		).toThrow("refuses DATABASE_URL")

		const productionFingerprint = databaseFingerprint(productionUrl)
		expect(() =>
			prepareIsolatedTestDatabase({
				FASTT_DATA_ENV: "test",
				FASTT_TEST_DATABASE_URL: productionUrl,
				FASTT_TEST_DATABASE_FINGERPRINT: productionFingerprint,
				FASTT_PRODUCTION_DATABASE_FINGERPRINTS: productionFingerprint,
			})
		).toThrow("registered as production")
	})

	it("maps only an explicitly fingerprinted test database into runtime variables", () => {
		const env: NodeJS.ProcessEnv = {
			FASTT_DATA_ENV: "test",
			FASTT_TEST_DATABASE_URL: testUrl,
			FASTT_TEST_DATABASE_FINGERPRINT: databaseFingerprint(testUrl),
			FASTT_PRODUCTION_DATABASE_FINGERPRINTS: databaseFingerprint(productionUrl),
		}
		expect(prepareIsolatedTestDatabase(env)).toMatchObject({ configured: true })
		expect(env.DATABASE_URL).toBe(testUrl)
	})
})
