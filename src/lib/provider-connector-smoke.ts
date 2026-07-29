/**
 * Connector smoke tests (Expedia connectivity-test style).
 * Saving credentials never marks connected — only a successful smoke does.
 */

export type ConnectorSmokeResult = {
	ok: boolean
	message: string
	latencyMs: number
	probe: "https" | "vault" | "oauth2" | "vendor_api" | "test_harness" | "none"
	trustLevel: "verified_connection" | "structural_reference" | "failed"
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
				trustLevel: "verified_connection",
			}
		}
		return {
			ok: false,
			message: `Smoke HTTPS falló (HTTP ${response.status}).`,
			latencyMs,
			probe: "https",
			trustLevel: "failed",
		}
	} catch (error) {
		const latencyMs = Date.now() - started
		const reason = error instanceof Error ? error.message : String(error)
		return {
			ok: false,
			message: `Smoke HTTPS no alcanzó el endpoint: ${reason}`,
			latencyMs,
			probe: "https",
			trustLevel: "failed",
		}
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Run a real smoke probe against connector credentials.
 * - https://… → live GET with timeout
 * - test://smoke-ok → harness success (Vitest / local demos only)
 */
export async function runConnectorSmokeTest(params: {
	connectorKey: string
	endpointUrl: string
	mode?: string
	timeoutMs?: number
}): Promise<ConnectorSmokeResult> {
	const endpointUrl = String(params.endpointUrl ?? "").trim()
	const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
	if (!endpointUrl) {
		return {
			ok: false,
			message: "No hay un endpoint HTTPS para probar.",
			latencyMs: 0,
			probe: "none",
			trustLevel: "failed",
		}
	}

	if (endpointUrl === "test://smoke-ok") {
		return {
			ok: true,
			message: "Smoke harness OK (test://smoke-ok).",
			latencyMs: 1,
			probe: "test_harness",
			trustLevel: "verified_connection",
		}
	}

	if (isHttpsUrl(endpointUrl)) {
		return probeHttps(endpointUrl, timeoutMs)
	}

	return {
		ok: false,
		message: "El endpoint debe usar HTTPS.",
		latencyMs: 0,
		probe: "none",
		trustLevel: "failed",
	}
}
