import type {
	ChannelManagerAuthType,
	ChannelManagerVendorKey,
} from "@/lib/provider-channel-manager-vendors"
import type { ConnectorSmokeResult } from "@/lib/provider-connector-smoke"
import { createChannelManagerAdapter } from "@/lib/channel-manager/channel-manager-adapter-factory"
import { ChannelManagerAdapterError } from "@/lib/channel-manager/channel-manager-adapter"
import {
	assertProviderIntegrationTestCredentialAllowed,
	isSyntheticProviderIntegrationCredential,
} from "@/lib/provider-integration-test-harness"

const CLOUD_BEDS_BASE_URL = "https://hotels.cloudbeds.com/api/v1.2"
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

export async function runChannelManagerVendorSmokeTest(params: {
	vendorKey: ChannelManagerVendorKey
	authType: ChannelManagerAuthType
	credentialSecret: string
	externalPropertyId?: string | null
	mode: "sandbox" | "production"
	timeoutMs?: number
}): Promise<ConnectorSmokeResult | null> {
	if (isSyntheticProviderIntegrationCredential(params.credentialSecret)) {
		assertProviderIntegrationTestCredentialAllowed(params.credentialSecret, { mode: params.mode })
	}
	if (params.vendorKey === "channex") {
		if (!params.credentialSecret) {
			return {
				ok: false,
				message: "Channex: falta una API key activa en el vault.",
				latencyMs: 0,
				probe: "vendor_api",
				trustLevel: "failed",
			}
		}
		const adapter = createChannelManagerAdapter({
			vendorKey: params.vendorKey,
			credentialSecret: params.credentialSecret,
			mode: params.mode,
			timeoutMs: params.timeoutMs,
		})
		try {
			const access = await adapter!.testAccess({ propertyId: params.externalPropertyId })
			return {
				ok: access.ok,
				message: access.message,
				latencyMs: access.latencyMs,
				probe: access.requestIds[0] === "test" ? "test_harness" : "vendor_api",
				trustLevel: access.ok ? "verified_connection" : "failed",
			}
		} catch (error) {
			const message =
				error instanceof ChannelManagerAdapterError
					? `Channex no pudo validar el acceso (${error.kind}).`
					: "Channex no pudo validar el acceso."
			return {
				ok: false,
				message,
				latencyMs: 0,
				probe: "vendor_api",
				trustLevel: "failed",
			}
		}
	}
	if (params.credentialSecret === "test://cloudbeds-ok") {
		return {
			ok: true,
			message: "Cloudbeds smoke harness OK.",
			latencyMs: 1,
			probe: "vendor_api",
			trustLevel: "verified_connection",
		}
	}
	if (params.vendorKey === "cloudbeds") return smokeCloudbeds(params)
	return null
}
