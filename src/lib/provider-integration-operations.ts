import {
	and,
	db,
	desc,
	eq,
	first,
	ProviderIntegrationConnection,
	ProviderIntegrationIncident,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	Product,
	RatePlan,
	sql,
	TaxFeeDefinition,
	Variant,
} from "@/shared/infrastructure/db/compat"

export type IntegrationMappingInput = {
	mappingType: string
	localEntityType: string
	localEntityId: string
	externalEntityType: string
	externalEntityId: string
	externalEntityName?: string | null
	direction?: "import" | "export" | "bidirectional"
	metadataJson?: unknown
}

export type IntegrationRunStatus = "running" | "succeeded" | "partial" | "failed" | "cancelled"

export type IntegrationIncidentInput = {
	dedupeKey: string
	code: string
	category: "authentication" | "mapping" | "conflict" | "remote_api" | "data_quality" | "system"
	severity: "info" | "warning" | "error" | "critical"
	title: string
	description: string
	actionLabel?: string | null
	actionHref?: string | null
	entityType?: string | null
	entityId?: string | null
	mappingId?: string | null
	metadataJson?: unknown
}

export type ProviderIntegrationMappingCatalog = {
	products: Array<{ id: string; label: string; entityType: "product" }>
	variants: Array<{ id: string; label: string; entityType: "variant"; productName: string }>
	ratePlans: Array<{ id: string; label: string; entityType: "rate_plan"; variantName: string }>
	taxes: Array<{ id: string; label: string; entityType: "tax" }>
}

const ALLOWED_MAPPING_TYPES = new Set([
	"property",
	"room_type",
	"rate_plan",
	"tax",
	"account",
	"calendar",
])
const ALLOWED_ENTITY_TYPES = new Set([
	"provider",
	"product",
	"variant",
	"rate_plan",
	"tax",
	"account",
	"calendar",
])

function requiredIdentifier(value: unknown, code: string, max = 200): string {
	const normalized = String(value ?? "").trim()
	if (!normalized || normalized.length > max) throw new Error(code)
	return normalized
}

function normalizeActionHref(value: unknown): string | null {
	const href = String(value ?? "").trim()
	if (!href) return null
	if (!href.startsWith("/provider/settings/integrations")) return null
	return href.slice(0, 500)
}

async function ownedConnection(providerId: string, connectionId: string) {
	const connection = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, connectionId),
				eq(ProviderIntegrationConnection.providerId, providerId)
			)
		)
		.then(first)
	if (!connection) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	return connection
}

export async function setPrimaryProviderIntegrationConnection(params: {
	providerId: string
	connectionId: string
}) {
	const connection = await ownedConnection(params.providerId, params.connectionId)
	if (connection.status === "revoked") throw new Error("INTEGRATION_CONNECTION_REVOKED")
	await db.transaction(async (tx) => {
		await tx
			.update(ProviderIntegrationConnection)
			.set({ isPrimary: false, updatedAt: new Date() })
			.where(
				and(
					eq(ProviderIntegrationConnection.providerId, params.providerId),
					eq(ProviderIntegrationConnection.connectorKey, connection.connectorKey)
				)
			)
		await tx
			.update(ProviderIntegrationConnection)
			.set({ isPrimary: true, updatedAt: new Date() })
			.where(eq(ProviderIntegrationConnection.id, params.connectionId))
	})
}

