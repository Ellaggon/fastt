import type {
	RemoteChannelManagerCatalogResult,
	RemoteChannelManagerRatePlan,
	RemoteChannelManagerRoomType,
} from "@/lib/provider-channel-manager-properties"
import type { ProviderIntegrationMappingCatalog } from "@/lib/provider-integration-operations"

export type MappingConfidence = "high" | "medium" | "low"

export type MappingSuggestion = {
	externalEntityId: string
	externalEntityName: string
	score: number
	confidence: MappingConfidence
	reason: string
}

export type MappingWorkspaceRow = {
	localEntityId: string
	localEntityName: string
	localEntityLabel: string
	parentLocalEntityId: string | null
	currentMapping: {
		id: string
		externalEntityId: string
		externalEntityName: string | null
		status: string
	} | null
	suggestion: MappingSuggestion | null
}

export type ChannelManagerMappingWorkspace = {
	propertyId: string
	fetchedAt: Date
	roomTypes: {
		local: MappingWorkspaceRow[]
		remote: RemoteChannelManagerRoomType[]
	}
	ratePlans: {
		local: MappingWorkspaceRow[]
		remote: RemoteChannelManagerRatePlan[]
	}
	summary: {
		localRoomTypes: number
		mappedRoomTypes: number
		localRatePlans: number
		mappedRatePlans: number
		highConfidenceSuggestions: number
		unmatchedLocal: number
		unusedRemote: number
	}
}

type ExistingMapping = {
	id: string
	mappingType: unknown
	localEntityId: unknown
	externalEntityId: unknown
	externalEntityName?: unknown
	status?: unknown
}

const TOKEN_ALIASES: Record<string, string> = {
	available: "bar",
	availability: "bar",
	best: "bar",
	mejor: "bar",
	disponible: "bar",
	double: "doble",
	king: "king",
	queen: "queen",
	room: "",
	rooms: "",
	habitacion: "",
	habitaciones: "",
	tarifa: "",
	tarifas: "",
	rate: "",
	rates: "",
	plan: "",
	plans: "",
	standard: "estandar",
	twin: "twin",
}

function normalizedTokens(value: string): string[] {
	const normalized = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
	if (!normalized) return []
	return [
		...new Set(
			normalized
				.split(/\s+/)
				.map((token) => TOKEN_ALIASES[token] ?? token)
				.filter(Boolean)
		),
	]
}

function similarity(left: string, right: string): number {
	const a = normalizedTokens(left)
	const b = normalizedTokens(right)
	if (!a.length || !b.length) return 0
	const aKey = a.join(" ")
	const bKey = b.join(" ")
	if (aKey === bKey) return 0.99
	const intersection = a.filter((token) => b.includes(token)).length
	const dice = (2 * intersection) / (a.length + b.length)
	const contains = aKey.includes(bKey) || bKey.includes(aKey) ? 0.82 : 0
	return Math.min(0.98, Math.max(dice, contains))
}

function confidence(score: number): MappingConfidence {
	if (score >= 0.88) return "high"
	if (score >= 0.64) return "medium"
	return "low"
}

function reasonFor(score: number, parentAligned: boolean): string {
	if (parentAligned && score >= 0.88) return "Mismo nombre y misma habitación"
	if (parentAligned) return "Coincide dentro de la misma habitación"
	if (score >= 0.88) return "Los nombres coinciden"
	if (score >= 0.64) return "Los nombres son similares"
	return "Coincidencia débil; revisa antes de guardar"
}

function mappingFor(
	mappings: ExistingMapping[],
	mappingType: "room_type" | "rate_plan",
	localEntityId: string
) {
	const mapping = mappings.find(
		(item) =>
			String(item.mappingType) === mappingType &&
			String(item.localEntityId) === localEntityId &&
			String(item.status ?? "active") === "active"
	)
	if (!mapping) return null
	return {
		id: String(mapping.id),
		externalEntityId: String(mapping.externalEntityId),
		externalEntityName: String(mapping.externalEntityName ?? "").trim() || null,
		status: String(mapping.status ?? "active"),
	}
}

