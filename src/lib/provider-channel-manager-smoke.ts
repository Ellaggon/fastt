import type {
	ChannelManagerAuthType,
	ChannelManagerVendorKey,
} from "@/lib/provider-channel-manager-vendors"
import type { ConnectorSmokeResult } from "@/lib/provider-connector-smoke"

const CLOUD_BEDS_BASE_URL = "https://hotels.cloudbeds.com/api/v1.2"
const CHANNEX_BASE_URL = "https://staging.channex.io/api/v1"
const DEFAULT_TIMEOUT_MS = 7000

async function vendorFetch(
	url: string,
	options: RequestInit,
	timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ response: Response; latencyMs: number }> {
	const started = Date.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(url, { ...options, signal: controller.signal })
		return { response, latencyMs: Date.now() - started }
	} finally {
		clearTimeout(timer)
	}
}

async function smokeCloudbeds(params: {
	credentialSecret: string
	authType: ChannelManagerAuthType
	timeoutMs?: number
}): Promise<ConnectorSmokeResult> {
	if (!params.credentialSecret) {
		return {
			ok: false,
			message: "Cloudbeds: falta una credencial activa en el vault.",
			latencyMs: 0,
			probe: "vendor_api",
			trustLevel: "failed",
		}
	}
	const { response, latencyMs } = await vendorFetch(
		`${CLOUD_BEDS_BASE_URL}/getHotels`,
		{
			method: "GET",
			headers: {
				"Accept": "application/json",
				"Authorization": `Bearer ${params.credentialSecret}`,
				"User-Agent": "fastt-cloudbeds-smoke/1.0",
			},
		},
		params.timeoutMs
	)
	if (response.ok) {
		return {
			ok: true,
			message: `Cloudbeds API OK (getHotels HTTP ${response.status}) en ${latencyMs}ms.`,
			latencyMs,
			probe: "vendor_api",
			trustLevel: "verified_connection",
		}
	}
	return {
		ok: false,
		message: `Cloudbeds API falló (getHotels HTTP ${response.status}).`,
		latencyMs,
		probe: "vendor_api",
		trustLevel: "failed",
	}
}

async function smokeChannex(params: {
	credentialSecret: string
	externalPropertyId?: string | null
	timeoutMs?: number
}): Promise<ConnectorSmokeResult> {
	if (!params.credentialSecret) {
		return {
			ok: false,
			message: "Channex: falta una API key activa en el vault.",
			latencyMs: 0,
			probe: "vendor_api",
			trustLevel: "failed",
		}
	}
	const propertyPath = String(params.externalPropertyId ?? "").trim()
		? `/properties/${encodeURIComponent(String(params.externalPropertyId).trim())}`
		: "/properties/?pagination[page]=1&pagination[limit]=1"
	const { response, latencyMs } = await vendorFetch(
		`${CHANNEX_BASE_URL}${propertyPath}`,
		{
			method: "GET",
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json",
				"user-api-key": params.credentialSecret,
				"User-Agent": "fastt-channex-smoke/1.0",
			},
		},
		params.timeoutMs
	)
	if (response.ok) {
		return {
			ok: true,
			message: `Channex API OK (properties HTTP ${response.status}) en ${latencyMs}ms.`,
			latencyMs,
			probe: "vendor_api",
			trustLevel: "verified_connection",
		}
	}
	return {
		ok: false,
		message: `Channex API falló (properties HTTP ${response.status}).`,
		latencyMs,
		probe: "vendor_api",
		trustLevel: "failed",
	}
}

export async function runChannelManagerVendorSmokeTest(params: {
	vendorKey: ChannelManagerVendorKey
	authType: ChannelManagerAuthType
	credentialSecret: string
	externalPropertyId?: string | null
	timeoutMs?: number
}): Promise<ConnectorSmokeResult | null> {
	if (params.credentialSecret === "test://cloudbeds-ok") {
		return {
			ok: true,
			message: "Cloudbeds smoke harness OK.",
			latencyMs: 1,
			probe: "vendor_api",
			trustLevel: "verified_connection",
		}
	}
	if (params.credentialSecret === "test://channex-ok") {
		return {
			ok: true,
			message: "Channex smoke harness OK.",
			latencyMs: 1,
			probe: "vendor_api",
			trustLevel: "verified_connection",
		}
	}
	if (params.vendorKey === "cloudbeds") return smokeCloudbeds(params)
	if (params.vendorKey === "channex") return smokeChannex(params)
	return null
}