export async function upsertProviderIntegrationMapping(params: {
	providerId: string
	connectionId: string
	input: IntegrationMappingInput
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const mappingType = requiredIdentifier(params.input.mappingType, "MAPPING_TYPE_REQUIRED", 60)
	const localEntityType = requiredIdentifier(
		params.input.localEntityType,
		"MAPPING_LOCAL_TYPE_REQUIRED",
		60
	)
	if (!ALLOWED_MAPPING_TYPES.has(mappingType)) throw new Error("MAPPING_TYPE_INVALID")
	if (!ALLOWED_ENTITY_TYPES.has(localEntityType)) throw new Error("MAPPING_LOCAL_TYPE_INVALID")
	const localEntityId = requiredIdentifier(params.input.localEntityId, "MAPPING_LOCAL_ID_REQUIRED")
	const externalEntityType = requiredIdentifier(
		params.input.externalEntityType,
		"MAPPING_EXTERNAL_TYPE_REQUIRED",
		60
	)
	const externalEntityId = requiredIdentifier(
		params.input.externalEntityId,
		"MAPPING_EXTERNAL_ID_REQUIRED"
	)
	const direction =
		params.input.direction === "import" || params.input.direction === "export"
			? params.input.direction
			: "bidirectional"
	const now = new Date()
	const existing = await db
		.select()
		.from(ProviderIntegrationMapping)
		.where(
			and(
				eq(ProviderIntegrationMapping.connectionId, params.connectionId),
				eq(ProviderIntegrationMapping.mappingType, mappingType),
				eq(ProviderIntegrationMapping.localEntityId, localEntityId)
			)
		)
		.then(first)

	const values = {
		providerId: params.providerId,
		connectionId: params.connectionId,
		mappingType,
		localEntityType,
		localEntityId,
		externalEntityType,
		externalEntityId,
		externalEntityName: String(params.input.externalEntityName ?? "").trim() || null,
		direction,
		status: "active",
		metadataJson: params.input.metadataJson ?? null,
		lastVerifiedAt: now,
		updatedAt: now,
	}
	if (existing) {
		await db
			.update(ProviderIntegrationMapping)
			.set(values)
			.where(eq(ProviderIntegrationMapping.id, existing.id))
		return existing.id
	}
	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationMapping).values({ id, ...values, createdAt: now })
	return id
}

export async function removeProviderIntegrationMapping(params: {
	providerId: string
	connectionId: string
	mappingId: string
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const mapping = await db
		.select({ id: ProviderIntegrationMapping.id })
		.from(ProviderIntegrationMapping)
		.where(
			and(
				eq(ProviderIntegrationMapping.id, params.mappingId),
				eq(ProviderIntegrationMapping.connectionId, params.connectionId),
				eq(ProviderIntegrationMapping.providerId, params.providerId)
			)
		)
		.then(first)
	if (!mapping) throw new Error("INTEGRATION_MAPPING_NOT_FOUND")
	await db
		.delete(ProviderIntegrationMapping)
		.where(eq(ProviderIntegrationMapping.id, params.mappingId))
}

export async function startProviderIntegrationSyncRun(params: {
	providerId: string
	connectionId: string
	operation: string
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	requestedBy?: string | null
	idempotencyKey?: string | null
}) {
	const connection = await ownedConnection(params.providerId, params.connectionId)
	const idempotencyKey = String(params.idempotencyKey ?? "").trim() || null
	if (idempotencyKey) {
		const existing = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(
				and(
					eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
					eq(ProviderIntegrationSyncRun.idempotencyKey, idempotencyKey)
				)
			)
			.then(first)
		if (existing) return existing
	}
	const now = new Date()
	const run = {
		id: crypto.randomUUID(),
		providerId: params.providerId,
		connectionId: params.connectionId,
		connectorKey: String(connection.connectorKey),
		operation: requiredIdentifier(params.operation, "SYNC_OPERATION_REQUIRED", 80),
		trigger: params.trigger ?? "manual",
		status: "running",
		idempotencyKey,
		requestedBy: params.requestedBy ?? null,
		startedAt: now,
		createdAt: now,
	}
	await db.insert(ProviderIntegrationSyncRun).values(run)
	return run
}

export async function finishProviderIntegrationSyncRun(params: {
	providerId: string
	runId: string
	status: Exclude<IntegrationRunStatus, "running">
	readCount?: number
	changedCount?: number
	skippedCount?: number
	failedCount?: number
	cursor?: string | null
	errorCode?: string | null
	errorMessage?: string | null
	summaryJson?: unknown
}) {
	const run = await db
		.select()
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.id, params.runId),
				eq(ProviderIntegrationSyncRun.providerId, params.providerId)
			)
		)
		.then(first)
	if (!run) throw new Error("INTEGRATION_SYNC_RUN_NOT_FOUND")
	if (run.status !== "running") return run
	const finishedAt = new Date()
	await db
		.update(ProviderIntegrationSyncRun)
		.set({
			status: params.status,
			readCount: Math.max(0, params.readCount ?? 0),
			changedCount: Math.max(0, params.changedCount ?? 0),
			skippedCount: Math.max(0, params.skippedCount ?? 0),
			failedCount: Math.max(0, params.failedCount ?? 0),
			cursor: params.cursor ?? null,
			errorCode: params.errorCode ?? null,
			errorMessage: params.errorMessage ? String(params.errorMessage).slice(0, 1000) : null,
			summaryJson: params.summaryJson ?? null,
			finishedAt,
		})
		.where(eq(ProviderIntegrationSyncRun.id, params.runId))
	return { ...run, ...params, finishedAt }
}

