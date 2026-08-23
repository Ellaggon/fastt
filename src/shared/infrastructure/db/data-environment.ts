import { createHash } from "node:crypto"

import { isValidPostgresConnectionUrl } from "./clean-db-env"
import { getFasttDataEnvironment } from "./runtime-environment"

export {
	FASTT_DATA_ENVIRONMENTS,
	getFasttDataEnvironment,
	type FasttDataEnvironment,
} from "./runtime-environment"

const DATABASE_URL_KEYS = [
	"DATABASE_URL",
	"DIRECT_URL",
	"SUPABASE_DB_POOLER_URL",
	"SUPABASE_DB_URL",
] as const

function value(env: NodeJS.ProcessEnv, key: string): string {
	return String(env[key] ?? "").trim()
}

function parseFingerprints(value: string): Set<string> {
	return new Set(
		value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
	)
}

/**
 * Hashes connection identity without retaining passwords or query parameters.
 *
 * Supabase pooler projects in one region can share a host, port and database
 * name. Their connection username includes the public project reference, so it
 * must participate in the identity to keep two projects distinguishable.
 * Operators can safely store this value in CI and local test configuration.
 */
export function databaseFingerprint(connectionUrl: string): string {
	if (!isValidPostgresConnectionUrl(connectionUrl)) {
		throw new Error("Cannot fingerprint an invalid PostgreSQL connection URL.")
	}
	const url = new URL(connectionUrl)
	const identity = `${url.protocol}//${decodeURIComponent(url.username)}@${url.hostname.toLowerCase()}:${url.port || "default"}${url.pathname}`
	return `dbfp_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`
}

export type IsolatedTestDatabase =
	| { configured: false }
	| { configured: true; runtimeUrl: string; directUrl: string | null; fingerprint: string }

/**
 * Prepares Vitest to use only explicitly named test URLs. Runtime URLs inherited
 * from a developer shell or .env are rejected so tests cannot silently touch an
 * operational database.
 */
export function prepareIsolatedTestDatabase(
	env: NodeJS.ProcessEnv = process.env
): IsolatedTestDatabase {
	if (getFasttDataEnvironment(env) !== "test") {
		throw new Error("Vitest may only run with FASTT_DATA_ENV=test.")
	}

	const runtimeUrl = value(env, "FASTT_TEST_DATABASE_URL")
	const directUrl = value(env, "FASTT_TEST_DIRECT_URL") || null
	const inheritedRuntimeUrl = DATABASE_URL_KEYS.map((key) => value(env, key)).find(Boolean)

	if (!runtimeUrl) {
		if (inheritedRuntimeUrl) {
			throw new Error(
				"Vitest refuses DATABASE_URL, DIRECT_URL, and SUPABASE_DB_POOLER_URL. Configure FASTT_TEST_DATABASE_URL instead."
			)
		}
		return { configured: false }
	}

	if (!isValidPostgresConnectionUrl(runtimeUrl)) {
		throw new Error("FASTT_TEST_DATABASE_URL must be a valid PostgreSQL URL.")
	}
	if (directUrl && !isValidPostgresConnectionUrl(directUrl)) {
		throw new Error("FASTT_TEST_DIRECT_URL must be a valid PostgreSQL URL.")
	}

	const fingerprint = databaseFingerprint(runtimeUrl)
	const expectedFingerprint = value(env, "FASTT_TEST_DATABASE_FINGERPRINT")
	if (!expectedFingerprint) {
		throw new Error(
			"FASTT_TEST_DATABASE_FINGERPRINT is required when a test database is configured."
		)
	}
	if (expectedFingerprint !== fingerprint) {
		throw new Error(
			`FASTT_TEST_DATABASE_FINGERPRINT does not match FASTT_TEST_DATABASE_URL (received ${fingerprint}).`
		)
	}

	const prohibited = parseFingerprints(value(env, "FASTT_PRODUCTION_DATABASE_FINGERPRINTS"))
	if (prohibited.size === 0) {
		throw new Error(
			"FASTT_PRODUCTION_DATABASE_FINGERPRINTS is required when a test database is configured."
		)
	}
	if (prohibited.has(fingerprint)) {
		throw new Error("Vitest refused a database whose fingerprint is registered as production.")
	}

	for (const key of DATABASE_URL_KEYS) delete env[key]
	env.DATABASE_URL = runtimeUrl
	if (directUrl) env.DIRECT_URL = directUrl
	return { configured: true, runtimeUrl, directUrl, fingerprint }
}

export function hasIsolatedTestDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
	return prepareIsolatedTestDatabase(env).configured
}
