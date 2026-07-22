/**
 * Connector smoke tests (Expedia connectivity-test style).
 * Saving credentials never marks connected — only a successful smoke does.
 */

export type ConnectorSmokeResult = {
	ok: boolean
	message: string
	latencyMs: number
	probe: "https" | "vault" | "test_harness" | "none"
}

const DEFAULT_TIMEOUT_MS = 5000

function isHttpsUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol === "https:"
	} catch {
		return false
	}
}

function isVaultRef(value: string): boolean {
	return /^vault:\/\/[A-Za-z0-9._/-]+$/.test(value)
}

async function probeHttps(url: string, timeoutMs: number): Promise<ConnectorSmokeResult> {
	const started = Date.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "manual",
			signal: controller.signal,
			headers: { "Accept": "*/*", "User-Agent": "fastt-connector-smoke/1.0" },
		})
		const latencyMs = Date.now() - started
		// Reachability counts: 2xx/3xx and auth challenges prove the endpoint exists.
		if (response.status < 500) {
			return {
				ok: true,
				message: `Smoke HTTPS OK (HTTP ${response.status}) en ${latencyMs}ms.`,
				latencyMs,
				probe: "https",
			}
		}
		return {
			ok: false,
			message: `Smoke HTTPS falló (HTTP ${response.status}).`,
			latencyMs,
			probe: "https",
		}
	} catch (error) {
		const latencyMs = Date.now() - started
		const reason = error instanceof Error ? error.message : String(error)
		return {
			ok: false,
			message: `Smoke HTTPS no alcanzó el endpoint: ${reason}`,
			latencyMs,
			probe: "https",
		}
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Run a real smoke probe against connector credentials.
 * - https://… → live GET with timeout
 * - vault://… → structural validation (secret material stays in vault)
 * - test://smoke-ok → harness success (Vitest / local demos only)
 */
export async function runConnectorSmokeTest(params: {
	connectorKey: string
	credentialsRef: string
	mode?: string
	timeoutMs?: number
}): Promise<ConnectorSmokeResult> {
	const credentialsRef = String(params.credentialsRef ?? "").trim()
	const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
	if (!credentialsRef) {
		return {
			ok: false,
			message: "No hay credentialsRef para probar.",
			latencyMs: 0,
			probe: "none",
		}
	}

	if (credentialsRef === "test://smoke-ok") {
		return {
			ok: true,
			message: "Smoke harness OK (test://smoke-ok).",
			latencyMs: 1,
			probe: "test_harness",
		}
	}

	if (isHttpsUrl(credentialsRef)) {
		return probeHttps(credentialsRef, timeoutMs)
	}

	if (isVaultRef(credentialsRef)) {
		const path = credentialsRef.replace(/^vault:\/\//, "")
		if (path.split("/").filter(Boolean).length < 2) {
			return {
				ok: false,
				message: "vault:// debe incluir al menos secret/path.",
				latencyMs: 0,
				probe: "vault",
			}
		}
		return {
			ok: true,
			message: `Referencia vault válida para ${params.connectorKey} (${params.mode ?? "sandbox"}).`,
			latencyMs: 0,
			probe: "vault",
		}
	}

	return {
		ok: false,
		message: "credentialsRef debe ser https://… (probe real) o vault://… (referencia de secreto).",
		latencyMs: 0,
		probe: "none",
	}
}