export async function recordProviderIntegrationIncident(params: {
	providerId: string
	connectionId: string
	syncRunId?: string | null
	input: IntegrationIncidentInput
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const dedupeKey = requiredIdentifier(params.input.dedupeKey, "INCIDENT_DEDUPE_KEY_REQUIRED")
	const now = new Date()
	const existing = await db
		.select()
		.from(ProviderIntegrationIncident)
		.where(
			and(
				eq(ProviderIntegrationIncident.connectionId, params.connectionId),
				eq(ProviderIntegrationIncident.dedupeKey, dedupeKey)
			)
		)
		.then(first)
	const values = {
		syncRunId: params.syncRunId ?? null,
		mappingId: params.input.mappingId ?? null,
		code: requiredIdentifier(params.input.code, "INCIDENT_CODE_REQUIRED", 100),
		category: params.input.category,
		severity: params.input.severity,
		status: "open",
		title: requiredIdentifier(params.input.title, "INCIDENT_TITLE_REQUIRED", 180),
		description: requiredIdentifier(
			params.input.description,
			"INCIDENT_DESCRIPTION_REQUIRED",
			1000
		),
		actionLabel:
			String(params.input.actionLabel ?? "")
				.trim()
				.slice(0, 100) || null,
		actionHref: normalizeActionHref(params.input.actionHref),
		entityType:
			String(params.input.entityType ?? "")
				.trim()
				.slice(0, 80) || null,
		entityId:
			String(params.input.entityId ?? "")
				.trim()
				.slice(0, 200) || null,
		metadataJson: params.input.metadataJson ?? null,
		lastSeenAt: now,
		resolvedAt: null,
		resolvedBy: null,
		resolutionNote: null,
		updatedAt: now,
	}
	let incidentId: string
	let forceNotify = false
	if (existing) {
		await db
			.update(ProviderIntegrationIncident)
			.set({
				...values,
				notificationStatus:
					existing.status === "resolved" ? "pending" : existing.notificationStatus,
				notificationError: existing.status === "resolved" ? null : existing.notificationError,
				occurrenceCount: sql`${ProviderIntegrationIncident.occurrenceCount} + 1`,
			})
			.where(eq(ProviderIntegrationIncident.id, existing.id))
		incidentId = existing.id
		forceNotify = existing.status === "resolved"
	} else {
		incidentId = crypto.randomUUID()
		await db.insert(ProviderIntegrationIncident).values({
			id: incidentId,
			providerId: params.providerId,
			connectionId: params.connectionId,
			dedupeKey,
			occurrenceCount: 1,
			firstSeenAt: now,
			createdAt: now,
			notificationStatus: "pending",
			notificationError: null,
			...values,
		})
		forceNotify = true
	}
	const { notifyProviderIntegrationIncident } =
		await import("@/lib/provider-integration-incident-notifications")
	await notifyProviderIntegrationIncident({
		incidentId,
		force: forceNotify || params.input.severity === "critical",
	}).catch(() => null)
	return incidentId
}

export async function resolveProviderIntegrationIncident(params: {
	providerId: string
	incidentId: string
	resolvedBy?: string | null
	resolutionNote?: string | null
}) {
	const incident = await db
		.select()
		.from(ProviderIntegrationIncident)
		.where(
			and(
				eq(ProviderIntegrationIncident.id, params.incidentId),
				eq(ProviderIntegrationIncident.providerId, params.providerId)
			)
		)
		.then(first)
	if (!incident) throw new Error("INTEGRATION_INCIDENT_NOT_FOUND")
	await db
		.update(ProviderIntegrationIncident)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolvedBy: params.resolvedBy ?? null,
			resolutionNote:
				String(params.resolutionNote ?? "")
					.trim()
					.slice(0, 500) || null,
			updatedAt: new Date(),
		})
		.where(eq(ProviderIntegrationIncident.id, params.incidentId))
}

