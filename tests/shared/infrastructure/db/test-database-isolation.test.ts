import { describe, expect, it } from "vitest"

import {
	assertTestDatabaseAccess,
	ensureTestPostgresEnv,
	isTestDatabaseEnabled,
} from "@/shared/infrastructure/db/clean-db-env"

const runtimeUrl = "postgresql://runtime:secret@runtime-db.example.com:5432/fastt"
const testUrl = "postgresql://tests:secret@test-db.example.com:5432/fastt_test"
const missingFile = "/tmp/fastt-no-test-dotenv"

describe("test database isolation", () => {
	it("removes inherited runtime URLs when no dedicated test database is configured", () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: "test", DATABASE_URL: runtimeUrl }

		const result = ensureTestPostgresEnv({
			env,
			dotenvPath: missingFile,
			testDotenvPath: missingFile,
		})

		expect(result).toEqual({ enabled: false, url: null })
		expect(env.DATABASE_URL).toBeUndefined()
		expect(isTestDatabaseEnabled(env)).toBe(false)
		expect(() => assertTestDatabaseAccess(env)).toThrow("TEST_DATABASE_NOT_CONFIGURED")
	})

	it("rejects a test URL that points to the inherited runtime database", () => {
		const env: NodeJS.ProcessEnv = {
			NODE_ENV: "test",
			DATABASE_URL: runtimeUrl,
			DATABASE_URL_TEST: runtimeUrl,
			FASTT_TEST_DATABASE: "1",
		}

		expect(() =>
			ensureTestPostgresEnv({ env, dotenvPath: missingFile, testDotenvPath: missingFile })
		).toThrow("TEST_DATABASE_MUST_DIFFER_FROM_RUNTIME_DATABASE")
	})

	it("activates only an explicit acknowledged test URL", () => {
		const env: NodeJS.ProcessEnv = {
			NODE_ENV: "test",
			DATABASE_URL: runtimeUrl,
			DATABASE_URL_TEST: testUrl,
			FASTT_TEST_DATABASE: "1",
		}

		const result = ensureTestPostgresEnv({
			env,
			dotenvPath: missingFile,
			testDotenvPath: missingFile,
		})

		expect(result).toEqual({ enabled: true, url: testUrl })
		expect(env.DATABASE_URL).toBe(testUrl)
		expect(env.DIRECT_URL).toBeUndefined()
		expect(env.FASTT_TEST_DATABASE_ACTIVE).toBe("1")
		expect(isTestDatabaseEnabled(env)).toBe(true)
		expect(() => assertTestDatabaseAccess(env)).not.toThrow()
	})

	it("requires an explicit acknowledgement before enabling DB-backed tests", () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: "test", DATABASE_URL_TEST: testUrl }

		expect(() =>
			ensureTestPostgresEnv({ env, dotenvPath: missingFile, testDotenvPath: missingFile })
		).toThrow("TEST_DATABASE_ACKNOWLEDGEMENT_REQUIRED")
	})
})
