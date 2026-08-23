export const FASTT_DATA_ENVIRONMENTS = ["development", "test", "staging", "production"] as const

export type FasttDataEnvironment = (typeof FASTT_DATA_ENVIRONMENTS)[number]

export function getFasttDataEnvironment(
	env: NodeJS.ProcessEnv = process.env
): FasttDataEnvironment {
	const configured = String(env.FASTT_DATA_ENV ?? "").trim()
	if (!configured) {
		throw new Error(
			"FASTT_DATA_ENV is required. Use development, test, staging, or production before connecting to Fastt data."
		)
	}
	if (!FASTT_DATA_ENVIRONMENTS.includes(configured as FasttDataEnvironment)) {
		throw new Error(
			`FASTT_DATA_ENV must be one of ${FASTT_DATA_ENVIRONMENTS.join(", ")}; received ${configured}.`
		)
	}
	return configured as FasttDataEnvironment
}
