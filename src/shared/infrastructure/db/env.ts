import {
	assertTestDatabaseAccess,
	isValidPostgresConnectionUrl,
} from "@/shared/infrastructure/db/clean-db-env"

export type PostgresConnectionMode = "runtime" | "direct"

export type PostgresDatabaseEnv = {
	runtimeUrl: string | null
	directUrl: string | null
	poolerUrl: string | null
}

function clean(value: string | undefined): string | null {
	const trimmed = String(value ?? "").trim()
	if (!trimmed) return null
	// Reject corrupted shell inheritances (spaces / unparseable) so callers fail
	// clearly instead of `new URL` / postgres throwing Invalid URL mid-suite.
	if (!isValidPostgresConnectionUrl(trimmed)) return null
	return trimmed
}

export function readPostgresDatabaseEnv(env: NodeJS.ProcessEnv = process.env): PostgresDatabaseEnv {
	const databaseUrl = clean(env.DATABASE_URL)
	const poolerUrl = clean(env.SUPABASE_DB_POOLER_URL)
	const directUrl = clean(env.DIRECT_URL)

	return {
		runtimeUrl: poolerUrl ?? databaseUrl,
		poolerUrl,
		directUrl,
	}
}

export function getPostgresConnectionUrl(
	mode: PostgresConnectionMode = "runtime",
	env: NodeJS.ProcessEnv = process.env
): string {
	assertTestDatabaseAccess(env)
	const cfg = readPostgresDatabaseEnv(env)
	const url = mode === "direct" ? (cfg.directUrl ?? cfg.runtimeUrl) : cfg.runtimeUrl
	if (!url) {
		const expected =
			mode === "direct"
				? "DIRECT_URL or SUPABASE_DB_POOLER_URL/DATABASE_URL"
				: "SUPABASE_DB_POOLER_URL or DATABASE_URL"
		throw new Error(`Postgres database is not configured. Expected ${expected}.`)
	}
	return url
}
