import type {
	ChannelManagerAuthType,
	ChannelManagerVendorKey,
} from "@/lib/provider-channel-manager-vendors"
import { createChannelManagerAdapter } from "@/lib/channel-manager/channel-manager-adapter-factory"
import type {
	ChannelManagerOperationMeta,
	ChannelManagerProperty,
	ChannelManagerRatePlan,
	ChannelManagerRoomType,
} from "@/lib/channel-manager/channel-manager-adapter"
import {
	assertProviderIntegrationTestCredentialAllowed,
	isSyntheticProviderIntegrationCredential,
} from "@/lib/provider-integration-test-harness"

export type RemoteChannelManagerProperty = ChannelManagerProperty

export type RemoteChannelManagerPropertyResult = Partial<ChannelManagerOperationMeta> & {
	properties: RemoteChannelManagerProperty[]
	fetchedAt: Date
}

export type RemoteChannelManagerRoomType = ChannelManagerRoomType

export type RemoteChannelManagerRatePlan = ChannelManagerRatePlan

export type RemoteChannelManagerCatalogResult = Partial<ChannelManagerOperationMeta> & {
	propertyId: string
	roomTypes: RemoteChannelManagerRoomType[]
	ratePlans: RemoteChannelManagerRatePlan[]
	fetchedAt: Date
}

const CLOUDBEDS_BASE_URL = "https://hotels.cloudbeds.com/api/v1.2"
const CLOUDBEDS_CATALOG_BASE_URL = "https://hotels.cloudbeds.com/api/v1.3"
const REQUEST_TIMEOUT_MS = 8_000

async function fetchJson(url: string, options: RequestInit): Promise<unknown> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
	try {
		const response = await fetch(url, { ...options, signal: controller.signal })
		if (!response.ok) throw new Error(`REMOTE_PROPERTIES_HTTP_${response.status}`)
		return await response.json()
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("REMOTE_PROPERTIES_TIMEOUT")
		}
		throw error
	} finally {
		clearTimeout(timeout)
	}
}

function normalizeText(value: unknown): string | null {
	const normalized = String(value ?? "").trim()
	return normalized || null
}

function normalizeNumber(value: unknown): number | null {
	const normalized = Number(value)
	return Number.isFinite(normalized) && normalized >= 0 ? normalized : null
}

function normalizeBoolean(value: unknown): boolean {
	return value === true || value === 1 || String(value ?? "").toLowerCase() === "true"
}

function cloudbedsProperties(payload: unknown): RemoteChannelManagerProperty[] {
	const root = payload as { data?: unknown }
	const rows = Array.isArray(root?.data)
		? root.data
		: Array.isArray((root?.data as { hotels?: unknown })?.hotels)
			? ((root.data as { hotels: unknown[] }).hotels ?? [])
			: []
	return rows.flatMap((raw) => {
		const row = raw as Record<string, unknown>
		const id = normalizeText(row.propertyID ?? row.propertyId ?? row.id)
		if (!id) return []
		return [
			{
				id,
				name: normalizeText(row.propertyName ?? row.name) ?? `Propiedad ${id}`,
				city: normalizeText(row.propertyCity ?? row.city),
				country: normalizeText(row.propertyCountry ?? row.country),
				currency: normalizeText(row.propertyCurrency ?? row.currency),
				timezone: normalizeText(row.propertyTimezone ?? row.timezone),
				active:
					row.isActive == null && row.active == null
						? null
						: normalizeBoolean(row.isActive ?? row.active),
			},
		]
	})
}

function payloadRows(payload: unknown): unknown[] {
	const root = payload as Record<string, unknown>
	if (Array.isArray(root?.data)) return root.data
	if (Array.isArray(root?.rooms)) return root.rooms
	if (Array.isArray(root?.roomTypes)) return root.roomTypes
	if (Array.isArray(root?.ratePlans)) return root.ratePlans
	const data = root?.data as Record<string, unknown> | undefined
	if (Array.isArray(data?.rooms)) return data.rooms
	if (Array.isArray(data?.roomTypes)) return data.roomTypes
	if (Array.isArray(data?.ratePlans)) return data.ratePlans
	return []
}

