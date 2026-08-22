/**
 * Local shells sometimes inherit a corrupted DATABASE_URL (spaces, missing `@`,
 * pasted command fragments). Dotenv will not override existing process.env keys,
 * so tests/migrations fail with `Invalid URL` even when `.env` is valid.
 *
 * Call `ensureCleanPostgresEnv()` before connecting, or import the vitest setup.
 */
import { config as loadDotenv } from "dotenv"

const RUNTIME_POSTGRES_URL_KEYS = [
	"DATABASE_URL",
	"DIRECT_URL",
	"SUPABASE_DB_POOLER_URL",
	"SUPABASE_DB_URL",
] as const

const TEST_POSTGRES_URL_KEYS = ["DATABASE_URL_TEST", "TEST_DATABASE_URL"] as const

export type TestDatabaseEnvironment = {
	enabled: boolean
	url: string | null
}

export function isValidPostgresConnectionUrl(value: string | undefined | null): boolean {
	const trimmed = String(value ?? "").trim()
	if (!trimmed) return false
	if (/\s/.test(trimmed)) return false
	try {
		const url = new URL(trimmed)
		if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return false
		if (!url.hostname) return false
		if (!url.username) return false
		return true
	} catch {
		return false
	}
}

/** Drop invalid Postgres URL env vars so dotenv can refill from `.env`. */
export function stripInvalidPostgresEnv(env: NodeJS.ProcessEnv = process.env): string[] {
	const stripped: string[] = []
	for (const key of [...RUNTIME_POSTGRES_URL_KEYS, ...TEST_POSTGRES_URL_KEYS]) {
		const current = env[key]
		if (current != null && current.trim().length > 0 && !isValidPostgresConnectionUrl(current)) {
			delete env[key]
			stripped.push(key)
		}
	}
	return stripped
}

function connectionFingerprint(value: string): string {
	const url = new URL(value)
	return `${url.protocol}//${url.username}@${url.hostname}:${url.port || "default"}${url.pathname}`
}

function isTestRuntime(env: NodeJS.ProcessEnv): boolean {
	return env.NODE_ENV === "test" || Boolean(env.VITEST)
}

function clearRuntimePostgresUrls(env: NodeJS.ProcessEnv) {
	for (const key of RUNTIME_POSTGRES_URL_KEYS) delete env[key]
}

/**
 * Makes database access opt-in for Vitest. A test URL must be explicit, marked
 * as safe, and different from every runtime URL inherited by the process.
 * Without it, DB-backed suites skip instead of inheriting an operational URL.
 */
export function ensureTestPostgresEnv(options?: {
	env?: NodeJS.ProcessEnv
	dotenvPath?: string
	testDotenvPath?: string
}): TestDatabaseEnvironment {
	const env = options?.env ?? process.env
	stripInvalidPostgresEnv(env)
	loadDotenv({ path: options?.dotenvPath, processEnv: env, override: false, quiet: true })
	loadDotenv({
		path: options?.testDotenvPath ?? ".env.test",
		processEnv: env,
		override: false,
		quiet: true,
	})
	const runtimeUrls = RUNTIME_POSTGRES_URL_KEYS.map((key) => env[key]).filter(
		(value): value is string => isValidPostgresConnectionUrl(value)
	)

	const configured = TEST_POSTGRES_URL_KEYS.map((key) => String(env[key] ?? "").trim()).find(
		isValidPostgresConnectionUrl
	)
	if (!configured) {
		clearRuntimePostgresUrls(env)
		delete env.FASTT_TEST_DATABASE_ACTIVE
		return { enabled: false, url: null }
	}
	if (env.FASTT_TEST_DATABASE !== "1") {
		throw new Error("TEST_DATABASE_ACKNOWLEDGEMENT_REQUIRED")
	}

	const testFingerprint = connectionFingerprint(configured)
	const sameAsRuntime = runtimeUrls.some(
		(runtimeUrl) => connectionFingerprint(runtimeUrl) === testFingerprint
	)
	if (sameAsRuntime) {
		throw new Error("TEST_DATABASE_MUST_DIFFER_FROM_RUNTIME_DATABASE")
	}

	clearRuntimePostgresUrls(env)
	env.DATABASE_URL = configured
	env.FASTT_TEST_DATABASE_ACTIVE = "1"
	return { enabled: true, url: configured }
}

export function isTestDatabaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return (
		isTestRuntime(env) &&
		env.FASTT_TEST_DATABASE_ACTIVE === "1" &&
		isValidPostgresConnectionUrl(env.DATABASE_URL)
	)
}

export function assertTestDatabaseAccess(env: NodeJS.ProcessEnv = process.env) {
	if (isTestRuntime(env) && !isTestDatabaseEnabled(env)) {
		throw new Error("TEST_DATABASE_NOT_CONFIGURED")
	}
}

/**
 * Strip invalid URL values, then load `.env` (and optional `.env.test`) without
 * overriding already-valid process env (CI secrets stay authoritative).
 */
export function ensureCleanPostgresEnv(options?: {
	env?: NodeJS.ProcessEnv
	dotenvPath?: string
	testDotenvPath?: string
}): { stripped: string[]; loaded: boolean } {
	const env = options?.env ?? process.env
	const stripped = stripInvalidPostgresEnv(env)
	const result = loadDotenv({
		path: options?.dotenvPath,
		processEnv: env,
		override: false,
		quiet: true,
	})
	loadDotenv({
		path: options?.testDotenvPath ?? ".env.test",
		processEnv: env,
		override: false,
		quiet: true,
	})
	// If something still invalid after load, strip again (do not keep junk).
	stripInvalidPostgresEnv(env)
	return { stripped, loaded: !result.error }
}