export async function resolveProviderIntegrationIncidentByKey(params: {
	providerId: string
	connectionId: string
	dedupeKey: string
	resolvedBy?: string | null
	resolutionNote?: string | null
}) {
	await db
		.update(ProviderIntegrationIncident)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolvedBy: params.resolvedBy ?? null,
			resolutionNote:
				String(params.resolutionNote ?? "")
					.trim()
					.slice(0, 500) || null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(ProviderIntegrationIncident.providerId, params.providerId),
				eq(ProviderIntegrationIncident.connectionId, params.connectionId),
				eq(ProviderIntegrationIncident.dedupeKey, params.dedupeKey),
				eq(ProviderIntegrationIncident.status, "open")
			)
		)
}

export async function listProviderIntegrationOperations(providerId: string) {
	const [connections, mappings, runs, jobs, incidents] = await Promise.all([
		db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
			.orderBy(
				desc(ProviderIntegrationConnection.isPrimary),
				desc(ProviderIntegrationConnection.updatedAt)
			),
		db
			.select()
			.from(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.providerId, providerId))
			.orderBy(desc(ProviderIntegrationMapping.updatedAt)),
		db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.limit(20),
		db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
			.orderBy(desc(ProviderIntegrationSyncJob.updatedAt))
			.limit(20),
		db
			.select()
			.from(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.providerId, providerId))
			.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
			.limit(30),
	])
	return { connections, mappings, runs, jobs, incidents }
}

export async function listProviderIntegrationMappingCatalog(
	providerId: string
): Promise<ProviderIntegrationMappingCatalog> {
	const [products, variants, ratePlans, taxes] = await Promise.all([
		db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
			})
			.from(Product)
			.where(eq(Product.providerId, providerId))
			.orderBy(Product.name)
			.limit(100),
		db
			.select({
				id: Variant.id,
				name: Variant.name,
				productName: Product.name,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))
			.orderBy(Product.name, Variant.name)
			.limit(200),
		db
			.select({
				id: RatePlan.id,
				name: RatePlan.name,
				variantName: Variant.name,
				productName: Product.name,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Product.providerId, providerId), eq(RatePlan.isActive, true)))
			.orderBy(Product.name, Variant.name, RatePlan.name)
			.limit(250),
		db
			.select({
				id: TaxFeeDefinition.id,
				name: TaxFeeDefinition.name,
				code: TaxFeeDefinition.code,
				status: TaxFeeDefinition.status,
			})
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.providerId, providerId))
			.orderBy(TaxFeeDefinition.name)
			.limit(100),
	])
	return {
		products: products.map((product) => ({
			id: product.id,
			label: `${product.name} · ${product.productType}`,
			entityType: "product",
		})),
		variants: variants.map((variant) => ({
			id: variant.id,
			label: `${variant.productName} / ${variant.name}`,
			entityType: "variant",
			productName: variant.productName,
		})),
		ratePlans: ratePlans.map((ratePlan) => ({
			id: ratePlan.id,
			label: `${ratePlan.productName} / ${ratePlan.variantName} / ${ratePlan.name}`,
			entityType: "rate_plan",
			variantName: ratePlan.variantName,
		})),
		taxes: taxes.map((tax) => ({
			id: tax.id,
			label: `${tax.name} · ${tax.code} · ${tax.status}`,
			entityType: "tax",
		})),
	}
}