function cloudbedsRoomTypes(payload: unknown, propertyId: string): RemoteChannelManagerRoomType[] {
	return payloadRows(payload).flatMap((raw) => {
		const row = raw as Record<string, unknown>
		const id = normalizeText(row.roomTypeID ?? row.roomTypeId ?? row.id)
		if (!id) return []
		return [
			{
				id,
				name: normalizeText(row.roomTypeName ?? row.roomName ?? row.name) ?? `Habitación ${id}`,
				propertyId: normalizeText(row.propertyID ?? row.propertyId) ?? propertyId,
				units: normalizeNumber(row.roomTypeUnits ?? row.units ?? row.count),
				maxAdults: normalizeNumber(
					row.maxAdults ?? row.maxAdult ?? row.roomTypeMaxAdults ?? row.adults
				),
				maxChildren: normalizeNumber(
					row.maxChildren ?? row.maxChild ?? row.roomTypeMaxChildren ?? row.children
				),
			},
		]
	})
}

function cloudbedsRatePlans(payload: unknown, propertyId: string): RemoteChannelManagerRatePlan[] {
	return payloadRows(payload).flatMap((raw) => {
		const row = raw as Record<string, unknown>
		const id = normalizeText(row.rateID ?? row.rateId ?? row.ratePlanID ?? row.id)
		if (!id) return []
		return [
			{
				id,
				name:
					normalizeText(
						row.ratePlanNamePrivate ??
							row.ratePlanNamePublic ??
							row.ratePlanName ??
							row.rateName ??
							row.name
					) ?? `Tarifa ${id}`,
				propertyId: normalizeText(row.propertyID ?? row.propertyId) ?? propertyId,
				roomTypeId: normalizeText(row.roomTypeID ?? row.roomTypeId),
				currency: normalizeText(row.currency),
				derived: normalizeBoolean(row.derived ?? row.isDerived),
				readOnly: normalizeBoolean(row.readOnly ?? row.read_only),
			},
		]
	})
}

export async function fetchChannelManagerRemoteProperties(params: {
	vendorKey: ChannelManagerVendorKey
	authType: ChannelManagerAuthType
	credentialSecret: string
	mode: "sandbox" | "production"
}): Promise<RemoteChannelManagerPropertyResult> {
	if (!params.credentialSecret) throw new Error("REMOTE_PROPERTIES_CREDENTIAL_REQUIRED")
	if (isSyntheticProviderIntegrationCredential(params.credentialSecret)) {
		assertProviderIntegrationTestCredentialAllowed(params.credentialSecret, { mode: params.mode })
	}
	const adapter = createChannelManagerAdapter(params)
	if (adapter) {
		const result = await adapter.listProperties()
		return {
			properties: result.items,
			fetchedAt: result.fetchedAt,
			requestIds: result.requestIds,
			warnings: result.warnings,
			partial: result.partial,
			pageCount: result.pageCount,
		}
	}

	if (params.credentialSecret === "test://cloudbeds-ok") {
		return {
			properties: [
				{
					id: "cloudbeds_property_1",
					name: "Hotel de prueba Cloudbeds",
					city: "Santiago",
					country: "CL",
					currency: "USD",
					timezone: "America/Santiago",
					active: true,
				},
			],
			fetchedAt: new Date(),
		}
	}

	if (params.vendorKey === "cloudbeds") {
		const payload = await fetchJson(`${CLOUDBEDS_BASE_URL}/getHotels`, {
			method: "GET",
			headers: {
				"Accept": "application/json",
				"Authorization": `Bearer ${params.credentialSecret}`,
				"User-Agent": "fastt-cloudbeds-properties/1.0",
			},
		})
		return { properties: cloudbedsProperties(payload), fetchedAt: new Date() }
	}

	throw new Error("REMOTE_PROPERTIES_VENDOR_UNSUPPORTED")
}

