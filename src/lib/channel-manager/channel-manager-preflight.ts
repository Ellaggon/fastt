import type {
	ChannelManagerProperty,
	ChannelManagerRatePlan,
	ChannelManagerRoomType,
	ChannelManagerWarning,
} from "@/lib/channel-manager/channel-manager-adapter"
import type { ProviderIntegrationMappingCatalog } from "@/lib/provider-integration-operations"

export type ChannelManagerPreflightStepKey = "access" | "property" | "rooms" | "rates" | "coverage"

export type ChannelManagerPreflightIssue = {
	code: string
	step: ChannelManagerPreflightStepKey
	severity: "blocker" | "warning"
	message: string
	entityType?: "property" | "room_type" | "rate_plan" | "mapping"
	entityId?: string | null
}

export type ChannelManagerPreflightResult = {
	readyForProduction: boolean
	checkedAt: Date
	steps: Array<{
		key: ChannelManagerPreflightStepKey
		label: string
		status: "complete" | "error" | "pending"
		summary: string
	}>
	issues: ChannelManagerPreflightIssue[]
	summary: {
		remoteProperties: number
		remoteRoomTypes: number
		remoteRatePlans: number
		sellableRoomTypes: number
		mappedSellableRoomTypes: number
		sellableRatePlans: number
		mappedSellableRatePlans: number
		activeMappings: number
		inactiveMappings: number
		orphanMappings: number
		duplicateMappings: number
		manualMappings: number
	}
}

type MappingRow = {
	id: string
	mappingType: unknown
	localEntityType?: unknown
	localEntityId: unknown
	externalEntityType?: unknown
	externalEntityId: unknown
	externalEntityName?: unknown
	status?: unknown
	metadataJson?: unknown
}

type PreflightProgress = Record<"access" | "properties" | "rooms" | "rates", boolean>

type PreflightInput = {
	selectedPropertyId: string | null
	providerProfile: { timezone: string | null; defaultCurrency: string | null } | null
	properties: ChannelManagerProperty[]
	roomTypes: ChannelManagerRoomType[]
	ratePlans: ChannelManagerRatePlan[]
	localCatalog: ProviderIntegrationMappingCatalog
	mappings: MappingRow[]
	remoteWarnings?: ChannelManagerWarning[]
	remotePartial?: boolean
	progress?: Partial<PreflightProgress>
	stageErrors?: Partial<Record<"access" | "properties" | "rooms" | "rates", string>>
}

const stepLabels: Record<ChannelManagerPreflightStepKey, string> = {
	access: "Acceso",
	property: "Propiedad",
	rooms: "Habitaciones",
	rates: "Tarifas",
	coverage: "Cobertura",
}

function normalized(value: unknown): string {
	return String(value ?? "").trim()
}

function normalizedCurrency(value: unknown): string {
	return normalized(value).toUpperCase()
}

function validTimezone(value: string): boolean {
	if (!value) return false
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format()
		return true
	} catch {
		return false
	}
}

function metadataSource(value: unknown): string | null {
	if (!value || typeof value !== "object") return null
	return normalized((value as Record<string, unknown>).source) || null
}

function duplicateKeys(rows: MappingRow[], keyFor: (row: MappingRow) => string): Set<string> {
	const seen = new Set<string>()
	const duplicates = new Set<string>()
	for (const row of rows) {
		const key = keyFor(row)
		if (!key) continue
		if (seen.has(key)) duplicates.add(key)
		seen.add(key)
	}
	return duplicates
}