function bestSuggestion<T extends { id: string; name: string }>(params: {
	localName: string
	remote: T[]
	usedExternalIds: Set<string>
	parentExternalId?: string | null
	parentIdFor?: (item: T) => string | null
}): MappingSuggestion | null {
	const candidates = params.remote
		.filter((item) => !params.usedExternalIds.has(item.id))
		.map((item) => {
			const parentAligned = Boolean(
				params.parentExternalId &&
				params.parentIdFor &&
				params.parentIdFor(item) === params.parentExternalId
			)
			const nameScore = similarity(params.localName, item.name)
			const score = Math.min(0.99, nameScore + (parentAligned ? 0.12 : 0))
			return { item, score, parentAligned }
		})
		.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "es"))[0]
	if (!candidates || candidates.score < 0.42) return null
	return {
		externalEntityId: candidates.item.id,
		externalEntityName: candidates.item.name,
		score: Number(candidates.score.toFixed(2)),
		confidence: confidence(candidates.score),
		reason: reasonFor(candidates.score, candidates.parentAligned),
	}
}

export function buildChannelManagerMappingWorkspace(params: {
	localCatalog: ProviderIntegrationMappingCatalog
	remoteCatalog: RemoteChannelManagerCatalogResult
	mappings: ExistingMapping[]
}): ChannelManagerMappingWorkspace {
	const usedRoomIds = new Set(
		params.mappings
			.filter(
				(mapping) =>
					String(mapping.mappingType) === "room_type" &&
					String(mapping.status ?? "active") === "active"
			)
			.map((mapping) => String(mapping.externalEntityId))
	)
	const roomRows = params.localCatalog.variants.map((variant) => {
		const currentMapping = mappingFor(params.mappings, "room_type", variant.id)
		const suggestion = currentMapping
			? null
			: bestSuggestion({
					localName: variant.name,
					remote: params.remoteCatalog.roomTypes,
					usedExternalIds: usedRoomIds,
				})
		if (suggestion) usedRoomIds.add(suggestion.externalEntityId)
		return {
			localEntityId: variant.id,
			localEntityName: variant.name,
			localEntityLabel: variant.label,
			parentLocalEntityId: variant.productId,
			currentMapping,
			suggestion,
		}
	})

	const roomExternalByLocal = new Map<string, string>()
	for (const row of roomRows) {
		const externalId =
			row.currentMapping?.externalEntityId ??
			(row.suggestion?.confidence === "high" ? row.suggestion.externalEntityId : null)
		if (externalId) roomExternalByLocal.set(row.localEntityId, externalId)
	}
	const usedRateIds = new Set(
		params.mappings
			.filter(
				(mapping) =>
					String(mapping.mappingType) === "rate_plan" &&
					String(mapping.status ?? "active") === "active"
			)
			.map((mapping) => String(mapping.externalEntityId))
	)
	const rateRows = params.localCatalog.ratePlans.map((ratePlan) => {
		const currentMapping = mappingFor(params.mappings, "rate_plan", ratePlan.id)
		const suggestion = currentMapping
			? null
			: bestSuggestion({
					localName: ratePlan.name,
					remote: params.remoteCatalog.ratePlans,
					usedExternalIds: usedRateIds,
					parentExternalId: roomExternalByLocal.get(ratePlan.variantId) ?? null,
					parentIdFor: (item) => item.roomTypeId,
				})
		if (suggestion) usedRateIds.add(suggestion.externalEntityId)
		return {
			localEntityId: ratePlan.id,
			localEntityName: ratePlan.name,
			localEntityLabel: ratePlan.label,
			parentLocalEntityId: ratePlan.variantId,
			currentMapping,
			suggestion,
		}
	})

	const allRows = [...roomRows, ...rateRows]
	const mappedRoomTypes = roomRows.filter((row) => row.currentMapping).length
	const mappedRatePlans = rateRows.filter((row) => row.currentMapping).length
	const highConfidenceSuggestions = allRows.filter(
		(row) => row.suggestion?.confidence === "high"
	).length
	const usedRemote = new Set(
		params.mappings
			.filter((mapping) => String(mapping.status ?? "active") === "active")
			.map((mapping) => String(mapping.externalEntityId))
	)

	return {
		propertyId: params.remoteCatalog.propertyId,
		fetchedAt: params.remoteCatalog.fetchedAt,
		roomTypes: { local: roomRows, remote: params.remoteCatalog.roomTypes },
		ratePlans: { local: rateRows, remote: params.remoteCatalog.ratePlans },
		summary: {
			localRoomTypes: roomRows.length,
			mappedRoomTypes,
			localRatePlans: rateRows.length,
			mappedRatePlans,
			highConfidenceSuggestions,
			unmatchedLocal: allRows.filter((row) => !row.currentMapping && !row.suggestion).length,
			unusedRemote: [...params.remoteCatalog.roomTypes, ...params.remoteCatalog.ratePlans].filter(
				(item) => !usedRemote.has(item.id)
			).length,
		},
	}
}