export async function fetchChannelManagerRemoteCatalog(params: {
	vendorKey: ChannelManagerVendorKey
	authType: ChannelManagerAuthType
	credentialSecret: string
	mode: "sandbox" | "production"
	propertyId: string
}): Promise<RemoteChannelManagerCatalogResult> {
	const propertyId = String(params.propertyId ?? "").trim()
	if (!propertyId) throw new Error("REMOTE_CATALOG_PROPERTY_REQUIRED")
	if (!params.credentialSecret) throw new Error("REMOTE_CATALOG_CREDENTIAL_REQUIRED")
	if (isSyntheticProviderIntegrationCredential(params.credentialSecret)) {
		assertProviderIntegrationTestCredentialAllowed(params.credentialSecret, { mode: params.mode })
	}
	const adapter = createChannelManagerAdapter(params)
	if (adapter) {
		const [roomTypes, ratePlans] = await Promise.all([
			adapter.listRoomTypes({ propertyId }),
			adapter.listRatePlans({ propertyId }),
		])
		return {
			propertyId,
			roomTypes: roomTypes.items,
			ratePlans: ratePlans.items,
			fetchedAt: new Date(Math.max(roomTypes.fetchedAt.getTime(), ratePlans.fetchedAt.getTime())),
			requestIds: [...roomTypes.requestIds, ...ratePlans.requestIds],
			warnings: [...roomTypes.warnings, ...ratePlans.warnings],
			partial: roomTypes.partial || ratePlans.partial,
			pageCount: roomTypes.pageCount + ratePlans.pageCount,
		}
	}

	if (params.credentialSecret === "test://cloudbeds-ok") {
		return {
			propertyId,
			roomTypes: [
				{
					id: "cb_room_deluxe",
					name: "Deluxe King",
					propertyId,
					units: 4,
					maxAdults: 2,
					maxChildren: 1,
				},
				{
					id: "cb_room_standard",
					name: "Habitación estándar",
					propertyId,
					units: 8,
					maxAdults: 2,
					maxChildren: 0,
				},
			],
			ratePlans: [
				{
					id: "cb_rate_deluxe_bar",
					name: "Mejor tarifa disponible",
					propertyId,
					roomTypeId: "cb_room_deluxe",
					currency: "USD",
					derived: false,
					readOnly: false,
				},
			],
			fetchedAt: new Date(),
		}
	}

	if (params.vendorKey === "cloudbeds") {
		const headers = {
			"Accept": "application/json",
			"Authorization": `Bearer ${params.credentialSecret}`,
			"User-Agent": "fastt-cloudbeds-catalog/1.0",
		}
		const today = new Date()
		const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
		const date = (value: Date) => value.toISOString().slice(0, 10)
		const [roomPayload, ratePayload] = await Promise.all([
			fetchJson(
				`${CLOUDBEDS_CATALOG_BASE_URL}/getRoomTypes?propertyID=${encodeURIComponent(propertyId)}`,
				{ method: "GET", headers }
			),
			fetchJson(
				`${CLOUDBEDS_CATALOG_BASE_URL}/getRatePlans?propertyIDs=${encodeURIComponent(propertyId)}&startDate=${date(today)}&endDate=${date(tomorrow)}&detailedRates=false`,
				{ method: "GET", headers }
			),
		])
		return {
			propertyId,
			roomTypes: cloudbedsRoomTypes(roomPayload, propertyId),
			ratePlans: cloudbedsRatePlans(ratePayload, propertyId),
			fetchedAt: new Date(),
		}
	}

	throw new Error("REMOTE_CATALOG_VENDOR_UNSUPPORTED")
}
