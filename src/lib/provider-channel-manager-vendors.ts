export type ChannelManagerVendorKey = "generic" | "cloudbeds" | "channex"
export type ChannelManagerAuthType = "reference" | "api_key" | "oauth2"

export type ChannelManagerVendorCatalogItem = {
	key: ChannelManagerVendorKey
	name: string
	authTypes: ChannelManagerAuthType[]
	propertyIdLabel: string
	credentialLabel: string
	credentialPlaceholder: string
	help: string
	docsUrl: string
	supportsApiSmoke: boolean
}

export const channelManagerVendors: ChannelManagerVendorCatalogItem[] = [
	{
		key: "generic",
		name: "Otro / referencia manual",
		authTypes: ["reference", "api_key", "oauth2"],
		propertyIdLabel: "ID de propiedad externo",
		credentialLabel: "Enlace o referencia de acceso",
		credentialPlaceholder: "https://… o vault://secret/channel-manager",
		help: "Usa este modo cuando el proveedor aún no tiene adapter dedicado en Fastt.",
		docsUrl: "",
		supportsApiSmoke: false,
	},
	{
		key: "cloudbeds",
		name: "Cloudbeds",
		authTypes: ["api_key", "oauth2"],
		propertyIdLabel: "Cloudbeds property ID",
		credentialLabel: "API key / Bearer token",
		credentialPlaceholder: "cbat_… o vault://secret/cloudbeds",
		help: "Cloudbeds expone API REST JSON y permite API key u OAuth 2.0; la prueba consulta getHotels.",
		docsUrl:
			"https://developers.cloudbeds.com/docs/quickstart-guide-api-authentication-for-property-level-users",
		supportsApiSmoke: true,
	},
	{
		key: "channex",
		name: "Channex",
		authTypes: ["api_key"],
		propertyIdLabel: "Channex property UUID",
		credentialLabel: "user-api-key",
		credentialPlaceholder: "API key de Channex o vault://secret/channex",
		help: "Channex usa API key en header user-api-key; la prueba consulta properties.",
		docsUrl: "https://docs.channex.io/api-v.1-documentation/api-reference",
		supportsApiSmoke: true,
	},
]

const vendorByKey = new Map(channelManagerVendors.map((vendor) => [vendor.key, vendor]))

export function normalizeChannelManagerVendorKey(value: unknown): ChannelManagerVendorKey {
	const raw = String(value ?? "").trim()
	if (raw === "cloudbeds" || raw === "channex") return raw
	return "generic"
}

export function normalizeChannelManagerAuthType(value: unknown): ChannelManagerAuthType {
	const raw = String(value ?? "").trim()
	if (raw === "api_key" || raw === "oauth2") return raw
	return "reference"
}

export function getChannelManagerVendor(value: unknown): ChannelManagerVendorCatalogItem {
	return vendorByKey.get(normalizeChannelManagerVendorKey(value)) ?? channelManagerVendors[0]
}

export function listChannelManagerVendors(): ChannelManagerVendorCatalogItem[] {
	return channelManagerVendors.map((vendor) => ({
		...vendor,
		authTypes: [...vendor.authTypes],
	}))
}
