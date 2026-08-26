export const FASTT_DATA_ENVIRONMENTS = ["development", "test", "staging", "production"] as const

export type FasttDataEnvironment = (typeof FASTT_DATA_ENVIRONMENTS)[number]

function readEnv(env: NodeJS.ProcessEnv, key: string): string {
	return String(env[key] ?? "").trim()
}

function isFasttDataEnvironment(value: string): value is FasttDataEnvironment {
	return FASTT_DATA_ENVIRONMENTS.includes(value as FasttDataEnvironment)
}

/**
 * Classify the data plane when FASTT_DATA_ENV is unset.
 *
 * Explicit FASTT_DATA_ENV always wins. Otherwise the host already classified
 * the process: Vercel via VERCEL_ENV, local `astro dev` via NODE_ENV=development.
 * Test and unlabeled production stay fail-closed so a suite or a Node server
 * cannot silently attach to operational data.
 */
export function deriveFasttDataEnvironment(
	env: NodeJS.ProcessEnv = process.env
): FasttDataEnvironment | null {
	const vercelEnv = readEnv(env, "VERCEL_ENV")
	if (vercelEnv === "production") return "production"
	if (vercelEnv === "preview") return "staging"
	if (vercelEnv === "development") return "development"

	const nodeEnv = readEnv(env, "NODE_ENV")
	if (readEnv(env, "VITEST") === "true" || nodeEnv === "test") return null
	if (nodeEnv === "production") return null
	if (nodeEnv === "development" || nodeEnv === "") return "development"
	return null
}

export function getFasttDataEnvironment(
	env: NodeJS.ProcessEnv = process.env
): FasttDataEnvironment {
	const configured = readEnv(env, "FASTT_DATA_ENV")
	if (configured) {
		if (!isFasttDataEnvironment(configured)) {
			throw new Error(
				`FASTT_DATA_ENV must be one of ${FASTT_DATA_ENVIRONMENTS.join(", ")}; received ${configured}.`
			)
		}
		return configured
	}

	const derived = deriveFasttDataEnvironment(env)
	if (!derived) {
		throw new Error(
			"FASTT_DATA_ENV is required. Use development, test, staging, or production before connecting to Fastt data."
		)
	}
	env.FASTT_DATA_ENV = derived
	return derived
}