export function evaluateChannelManagerPreflight(
	input: PreflightInput
): ChannelManagerPreflightResult {
	const progress: PreflightProgress = {
		access: input.progress?.access ?? true,
		properties: input.progress?.properties ?? true,
		rooms: input.progress?.rooms ?? true,
		rates: input.progress?.rates ?? true,
	}
	const catalogComplete = Object.values(progress).every(Boolean)
	const issues: ChannelManagerPreflightIssue[] = []
	const add = (issue: ChannelManagerPreflightIssue) => issues.push(issue)

	if (!progress.access) {
		add({
			code: "PREFLIGHT_ACCESS_FAILED",
			step: "access",
			severity: "blocker",
			message: input.stageErrors?.access ?? "No se pudo validar el acceso al proveedor.",
		})
	}
	if (progress.access && !progress.properties) {
		add({
			code: "PREFLIGHT_PROPERTIES_FAILED",
			step: "property",
			severity: "blocker",
			message: input.stageErrors?.properties ?? "No se pudo leer el catálogo de propiedades.",
		})
	}

	const selectedPropertyId = normalized(input.selectedPropertyId) || null
	const selectedProperty = selectedPropertyId
		? (input.properties.find((property) => property.id === selectedPropertyId) ?? null)
		: null
	if (progress.properties) {
		if (!selectedPropertyId) {
			add({
				code: "PREFLIGHT_PROPERTY_REQUIRED",
				step: "property",
				severity: "blocker",
				message: "Selecciona una propiedad antes de continuar.",
			})
		} else if (!selectedProperty) {
			add({
				code: "PREFLIGHT_PROPERTY_NOT_FOUND",
				step: "property",
				severity: "blocker",
				message: "La propiedad seleccionada ya no pertenece a esta credencial.",
				entityType: "property",
				entityId: selectedPropertyId,
			})
		}
	}

	if (selectedProperty) {
		if (selectedProperty.active !== true) {
			add({
				code:
					selectedProperty.active === false
						? "PREFLIGHT_PROPERTY_INACTIVE"
						: "PREFLIGHT_PROPERTY_ACTIVE_UNKNOWN",
				step: "property",
				severity: "blocker",
				message:
					selectedProperty.active === false
						? "La propiedad está inactiva en el channel manager."
						: "El proveedor no confirmó que la propiedad esté activa.",
				entityType: "property",
				entityId: selectedProperty.id,
			})
		}
		const remoteCurrency = normalizedCurrency(selectedProperty.currency)
		const localCurrency = normalizedCurrency(input.providerProfile?.defaultCurrency)
		if (!/^[A-Z]{3}$/.test(remoteCurrency)) {
			add({
				code: "PREFLIGHT_PROPERTY_CURRENCY_INVALID",
				step: "property",
				severity: "blocker",
				message: "La propiedad no tiene una moneda ISO válida.",
				entityType: "property",
				entityId: selectedProperty.id,
			})
		} else if (!/^[A-Z]{3}$/.test(localCurrency) || remoteCurrency !== localCurrency) {
			add({
				code: "PREFLIGHT_PROPERTY_CURRENCY_MISMATCH",
				step: "property",
				severity: "blocker",
				message: `La moneda del proveedor (${remoteCurrency}) no coincide con la de Fastt (${localCurrency || "sin configurar"}).`,
				entityType: "property",
				entityId: selectedProperty.id,
			})
		}
		const remoteTimezone = normalized(selectedProperty.timezone)
		const localTimezone = normalized(input.providerProfile?.timezone)
		if (!validTimezone(remoteTimezone)) {
			add({
				code: "PREFLIGHT_PROPERTY_TIMEZONE_INVALID",
				step: "property",
				severity: "blocker",
				message: "La propiedad no tiene una zona horaria IANA válida.",
				entityType: "property",
				entityId: selectedProperty.id,
			})
		} else if (!validTimezone(localTimezone) || remoteTimezone !== localTimezone) {
			add({
				code: "PREFLIGHT_PROPERTY_TIMEZONE_MISMATCH",
				step: "property",
				severity: "blocker",
				message: `La zona horaria del proveedor (${remoteTimezone}) no coincide con la de Fastt (${localTimezone || "sin configurar"}).`,
				entityType: "property",
				entityId: selectedProperty.id,
			})
		}
	}

	if (progress.properties && selectedProperty && !progress.rooms) {
		add({
			code: "PREFLIGHT_ROOMS_FAILED",
			step: "rooms",
			severity: "blocker",
			message: input.stageErrors?.rooms ?? "No se pudo leer el catálogo de habitaciones.",
		})
	}
	if (progress.rooms && selectedPropertyId) {
		const duplicateRoomIds = duplicateKeys(
			input.roomTypes.map((room) => ({
				id: room.id,
				mappingType: "room_type",
				localEntityId: room.id,
				externalEntityId: room.id,
			})),
			(row) => normalized(row.externalEntityId)
		)
		for (const id of duplicateRoomIds) {
			add({
				code: "PREFLIGHT_REMOTE_ROOM_DUPLICATED",
				step: "rooms",
				severity: "blocker",
				message: "El proveedor devolvió una habitación duplicada.",
				entityType: "room_type",
				entityId: id,
			})
		}
		for (const room of input.roomTypes) {
			if (room.propertyId !== selectedPropertyId) {
				add({
					code: "PREFLIGHT_REMOTE_ROOM_WRONG_PROPERTY",
					step: "rooms",
					severity: "blocker",
					message: `La habitación “${room.name}” no pertenece a la propiedad seleccionada.`,
					entityType: "room_type",
					entityId: room.id,
				})
			}
		}
	}

	if (progress.rooms && selectedProperty && !progress.rates) {
		add({
			code: "PREFLIGHT_RATES_FAILED",
			step: "rates",
			severity: "blocker",
			message: input.stageErrors?.rates ?? "No se pudo leer el catálogo de tarifas.",
		})
	}
	if (progress.rates && selectedPropertyId) {
		const remoteRoomIds = new Set(input.roomTypes.map((room) => room.id))
		const propertyCurrency = normalizedCurrency(selectedProperty?.currency)
		const duplicateRateIds = duplicateKeys(
			input.ratePlans.map((rate) => ({
				id: rate.id,
				mappingType: "rate_plan",
				localEntityId: rate.id,
				externalEntityId: rate.id,
			})),
			(row) => normalized(row.externalEntityId)
		)
		for (const id of duplicateRateIds) {
			add({
				code: "PREFLIGHT_REMOTE_RATE_DUPLICATED",
				step: "rates",
				severity: "blocker",
				message: "El proveedor devolvió un plan tarifario duplicado.",
				entityType: "rate_plan",
				entityId: id,
			})
		}
		for (const rate of input.ratePlans) {
			if (rate.propertyId !== selectedPropertyId) {
				add({
					code: "PREFLIGHT_REMOTE_RATE_WRONG_PROPERTY",
					step: "rates",
					severity: "blocker",
					message: `La tarifa “${rate.name}” no pertenece a la propiedad seleccionada.`,
					entityType: "rate_plan",
					entityId: rate.id,
				})
			}
			if (!rate.roomTypeId || !remoteRoomIds.has(rate.roomTypeId)) {
				add({
					code: "PREFLIGHT_REMOTE_RATE_ROOM_ORPHAN",
					step: "rates",
					severity: "blocker",
					message: `La tarifa “${rate.name}” no pertenece a una habitación válida.`,
					entityType: "rate_plan",
					entityId: rate.id,
				})
			}
			const rateCurrency = normalizedCurrency(rate.currency)
			if (rateCurrency && propertyCurrency && rateCurrency !== propertyCurrency) {
				add({
					code: "PREFLIGHT_REMOTE_RATE_CURRENCY_MISMATCH",
					step: "rates",
					severity: "blocker",
					message: `La tarifa “${rate.name}” usa ${rateCurrency} y la propiedad usa ${propertyCurrency}.`,
					entityType: "rate_plan",
					entityId: rate.id,
				})
			}
		}
	}

	const relevantMappings = input.mappings.filter((mapping) =>
		["room_type", "rate_plan"].includes(normalized(mapping.mappingType))
	)
	const activeMappings = relevantMappings.filter(
		(mapping) => normalized(mapping.status) === "active"
	)
	const inactiveMappings = relevantMappings.filter(
		(mapping) => normalized(mapping.status) !== "active"
	)
	for (const mapping of catalogComplete ? inactiveMappings : []) {
		add({
			code: "PREFLIGHT_MAPPING_INACTIVE",
			step: "coverage",
			severity: "warning",
			message: "Hay un mapeo inactivo que no participa en la cobertura.",
			entityType: "mapping",
			entityId: mapping.id,
		})
	}

	const duplicateLocal = duplicateKeys(
		activeMappings,
		(mapping) => `${normalized(mapping.mappingType)}:${normalized(mapping.localEntityId)}`
	)
	const duplicateExternal = duplicateKeys(
		activeMappings,
		(mapping) => `${normalized(mapping.mappingType)}:${normalized(mapping.externalEntityId)}`
	)
	for (const key of catalogComplete ? new Set([...duplicateLocal, ...duplicateExternal]) : []) {
		add({
			code: "PREFLIGHT_MAPPING_DUPLICATED",
			step: "coverage",
			severity: "blocker",
			message: `Hay más de un mapeo activo para ${key}.`,
			entityType: "mapping",
			entityId: key,
		})
	}

	const localRoomIds = new Set(input.localCatalog.variants.map((item) => item.id))
	const localRateIds = new Set(input.localCatalog.ratePlans.map((item) => item.id))
	const remoteRoomIds = new Set(input.roomTypes.map((item) => item.id))
	const remoteRateIds = new Set(input.ratePlans.map((item) => item.id))
	let orphanMappings = 0
	for (const mapping of catalogComplete ? activeMappings : []) {
		const mappingType = normalized(mapping.mappingType)
		const localId = normalized(mapping.localEntityId)
		const externalId = normalized(mapping.externalEntityId)
		if (!localId || !externalId) {
			add({
				code: "PREFLIGHT_MAPPING_INCOMPLETE",
				step: "coverage",
				severity: "blocker",
				message: "Hay un mapeo activo incompleto.",
				entityType: "mapping",
				entityId: mapping.id,
			})
			continue
		}
		const localExists =
			mappingType === "room_type" ? localRoomIds.has(localId) : localRateIds.has(localId)
		const remoteExists =
			mappingType === "room_type" ? remoteRoomIds.has(externalId) : remoteRateIds.has(externalId)
		if (!localExists || !remoteExists) {
			orphanMappings += 1
			add({
				code: !localExists ? "PREFLIGHT_MAPPING_LOCAL_ORPHAN" : "PREFLIGHT_MAPPING_REMOTE_ORPHAN",
				step: "coverage",
				severity: "blocker",
				message: !localExists
					? "Un mapeo apunta a una entidad de Fastt que ya no existe o no está activa."
					: "Un mapeo apunta a una entidad que ya no existe en el proveedor.",
				entityType: "mapping",
				entityId: mapping.id,
			})
		}
	}

	const roomMappingByLocal = new Map(
		activeMappings
			.filter((mapping) => normalized(mapping.mappingType) === "room_type")
			.map((mapping) => [normalized(mapping.localEntityId), normalized(mapping.externalEntityId)])
	)
	const validRoomMappingByLocal = new Map(
		[...roomMappingByLocal].filter(
			([localId, externalId]) => localRoomIds.has(localId) && remoteRoomIds.has(externalId)
		)
	)
	const remoteRateById = new Map(input.ratePlans.map((rate) => [rate.id, rate]))
	for (const mapping of (catalogComplete ? activeMappings : []).filter(
		(mapping) => normalized(mapping.mappingType) === "rate_plan"
	)) {
		const localRate = input.localCatalog.ratePlans.find(
			(rate) => rate.id === normalized(mapping.localEntityId)
		)
		const remoteRate = remoteRateById.get(normalized(mapping.externalEntityId))
		const expectedRemoteRoom = localRate
			? (validRoomMappingByLocal.get(localRate.variantId) ?? null)
			: null
		if (localRate && remoteRate && expectedRemoteRoom !== remoteRate.roomTypeId) {
			add({
				code: "PREFLIGHT_RATE_MAPPING_WRONG_ROOM",
				step: "coverage",
				severity: "blocker",
				message: `La tarifa “${localRate.name}” está vinculada a una habitación externa distinta.`,
				entityType: "mapping",
				entityId: mapping.id,
			})
		}
	}

	const sellableRooms = input.localCatalog.variants.filter((item) => item.sellable)
	const sellableRates = input.localCatalog.ratePlans.filter((item) => item.sellable)
	const mappedSellableRooms = sellableRooms.filter((item) => validRoomMappingByLocal.has(item.id))
	const rateMappingByLocal = new Map(
		activeMappings
			.filter((mapping) => normalized(mapping.mappingType) === "rate_plan")
			.map((mapping) => [normalized(mapping.localEntityId), normalized(mapping.externalEntityId)])
	)
	const validRateMappingByLocal = new Map(
		[...rateMappingByLocal].filter(([localId, externalId]) => {
			const localRate = input.localCatalog.ratePlans.find((rate) => rate.id === localId)
			const remoteRate = remoteRateById.get(externalId)
			return Boolean(
				localRate &&
				remoteRate &&
				validRoomMappingByLocal.get(localRate.variantId) === remoteRate.roomTypeId
			)
		})
	)
	const mappedSellableRates = sellableRates.filter((item) => validRateMappingByLocal.has(item.id))
	if (catalogComplete && sellableRooms.length === 0) {
		add({
			code: "PREFLIGHT_NO_SELLABLE_ROOMS",
			step: "coverage",
			severity: "blocker",
			message: "No hay habitaciones publicadas y activas para sincronizar.",
		})
	}
	for (const room of (catalogComplete ? sellableRooms : []).filter(
		(item) => !validRoomMappingByLocal.has(item.id)
	)) {
		add({
			code: "PREFLIGHT_SELLABLE_ROOM_UNMAPPED",
			step: "coverage",
			severity: "blocker",
			message: `La habitación vendible “${room.name}” no está mapeada.`,
			entityType: "room_type",
			entityId: room.id,
		})
	}
	if (catalogComplete && sellableRates.length === 0) {
		add({
			code: "PREFLIGHT_NO_SELLABLE_RATES",
			step: "coverage",
			severity: "blocker",
			message: "No hay tarifas publicadas y activas para sincronizar.",
		})
	}
	for (const rate of (catalogComplete ? sellableRates : []).filter(
		(item) => !validRateMappingByLocal.has(item.id)
	)) {
		add({
			code: "PREFLIGHT_SELLABLE_RATE_UNMAPPED",
			step: "coverage",
			severity: "blocker",
			message: `La tarifa vendible “${rate.name}” no está mapeada.`,
			entityType: "rate_plan",
			entityId: rate.id,
		})
	}

	if (catalogComplete && (input.remotePartial || (input.remoteWarnings?.length ?? 0) > 0)) {
		add({
			code: "PREFLIGHT_REMOTE_CATALOG_PARTIAL",
			step: "coverage",
			severity: "blocker",
			message: "El proveedor devolvió un catálogo parcial; actualízalo antes de continuar.",
		})
	}

	const stepReached: Record<ChannelManagerPreflightStepKey, boolean> = {
		access: progress.access,
		property: progress.properties,
		rooms: progress.rooms,
		rates: progress.rates,
		coverage: progress.access && progress.properties && progress.rooms && progress.rates,
	}
	const stepAttempted: Record<ChannelManagerPreflightStepKey, boolean> = {
		access: true,
		property: progress.access,
		rooms: progress.properties,
		rates: progress.rooms,
		coverage: catalogComplete,
	}
	const steps = (Object.keys(stepLabels) as ChannelManagerPreflightStepKey[]).map((key) => {
		const blockerCount = issues.filter(
			(issue) => issue.step === key && issue.severity === "blocker"
		).length
		const status: "complete" | "error" | "pending" = !stepAttempted[key]
			? "pending"
			: blockerCount
				? "error"
				: stepReached[key]
					? "complete"
					: "pending"
		const summaries: Record<ChannelManagerPreflightStepKey, string> = {
			access:
				status === "complete"
					? "Credencial validada"
					: status === "pending"
						? "Pendiente"
						: "Requiere atención",
			property:
				status === "complete"
					? `${selectedProperty?.name ?? "Propiedad"} validada`
					: status === "pending"
						? "Pendiente"
						: "Requiere atención",
			rooms:
				status === "complete"
					? `${input.roomTypes.length} disponibles`
					: status === "pending"
						? "Pendiente"
						: "Requiere atención",
			rates:
				status === "complete"
					? `${input.ratePlans.length} disponibles`
					: status === "pending"
						? "Pendiente"
						: "Requiere atención",
			coverage:
				status === "complete"
					? `${mappedSellableRooms.length + mappedSellableRates.length} relaciones cubiertas`
					: status === "pending"
						? "Pendiente"
						: "Cobertura incompleta",
		}
		return { key, label: stepLabels[key], status, summary: summaries[key] }
	})

	return {
		readyForProduction: catalogComplete && issues.every((issue) => issue.severity !== "blocker"),
		checkedAt: new Date(),
		steps,
		issues,
		summary: {
			remoteProperties: input.properties.length,
			remoteRoomTypes: input.roomTypes.length,
			remoteRatePlans: input.ratePlans.length,
			sellableRoomTypes: sellableRooms.length,
			mappedSellableRoomTypes: mappedSellableRooms.length,
			sellableRatePlans: sellableRates.length,
			mappedSellableRatePlans: mappedSellableRates.length,
			activeMappings: activeMappings.length,
			inactiveMappings: inactiveMappings.length,
			orphanMappings,
			duplicateMappings: new Set([...duplicateLocal, ...duplicateExternal]).size,
			manualMappings: relevantMappings.filter(
				(mapping) => metadataSource(mapping.metadataJson) === "user"
			).length,
		},
	}
}
