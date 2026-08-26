/**
 * Local shells sometimes inherit a corrupted DATABASE_URL (spaces, missing `@`,
 * pasted command fragments). Dotenv will not override existing process.env keys,
 * so tests/migrations fail with `Invalid URL` even when `.env` is valid.
 *
 * Call `ensureCleanPostgresEnv()` before connecting, or import the vitest setup.
 */
import { config as loadDotenv } from "dotenv"

import { getFasttDataEnvironment } from "./runtime-environment"

const POSTGRES_URL_KEYS = [
	"DATABASE_URL",
	"DIRECT_URL",
	"SUPABASE_DB_POOLER_URL",
	"SUPABASE_DB_URL",
] as const

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
	for (const key of POSTGRES_URL_KEYS) {
		const current = env[key]
		if (current != null && current.trim().length > 0 && !isValidPostgresConnectionUrl(current)) {
			delete env[key]
			stripped.push(key)
		}
	}
	return stripped
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
	})
	loadDotenv({
		path: options?.testDotenvPath ?? ".env.test",
		processEnv: env,
		override: false,
	})
	// If something still invalid after load, strip again (do not keep junk).
	stripInvalidPostgresEnv(env)
	getFasttDataEnvironment(env)
	return { stripped, loaded: !result.error }
}
