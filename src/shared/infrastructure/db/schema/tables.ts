import {
	boolean,
	check,
	date as pgDate,
	index,
	integer,
	jsonb,
	numeric,
	pgTableCreator,
	primaryKey,
	real,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const pgTable = pgTableCreator((name) => name)

const pk = (name = "id") => text(name).primaryKey()
const txt = (name: string) => text(name).notNull()
const txtOpt = (name: string) => text(name)
const int = (name: string) => integer(name).notNull()
const intOpt = (name: string) => integer(name)
const intDefault = (name: string, value: number) => integer(name).default(value).notNull()
const boolDefault = (name: string, value: boolean) => boolean(name).default(value).notNull()
const boolOpt = (name: string) => boolean(name)
const amount = (name: string) =>
	numeric(name, { precision: 14, scale: 2, mode: "number" }).notNull()
const amountOpt = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" })
const ratioOpt = (name: string) => numeric(name, { precision: 7, scale: 4, mode: "number" })
const day = (name: string) => pgDate(name).notNull()
const dayOpt = (name: string) => pgDate(name)
const ts = (name: string) => timestamp(name, { withTimezone: true })
const tsReq = (name: string) => timestamp(name, { withTimezone: true }).notNull()
const now = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull()

export const Provider = pgTable(
	"Provider",
	{
		id: pk(),
		legalName: txtOpt("legalName"),
		displayName: txtOpt("displayName"),
		status: txtOpt("status"),
		/** Separates real commercial tenants from deliberately non-commercial QA tenants. */
		accountPurpose: text("accountPurpose").default("commercial").notNull(),
		/** Dataset ownership, independent from the tenant's commercial integration purpose. */
		dataClassification: text("dataClassification").default("production").notNull(),
		createdAt: ts("createdAt"),
	},
	(table) => [
		check(
			"Provider_accountPurpose_check",
			sql`${table.accountPurpose} IN ('commercial', 'internal_qa', 'integration_certification')`
		),
		check(
			"Provider_dataClassification_check",
			sql`${table.dataClassification} IN ('production', 'demo', 'fixture')`
		),
		index("Provider_dataClassification_idx").on(table.dataClassification),
	]
)

/**
 * Canonical geographic catalog for marketplace discovery.
 */
export const GeoPlace = pgTable(
	"GeoPlace",
	{
		id: pk(),
		canonicalName: txt("canonicalName"),
		normalizedName: txt("normalizedName"),
		slug: txt("slug"),
		placeType: txt("placeType"),
		countryCode: txt("countryCode"),
		parentId: txtOpt("parentId").references((): AnyPgColumn => GeoPlace.id),
		mergedIntoId: txtOpt("mergedIntoId").references((): AnyPgColumn => GeoPlace.id),
		centroidLat: real("centroidLat"),
		centroidLng: real("centroidLng"),
		boundingBoxJson: jsonb("boundingBoxJson"),
		timezone: txtOpt("timezone"),
		status: text("status").default("active").notNull(),
		source: text("source").default("manual").notNull(),
		sourceRef: txtOpt("sourceRef"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		unique("GeoPlace_country_parent_type_normalized_unique")
			.on(table.countryCode, table.parentId, table.placeType, table.normalizedName)
			.nullsNotDistinct(),
		uniqueIndex("GeoPlace_slug_unique").on(table.slug),
		index("GeoPlace_parent_type_status_idx").on(table.parentId, table.placeType, table.status),
		index("GeoPlace_country_type_status_idx").on(table.countryCode, table.placeType, table.status),
		index("GeoPlace_mergedIntoId_idx").on(table.mergedIntoId),
		check(
			"GeoPlace_placeType_check",
			sql`${table.placeType} IN ('country', 'admin_area_1', 'admin_area_2', 'city', 'locality', 'neighborhood', 'poi', 'natural_area')`
		),
		check("GeoPlace_countryCode_check", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
		check("GeoPlace_status_check", sql`${table.status} IN ('active', 'hidden', 'merged')`),
		check(
			"GeoPlace_coordinates_check",
			sql`(${table.centroidLat} IS NULL AND ${table.centroidLng} IS NULL) OR (${table.centroidLat} BETWEEN -90 AND 90 AND ${table.centroidLng} BETWEEN -180 AND 180)`
		),
		check(
			"GeoPlace_parent_not_self_check",
			sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
		),
		check(
			"GeoPlace_merge_not_self_check",
			sql`${table.mergedIntoId} IS NULL OR ${table.mergedIntoId} <> ${table.id}`
		),
	]
)

/** Materialized transitive hierarchy; phase 3 owns its backfill and maintenance. */
export const GeoPlaceClosure = pgTable(
	"GeoPlaceClosure",
	{
		ancestorId: txt("ancestorId").references(() => GeoPlace.id, { onDelete: "cascade" }),
		descendantId: txt("descendantId").references(() => GeoPlace.id, { onDelete: "cascade" }),
		depth: int("depth"),
		createdAt: now("createdAt"),
	},
	(table) => [
		primaryKey({ name: "GeoPlaceClosure_pkey", columns: [table.ancestorId, table.descendantId] }),
		index("GeoPlaceClosure_descendant_depth_idx").on(table.descendantId, table.depth),
		check("GeoPlaceClosure_depth_check", sql`${table.depth} >= 0`),
		check(
			"GeoPlaceClosure_self_depth_check",
			sql`(${table.ancestorId} = ${table.descendantId} AND ${table.depth} = 0) OR (${table.ancestorId} <> ${table.descendantId} AND ${table.depth} > 0)`
		),
	]
)

/** Localized and historical search names for a canonical geographic place. */
export const GeoPlaceAlias = pgTable(
	"GeoPlaceAlias",
	{
		id: pk(),
		placeId: txt("placeId").references(() => GeoPlace.id, { onDelete: "cascade" }),
		locale: text("locale").default("es").notNull(),
		alias: txt("alias"),
		normalizedAlias: txt("normalizedAlias"),
		aliasType: text("aliasType").default("alternate").notNull(),
		isPreferred: boolDefault("isPreferred", false),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("GeoPlaceAlias_place_locale_normalized_unique").on(
			table.placeId,
			table.locale,
			table.normalizedAlias
		),
		index("GeoPlaceAlias_normalized_locale_idx").on(table.normalizedAlias, table.locale),
		check(
			"GeoPlaceAlias_aliasType_check",
			sql`${table.aliasType} IN ('primary', 'alternate', 'historic', 'transliteration', 'search')`
		),
	]
)

/** Editorial presentation by locale, distinct from the geographic identity. */
export const GeoPlaceContent = pgTable(
	"GeoPlaceContent",
	{
		id: pk(),
		placeId: txt("placeId").references(() => GeoPlace.id, { onDelete: "cascade" }),
		locale: text("locale").default("es").notNull(),
		title: txtOpt("title"),
		summary: txtOpt("summary"),
		seoJson: jsonb("seoJson"),
		heroImageId: txtOpt("heroImageId").references(() => Image.id, { onDelete: "set null" }),
		publicationStatus: text("publicationStatus").default("draft").notNull(),
		featuredRank: intOpt("featuredRank"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("GeoPlaceContent_place_locale_unique").on(table.placeId, table.locale),
		index("GeoPlaceContent_status_rank_idx").on(table.publicationStatus, table.featuredRank),
		check(
			"GeoPlaceContent_publicationStatus_check",
			sql`${table.publicationStatus} IN ('draft', 'published', 'archived')`
		),
	]
)

/** Stable mappings to authoritative geocoders, suppliers and marketplace feeds. */
export const GeoPlaceExternalId = pgTable(
	"GeoPlaceExternalId",
	{
		id: pk(),
		placeId: txt("placeId").references(() => GeoPlace.id, { onDelete: "cascade" }),
		source: txt("source"),
		externalId: txt("externalId"),
		externalUrl: txtOpt("externalUrl"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("GeoPlaceExternalId_source_external_unique").on(table.source, table.externalId),
		uniqueIndex("GeoPlaceExternalId_place_source_external_unique").on(
			table.placeId,
			table.source,
			table.externalId
		),
		index("GeoPlaceExternalId_place_source_idx").on(table.placeId, table.source),
	]
)

export const RoomType = pgTable("RoomType", {
	id: pk(),
	name: txt("name"),
	maxOccupancy: intOpt("maxOccupancy"),
	description: txtOpt("description"),
})

export const AmenityRoom = pgTable("AmenityRoom", {
	id: pk(),
	name: txt("name"),
	category: txtOpt("category"),
})

export const Service = pgTable("Service", {
	id: pk(),
})

export const Image = pgTable(
	"Image",
	{
		id: pk(),
		entityType: txtOpt("entityType"),
		entityId: txtOpt("entityId"),
		objectKey: txt("objectKey"),
		url: txt("url"),
		order: intDefault("order", 0),
		isPrimary: boolDefault("isPrimary", false),
	},
	(table) => [
		index("Image_entityType_entityId_idx").on(table.entityType, table.entityId),
		index("Image_entityId_idx").on(table.entityId),
	]
)

export const ImageUpload = pgTable(
	"ImageUpload",
	{
		id: pk(),
		imageId: txt("imageId").references(() => Image.id),
		objectKey: txt("objectKey"),
		status: text("status").default("pending").notNull(),
		createdAt: now("createdAt"),
		completedAt: ts("completedAt"),
	},
	(table) => [index("ImageUpload_objectKey_status_idx").on(table.objectKey, table.status)]
)

/**
 * Deprecated / unused localization table.
 * Keep physical table for compatibility; do not build new features on it (Fase 6).
 */
export const Translation = pgTable(
	"Translation",
	{
		id: pk(),
		tableRef: txt("tableRef"),
		columnRef: txt("columnRef"),
		recordId: txt("recordId"),
		languageCode: txt("languageCode"),
		translatedText: txt("translatedText"),
	},
	(table) => [
		uniqueIndex("Translation_record_language_unique").on(
			table.tableRef,
			table.columnRef,
			table.recordId,
			table.languageCode
		),
	]
)

export const User = pgTable(
	"User",
	{
		id: pk(),
		email: txt("email"),
		username: txtOpt("username"),
		passwordHash: txtOpt("passwordHash"),
		firstName: txtOpt("firstName"),
		lastName: txtOpt("lastName"),
		registrationDate: now("registrationDate"),
	},
	(table) => [
		uniqueIndex("User_email_unique").on(table.email),
		uniqueIndex("User_username_unique").on(table.username),
	]
)

export const ProviderProfile = pgTable("ProviderProfile", {
	providerId: text("providerId")
		.primaryKey()
		.references(() => Provider.id),
	timezone: txt("timezone"),
	defaultCurrency: text("defaultCurrency").default("USD").notNull(),
	supportEmail: txtOpt("supportEmail"),
	supportPhone: txtOpt("supportPhone"),
	governanceUpdatedAt: ts("governanceUpdatedAt"),
	professionalToolsEnabled: boolDefault("professionalToolsEnabled", false),
	professionalToolsUpdatedAt: ts("professionalToolsUpdatedAt"),
	professionalToolsUpdatedBy: txtOpt("professionalToolsUpdatedBy").references(() => User.id),
})

export const ProviderDocument = pgTable(
	"ProviderDocument",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		type: txt("type"),
		status: text("status").default("pending").notNull(),
		fileUrl: txtOpt("fileUrl"),
		metadataJson: jsonb("metadataJson"),
		reviewNotes: txtOpt("reviewNotes"),
		reviewedAt: ts("reviewedAt"),
		reviewedBy: txtOpt("reviewedBy").references(() => User.id),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderDocument_providerId_type_idx").on(table.providerId, table.type),
		index("ProviderDocument_providerId_status_idx").on(table.providerId, table.status),
	]
)

export const ProviderTaxConfiguration = pgTable(
	"ProviderTaxConfiguration",
	{
		providerId: text("providerId")
			.primaryKey()
			.references(() => Provider.id),
		status: text("status").default("not_configured").notNull(),
		taxResidenceCountry: txtOpt("taxResidenceCountry"),
		businessRegistrationNumber: txtOpt("businessRegistrationNumber"),
		taxRegime: txtOpt("taxRegime"),
		invoicingMode: text("invoicingMode").default("platform_receipt").notNull(),
		metadataJson: jsonb("metadataJson"),
		updatedAt: now("updatedAt"),
		updatedBy: txtOpt("updatedBy").references(() => User.id),
	},
	(table) => [
		index("ProviderTaxConfiguration_status_idx").on(table.status),
		index("ProviderTaxConfiguration_taxResidenceCountry_idx").on(table.taxResidenceCountry),
	]
)

export const ProviderPaymentAccount = pgTable(
	"ProviderPaymentAccount",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		status: text("status").default("not_configured").notNull(),
		provider: txt("provider"),
		currency: txt("currency"),
		accountHolderName: txtOpt("accountHolderName"),
		bankName: txtOpt("bankName"),
		country: txtOpt("country"),
		routingOrSwift: txtOpt("routingOrSwift"),
		accountNumberLast4: txtOpt("accountNumberLast4"),
		accountReference: txtOpt("accountReference"),
		payoutSchedule: text("payoutSchedule").default("manual").notNull(),
		metadataJson: jsonb("metadataJson"),
		verifiedAt: ts("verifiedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderPaymentAccount_providerId_status_idx").on(table.providerId, table.status),
		index("ProviderPaymentAccount_providerId_provider_idx").on(table.providerId, table.provider),
		index("ProviderPaymentAccount_country_idx").on(table.country),
	]
)

export const ProviderIntegrationConnection = pgTable(
	"ProviderIntegrationConnection",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectorKey: txt("connectorKey"),
		displayName: txtOpt("displayName"),
		isPrimary: boolDefault("isPrimary", false),
		/** Aggregate connector lifecycle; detail failures belong to feeds, runs or incidents. */
		status: text("status").default("not_configured").notNull(),
		mode: text("mode").default("sandbox").notNull(),
		scopesJson: jsonb("scopesJson"),
		/** Public HTTPS endpoint only. Authentication material lives in ProviderIntegrationCredential. */
		endpointUrl: txtOpt("endpointUrl"),
		vendorKey: txtOpt("vendorKey"),
		authType: txtOpt("authType"),
		externalPropertyId: txtOpt("externalPropertyId"),
		/** Smoke/preview cache only — not remote-entity SoT. See Phase 6 taxonomy. */
		catalogJson: jsonb("catalogJson"),
		/** Clock for catalogJson freshness (conceptual TTL); not a sync ledger. */
		lastCatalogSyncAt: ts("lastCatalogSyncAt"),
		lastSyncAt: ts("lastSyncAt"),
		lastSyncStatus: txtOpt("lastSyncStatus"),
		errorMessage: txtOpt("errorMessage"),
		syncEnabled: boolDefault("syncEnabled", false),
		syncIntervalMinutes: intDefault("syncIntervalMinutes", 1440),
		nextSyncAt: ts("nextSyncAt"),
		lastAutomaticSyncAt: ts("lastAutomaticSyncAt"),
		consecutiveFailures: intDefault("consecutiveFailures", 0),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderIntegrationConnection_provider_connector_idx").on(
			table.providerId,
			table.connectorKey
		),
		index("ProviderIntegrationConnection_providerId_status_idx").on(table.providerId, table.status),
		index("ProviderIntegrationConnection_provider_connector_primary_idx").on(
			table.providerId,
			table.connectorKey,
			table.isPrimary
		),
		index("ProviderIntegrationConnection_due_sync_idx")
			.on(table.syncEnabled, table.status, table.nextSyncAt)
			.where(sql`${table.syncEnabled} = true AND ${table.status} <> 'revoked'`),
		uniqueIndex("ProviderIntegrationConnection_one_primary_unique")
			.on(table.providerId, table.connectorKey)
			.where(sql`${table.isPrimary} = true`),
		check(
			"ProviderIntegrationConnection_status_check",
			sql`${table.status} IN ('not_configured', 'pending', 'connected', 'requires_attention', 'syncing', 'error', 'revoked')`
		),
		check(
			"ProviderIntegrationConnection_mode_check",
			sql`${table.mode} IN ('sandbox', 'production')`
		),
		check(
			"ProviderIntegrationConnection_endpoint_url_check",
			sql`${table.endpointUrl} IS NULL OR ${table.endpointUrl} ~ '^https://'`
		),
	]
)

export const ProviderIntegrationCredential = pgTable(
	"ProviderIntegrationCredential",
	{
		connectionId: text("connectionId")
			.primaryKey()
			.references(() => ProviderIntegrationConnection.id, { onDelete: "cascade" }),
		providerId: txt("providerId").references(() => Provider.id),
		authType: txt("authType"),
		encryptedJson: jsonb("encryptedJson").notNull(),
		scopesJson: jsonb("scopesJson"),
		tokenExpiresAt: ts("tokenExpiresAt"),
		refreshAfterAt: ts("refreshAfterAt"),
		lastRefreshedAt: ts("lastRefreshedAt"),
		revokedAt: ts("revokedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderIntegrationCredential_provider_idx").on(table.providerId),
		index("ProviderIntegrationCredential_expiry_idx").on(table.providerId, table.tokenExpiresAt),
		check(
			"ProviderIntegrationCredential_auth_type_check",
			sql`${table.authType} IN ('api_key', 'oauth2', 'reference')`
		),
	]
)

export const ProviderIntegrationMapping = pgTable(
	"ProviderIntegrationMapping",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		mappingType: txt("mappingType"),
		localEntityType: txt("localEntityType"),
		localEntityId: txt("localEntityId"),
		externalEntityType: txt("externalEntityType"),
		externalEntityId: txt("externalEntityId"),
		externalEntityName: txtOpt("externalEntityName"),
		direction: text("direction").default("bidirectional").notNull(),
		status: text("status").default("active").notNull(),
		metadataJson: jsonb("metadataJson"),
		lastVerifiedAt: ts("lastVerifiedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("ProviderIntegrationMapping_connection_local_unique").on(
			table.connectionId,
			table.mappingType,
			table.localEntityId
		),
		uniqueIndex("ProviderIntegrationMapping_connection_external_unique").on(
			table.connectionId,
			table.mappingType,
			table.externalEntityId
		),
		index("ProviderIntegrationMapping_provider_status_idx").on(table.providerId, table.status),
		check(
			"ProviderIntegrationMapping_status_check",
			sql`${table.status} IN ('active', 'inactive')`
		),
	]
)

/**
 * Explicit, expiring authorization to run a vendor certification through the real PMS pipeline.
 * It is not a substitute for provider KYC, fiscal approval, or commercial publication.
 */
export const ProviderIntegrationCertification = pgTable(
	"ProviderIntegrationCertification",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		vendorKey: txt("vendorKey"),
		fixtureProductId: txtOpt("fixtureProductId"),
		status: text("status").default("draft").notNull(),
		suiteVersion: txtOpt("suiteVersion"),
		createdBy: txtOpt("createdBy").references(() => User.id, { onDelete: "set null" }),
		activatedBy: txtOpt("activatedBy").references(() => User.id, { onDelete: "set null" }),
		startedAt: ts("startedAt"),
		completedAt: ts("completedAt"),
		expiresAt: ts("expiresAt"),
		evidenceManifestJson: jsonb("evidenceManifestJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderIntegrationCertification_provider_status_idx").on(
			table.providerId,
			table.status
		),
		index("ProviderIntegrationCertification_connection_status_idx").on(
			table.connectionId,
			table.status
		),
		uniqueIndex("ProviderIntegrationCertification_one_active_connection_unique")
			.on(table.connectionId)
			.where(
				sql`${table.status} IN ('draft', 'prepared', 'ready', 'running', 'requires_attention')`
			),
		check(
			"ProviderIntegrationCertification_status_check",
			sql`${table.status} IN ('draft', 'prepared', 'ready', 'running', 'requires_attention', 'completed', 'expired', 'revoked')`
		),
	]
)

export const ProviderIntegrationSyncRun = pgTable(
	"ProviderIntegrationSyncRun",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		/** Nullable because commercial runs are not certification evidence. */
		certificationId: txtOpt("certificationId").references(
			() => ProviderIntegrationCertification.id,
			{ onDelete: "set null" }
		),
		connectorKey: txt("connectorKey"),
		operation: txt("operation"),
		trigger: text("trigger").default("manual").notNull(),
		/** Immutable execution outcome after the run finishes. */
		status: text("status").default("running").notNull(),
		idempotencyKey: txtOpt("idempotencyKey"),
		readCount: intDefault("readCount", 0),
		changedCount: intDefault("changedCount", 0),
		skippedCount: intDefault("skippedCount", 0),
		failedCount: intDefault("failedCount", 0),
		cursor: txtOpt("cursor"),
		errorCode: txtOpt("errorCode"),
		errorMessage: txtOpt("errorMessage"),
		summaryJson: jsonb("summaryJson"),
		requestedBy: txtOpt("requestedBy").references(() => User.id),
		startedAt: now("startedAt"),
		finishedAt: ts("finishedAt"),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("ProviderIntegrationSyncRun_connection_idempotency_unique").on(
			table.connectionId,
			table.idempotencyKey
		),
		index("ProviderIntegrationSyncRun_connection_started_idx").on(
			table.connectionId,
			table.startedAt.desc()
		),
		index("ProviderIntegrationSyncRun_provider_status_started_idx").on(
			table.providerId,
			table.status,
			table.startedAt
		),
		index("ProviderIntegrationSyncRun_certification_started_idx").on(
			table.certificationId,
			table.startedAt.desc()
		),
		index("ProviderIntegrationSyncRun_terminal_retention_idx")
			.on(table.status, table.finishedAt)
			.where(sql`${table.status} <> 'running' AND ${table.finishedAt} IS NOT NULL`),
		check(
			"ProviderIntegrationSyncRun_status_check",
			sql`${table.status} IN ('running', 'succeeded', 'partial', 'failed', 'cancelled')`
		),
	]
)

export const ProviderIntegrationSyncJob = pgTable(
	"ProviderIntegrationSyncJob",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txtOpt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		targetType: text("targetType").default("connection").notNull(),
		targetId: txt("targetId"),
		connectorKey: txt("connectorKey"),
		operation: text("operation").default("connection_test").notNull(),
		/** Queue lifecycle for pending work, not synchronization history. */
		status: text("status").default("queued").notNull(),
		trigger: text("trigger").default("scheduled").notNull(),
		priority: intDefault("priority", 100),
		attempts: intDefault("attempts", 0),
		maxAttempts: intDefault("maxAttempts", 5),
		runAfter: now("runAfter"),
		lockedAt: ts("lockedAt"),
		lockedBy: txtOpt("lockedBy"),
		idempotencyKey: txt("idempotencyKey"),
		lastError: txtOpt("lastError"),
		payloadJson: jsonb("payloadJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
		finishedAt: ts("finishedAt"),
	},
	(table) => [
		uniqueIndex("ProviderIntegrationSyncJob_target_idempotency_unique").on(
			table.targetType,
			table.targetId,
			table.idempotencyKey
		),
		index("ProviderIntegrationSyncJob_claim_due_idx")
			.on(table.targetType, table.priority, table.runAfter, table.createdAt, table.providerId)
			.where(sql`${table.status} = 'queued'`),
		index("ProviderIntegrationSyncJob_provider_status_idx").on(
			table.providerId,
			table.status,
			table.runAfter
		),
		index("ProviderIntegrationSyncJob_terminal_retention_idx")
			.on(table.status, table.finishedAt)
			.where(sql`${table.status} IN ('succeeded', 'failed') AND ${table.finishedAt} IS NOT NULL`),
		check(
			"ProviderIntegrationSyncJob_status_check",
			sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed')`
		),
	]
)

export const ProviderIntegrationIncident = pgTable(
	"ProviderIntegrationIncident",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		syncRunId: txtOpt("syncRunId").references(() => ProviderIntegrationSyncRun.id, {
			onDelete: "set null",
		}),
		mappingId: txtOpt("mappingId").references(() => ProviderIntegrationMapping.id, {
			onDelete: "set null",
		}),
		dedupeKey: txt("dedupeKey"),
		code: txt("code"),
		category: txt("category"),
		severity: text("severity").default("warning").notNull(),
		/** Lifecycle of an actionable technical problem. */
		status: text("status").default("open").notNull(),
		title: txt("title"),
		description: txt("description"),
		actionLabel: txtOpt("actionLabel"),
		actionHref: txtOpt("actionHref"),
		entityType: txtOpt("entityType"),
		entityId: txtOpt("entityId"),
		occurrenceCount: intDefault("occurrenceCount", 1),
		firstSeenAt: now("firstSeenAt"),
		lastSeenAt: now("lastSeenAt"),
		resolvedAt: ts("resolvedAt"),
		resolvedBy: txtOpt("resolvedBy").references(() => User.id),
		resolutionNote: txtOpt("resolutionNote"),
		notificationStatus: text("notificationStatus").default("pending").notNull(),
		notificationChannelsJson: jsonb("notificationChannelsJson"),
		notificationAttemptCount: intDefault("notificationAttemptCount", 0),
		notifiedAt: ts("notifiedAt"),
		notificationError: txtOpt("notificationError"),
		metadataJson: jsonb("metadataJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("ProviderIntegrationIncident_connection_dedupe_unique").on(
			table.connectionId,
			table.dedupeKey
		),
		index("ProviderIntegrationIncident_provider_status_severity_idx").on(
			table.providerId,
			table.status,
			table.severity
		),
		index("ProviderIntegrationIncident_connection_last_seen_idx").on(
			table.connectionId,
			table.lastSeenAt
		),
		index("ProviderIntegrationIncident_open_last_seen_idx")
			.on(table.lastSeenAt.desc())
			.where(sql`${table.status} = 'open'`),
		check("ProviderIntegrationIncident_status_check", sql`${table.status} IN ('open', 'resolved')`),
		check(
			"ProviderIntegrationIncident_severity_check",
			sql`${table.severity} IN ('info', 'warning', 'error', 'critical')`
		),
	]
)

export const ProviderAuditLog = pgTable(
	"ProviderAuditLog",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		actorUserId: txtOpt("actorUserId").references(() => User.id),
		action: txt("action"),
		entityType: txt("entityType"),
		entityId: txtOpt("entityId"),
		beforeJson: jsonb("beforeJson"),
		afterJson: jsonb("afterJson"),
		riskLevel: text("riskLevel").default("low").notNull(),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("ProviderAuditLog_provider_created_idx").on(table.providerId, table.createdAt),
		index("ProviderAuditLog_provider_entity_type_idx").on(table.providerId, table.entityType),
	]
)

export const ProviderComplianceAssignment = pgTable(
	"ProviderComplianceAssignment",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		domain: txt("domain"),
		entityId: txt("entityId"),
		assigneeEmail: txtOpt("assigneeEmail"),
		slaHours: intDefault("slaHours", 48),
		slaDueAt: tsReq("slaDueAt"),
		status: text("status").default("open").notNull(),
		notes: txtOpt("notes"),
		createdBy: txtOpt("createdBy").references(() => User.id),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderComplianceAssignment_provider_domain_status_idx").on(
			table.providerId,
			table.domain,
			table.status
		),
		index("ProviderComplianceAssignment_slaDueAt_idx").on(table.slaDueAt),
		index("ProviderComplianceAssignment_provider_entity_idx").on(table.providerId, table.entityId),
	]
)

export const ProviderConfigurationState = pgTable(
	"ProviderConfigurationState",
	{
		providerId: text("providerId")
			.primaryKey()
			.references(() => Provider.id),
		canPublish: boolDefault("canPublish", false),
		canAcceptBookings: boolDefault("canAcceptBookings", false),
		canCollectPayments: boolDefault("canCollectPayments", false),
		canUseIntegrations: boolDefault("canUseIntegrations", false),
		readinessPercent: intDefault("readinessPercent", 0),
		readinessJson: jsonb("readinessJson"),
		countsJson: jsonb("countsJson"),
		blockersJson: jsonb("blockersJson"),
		risksJson: jsonb("risksJson"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderConfigurationState_canPublish_idx").on(table.canPublish),
		index("ProviderConfigurationState_canAcceptBookings_idx").on(table.canAcceptBookings),
		index("ProviderConfigurationState_canCollectPayments_idx").on(table.canCollectPayments),
	]
)

export const ProviderVerification = pgTable(
	"ProviderVerification",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		status: text("status").default("pending").notNull(),
		reason: txtOpt("reason"),
		reviewedAt: ts("reviewedAt"),
		reviewedBy: txtOpt("reviewedBy").references(() => User.id),
		metadataJson: jsonb("metadataJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("ProviderVerification_providerId_status_idx").on(table.providerId, table.status),
		index("ProviderVerification_providerId_created_idx").on(
			table.providerId,
			table.createdAt,
			table.id
		),
	]
)

export const ProviderUser = pgTable(
	"ProviderUser",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		userId: txt("userId").references(() => User.id),
		role: text("role").default("owner").notNull(),
		permissionsJson: jsonb("permissionsJson"),
		workspaceExperience: text("workspaceExperience").default("essential").notNull(),
		workspaceExperienceUpdatedAt: ts("workspaceExperienceUpdatedAt"),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("ProviderUser_providerId_userId_unique").on(table.providerId, table.userId),
	]
)

export const ProviderInvitation = pgTable(
	"ProviderInvitation",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		email: txt("email"),
		role: txt("role"),
		status: text("status").default("pending").notNull(),
		token: txtOpt("token"),
		invitedBy: txt("invitedBy").references(() => User.id),
		acceptedAt: ts("acceptedAt"),
		expiresAt: tsReq("expiresAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderInvitation_providerId_status_idx").on(table.providerId, table.status),
		index("ProviderInvitation_providerId_email_idx").on(table.providerId, table.email),
		uniqueIndex("ProviderInvitation_token_unique").on(table.token),
		index("ProviderInvitation_providerId_created_idx").on(
			table.providerId,
			table.createdAt,
			table.id
		),
	]
)

export const Product = pgTable(
	"Product",
	{
		id: pk(),
		name: txt("name"),
		productType: txt("productType"),
		creationDate: now("creationDate"),
		lastUpdated: now("lastUpdated"),
		providerId: txtOpt("providerId").references(() => Provider.id),
		dataClass: text("dataClass").default("production").notNull(),
	},
	(table) => [
		index("Product_providerId_productType_idx").on(table.providerId, table.productType),
		index("Product_providerId_idx").on(table.providerId),
	]
)

/** Product discovery geography. */
export const ProductGeoPlace = pgTable(
	"ProductGeoPlace",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id, { onDelete: "cascade" }),
		placeId: txt("placeId").references(() => GeoPlace.id),
		role: text("role").default("primary_discovery").notNull(),
		isPrimary: boolDefault("isPrimary", false),
		source: text("source").default("manual").notNull(),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("ProductGeoPlace_product_place_role_unique").on(
			table.productId,
			table.placeId,
			table.role
		),
		uniqueIndex("ProductGeoPlace_one_primary_product_unique")
			.on(table.productId)
			.where(sql`${table.isPrimary} = true`),
		index("ProductGeoPlace_place_role_product_idx").on(table.placeId, table.role, table.productId),
		index("ProductGeoPlace_product_role_idx").on(table.productId, table.role),
		check(
			"ProductGeoPlace_role_check",
			sql`${table.role} IN ('primary_discovery', 'secondary_discovery', 'service_area', 'meeting_area')`
		),
		check(
			"ProductGeoPlace_primary_role_check",
			sql`${table.isPrimary} = false OR ${table.role} = 'primary_discovery'`
		),
	]
)

/** Immutable record of administrative changes to canonical product geography. */
export const ProductGeoPlaceActivity = pgTable(
	"ProductGeoPlaceActivity",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id, { onDelete: "cascade" }),
		previousPlaceId: txtOpt("previousPlaceId").references(() => GeoPlace.id),
		placeId: txt("placeId").references(() => GeoPlace.id),
		actorId: txtOpt("actorId").references(() => User.id),
		source: txt("source"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("ProductGeoPlaceActivity_product_created_idx").on(table.productId, table.createdAt),
	]
)

/** Immutable operational evidence for the controlled public-to-receipt certification suite. */
export const MarketplaceCommercialCertificationRun = pgTable(
	"MarketplaceCommercialCertificationRun",
	{
		id: pk(),
		suiteVersion: txt("suiteVersion"),
		status: text("status").default("prepared").notNull(),
		providerId: txtOpt("providerId").references(() => Provider.id),
		hotelProductId: txtOpt("hotelProductId").references(() => Product.id),
		tourProductId: txtOpt("tourProductId").references(() => Product.id),
		checkIn: dayOpt("checkIn"),
		checkOut: dayOpt("checkOut"),
		evidenceJson: jsonb("evidenceJson").notNull(),
		failureJson: jsonb("failureJson"),
		startedAt: now("startedAt"),
		completedAt: ts("completedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("MarketplaceCommercialCertificationRun_suite_started_unique").on(
			table.suiteVersion,
			table.startedAt
		),
		index("MarketplaceCommercialCertificationRun_status_started_idx").on(
			table.status,
			table.startedAt.desc()
		),
		check(
			"MarketplaceCommercialCertificationRun_status_check",
			sql`${table.status} IN ('prepared', 'running', 'passed', 'failed')`
		),
	]
)

export const ProductOperationalSurface = pgTable(
	"ProductOperationalSurface",
	{
		productId: text("productId")
			.primaryKey()
			.references(() => Product.id),
		providerId: txt("providerId").references(() => Provider.id),
		productName: txt("productName"),
		productType: txt("productType"),
		status: text("status").default("draft").notNull(),
		readinessJson: jsonb("readinessJson"),
		subtypeSummary: txtOpt("subtypeSummary"),
		imagePreviewJson: jsonb("imagePreviewJson"),
		coverImageJson: jsonb("coverImageJson"),
		variantCount: intDefault("variantCount", 0),
		activeVariantCount: intDefault("activeVariantCount", 0),
		defaultRatePlanIdsJson: jsonb("defaultRatePlanIdsJson"),
		policyCoverageStateJson: jsonb("policyCoverageStateJson"),
		conditionsHref: txtOpt("conditionsHref"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProductOperationalSurface_provider_updated_idx").on(table.providerId, table.updatedAt),
		index("ProductOperationalSurface_provider_status_idx").on(table.providerId, table.status),
	]
)

export const HouseRule = pgTable(
	"HouseRule",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		type: txt("type"),
		payloadJson: jsonb("payloadJson").notNull(),
		createdAt: now("createdAt"),
	},
	(table) => [index("HouseRule_productId_type_idx").on(table.productId, table.type)]
)

/** Marketplace category taxonomy (Things to Do / Experiences discovery). */
export const ProductCategory = pgTable(
	"ProductCategory",
	{
		id: pk(),
		slug: txt("slug"),
		name: txt("name"),
		vertical: txt("vertical"),
		sortOrder: intDefault("sortOrder", 0),
		isActive: boolDefault("isActive", true),
		dataClass: text("dataClass").default("production").notNull(),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("ProductCategory_slug_unique").on(table.slug),
		index("ProductCategory_vertical_idx").on(table.vertical),
	]
)

export const ProductCategoryLink = pgTable(
	"ProductCategoryLink",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		categoryId: txt("categoryId").references(() => ProductCategory.id),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("ProductCategoryLink_product_category_unique").on(
			table.productId,
			table.categoryId
		),
		index("ProductCategoryLink_categoryId_idx").on(table.categoryId),
		index("ProductCategoryLink_productId_idx").on(table.productId),
	]
)

export const ProductReview = pgTable(
	"ProductReview",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		userId: txtOpt("userId").references(() => User.id),
		/** Verified post-activity review — one per booking when set. */
		bookingId: txtOpt("bookingId").references(() => Booking.id),
		rating: int("rating"),
		body: txtOpt("body"),
		status: text("status").default("pending").notNull(),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProductReview_product_status_idx").on(table.productId, table.status),
		index("ProductReview_product_rating_idx").on(table.productId, table.rating),
		index("ProductReview_bookingId_idx").on(table.bookingId),
		uniqueIndex("ProductReview_bookingId_unique").on(table.bookingId),
		check("ProductReview_rating_check", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
		check(
			"ProductReview_status_check",
			sql`${table.status} in ('published', 'pending', 'rejected', 'hidden')`
		),
	]
)

/** Guest marketplace telemetry for cross-sell attribution. */
export const MarketplaceEvent = pgTable(
	"MarketplaceEvent",
	{
		id: pk(),
		eventType: txt("eventType"),
		surface: txt("surface"),
		sourceProductId: txtOpt("sourceProductId").references(() => Product.id),
		targetProductId: txtOpt("targetProductId").references(() => Product.id),
		geoPlaceId: txtOpt("geoPlaceId").references(() => GeoPlace.id),
		bookingId: txtOpt("bookingId").references(() => Booking.id),
		sessionId: txtOpt("sessionId"),
		metaJson: jsonb("metaJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("MarketplaceEvent_surface_created_idx").on(table.surface, table.createdAt),
		index("MarketplaceEvent_target_created_idx").on(table.targetProductId, table.createdAt),
		check(
			"MarketplaceEvent_eventType_check",
			sql`${table.eventType} in ('impression', 'click', 'booking_attributed')`
		),
	]
)

/** Private salida quote requests — no inventory hold until provider accepts. */
export const TourPrivateRequest = pgTable(
	"TourPrivateRequest",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		variantId: txt("variantId").references(() => Variant.id),
		providerId: txt("providerId").references(() => Provider.id),
		userId: txtOpt("userId").references(() => User.id),
		departureDate: day("departureDate"),
		// A private request cannot be priced or accepted without the requested party.
		partyJson: jsonb("partyJson").notNull(),
		contactName: txt("contactName"),
		contactEmail: txt("contactEmail"),
		contactPhone: txtOpt("contactPhone"),
		message: txtOpt("message"),
		status: text("status").default("pending").notNull(),
		slaDueAt: ts("slaDueAt"),
		providerNote: txtOpt("providerNote"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("TourPrivateRequest_provider_status_idx").on(
			table.providerId,
			table.status,
			table.createdAt
		),
		index("TourPrivateRequest_product_idx").on(table.productId, table.departureDate),
		check(
			"TourPrivateRequest_status_check",
			sql`${table.status} in ('pending', 'accepted', 'declined', 'expired', 'cancelled')`
		),
	]
)

export const ProductStatus = pgTable("ProductStatus", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	state: text("state").default("draft").notNull(),
	validationErrorsJson: jsonb("validationErrorsJson"),
})

export const ProductPreparationSnapshot = pgTable(
	"ProductPreparationSnapshot",
	{
		productId: text("productId")
			.primaryKey()
			.references(() => Product.id),
		providerId: txt("providerId").references(() => Provider.id),
		status: text("status").default("draft").notNull(),
		statusLabel: text("statusLabel").default("En preparación").notNull(),
		statusVariant: text("statusVariant").default("warning").notNull(),
		isPublished: boolDefault("isPublished", false),
		readinessPercent: intDefault("readinessPercent", 0),
		blockerCount: intDefault("blockerCount", 0),
		blockerPreviewJson: jsonb("blockerPreviewJson"),
		readyToPublish: boolDefault("readyToPublish", false),
		continuePreparationHref: txt("continuePreparationHref"),
		previewHref: txt("previewHref"),
		nextStepLabel: txtOpt("nextStepLabel"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProductPreparationSnapshot_provider_updated_idx").on(table.providerId, table.updatedAt),
		index("ProductPreparationSnapshot_provider_ready_idx").on(
			table.providerId,
			table.readyToPublish
		),
		index("ProductPreparationSnapshot_provider_status_idx").on(table.providerId, table.status),
	]
)

export const ProductContent = pgTable("ProductContent", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	description: txtOpt("description"),
	highlightsJson: jsonb("highlightsJson"),
	seoJson: jsonb("seoJson"),
	dataClass: text("dataClass").default("production").notNull(),
})

export const ProductLocation = pgTable("ProductLocation", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	address: txtOpt("address"),
	lat: real("lat"),
	lng: real("lng"),
})

export const Hotel = pgTable("Hotel", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	stars: intOpt("stars"),
	phone: txtOpt("phone"),
	email: txtOpt("email"),
	website: txtOpt("website"),
})

export const Tour = pgTable(
	"Tour",
	{
		productId: text("productId")
			.primaryKey()
			.references(() => Product.id),
		duration: txtOpt("duration"),
		durationMinutes: intOpt("durationMinutes"),
		difficultyLevel: txtOpt("difficultyLevel"),
		meetingPointJson: jsonb("meetingPointJson"),
		itineraryJson: jsonb("itineraryJson"),
		safetyJson: jsonb("safetyJson"),
		guideJson: jsonb("guideJson"),
		includesJson: jsonb("includesJson"),
		excludesJson: jsonb("excludesJson"),
		categoriesJson: jsonb("categoriesJson"),
		pickupJson: jsonb("pickupJson"),
	},
	(table) => [
		index("Tour_durationMinutes_idx").on(table.durationMinutes),
		index("Tour_difficultyLevel_idx").on(table.difficultyLevel),
	]
)

export const Package = pgTable("Package", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	days: intOpt("days"),
	nights: intOpt("nights"),
	itineraryJson: jsonb("itineraryJson"),
	includesJson: jsonb("includesJson"),
	excludesJson: jsonb("excludesJson"),
})

export const Limousine = pgTable("Limousine", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	vehicleProfileJson: jsonb("vehicleProfileJson"),
	pickupJson: jsonb("pickupJson"),
	dropoffJson: jsonb("dropoffJson"),
	passengerCapacity: intOpt("passengerCapacity"),
	luggageCapacity: intOpt("luggageCapacity"),
})

export const Variant = pgTable(
	"Variant",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		name: txt("name"),
		description: txtOpt("description"),
		kind: txt("kind"),
		status: txtOpt("status"),
		createdAt: ts("createdAt"),
		confirmationType: text("confirmationType").default("instant").notNull(),
		externalCode: txtOpt("externalCode"),
		isActive: boolDefault("isActive", true),
	},
	(table) => [
		index("Variant_productId_isActive_idx").on(table.productId, table.isActive),
		index("Variant_productId_kind_idx").on(table.productId, table.kind),
	]
)

export const InventoryResource = pgTable(
	"InventoryResource",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		variantId: txt("variantId").references(() => Variant.id),
		label: txt("label"),
		status: text("status").default("active").notNull(),
		externalCode: txtOpt("externalCode"),
		metadataJson: jsonb("metadataJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("InventoryResource_provider_variant_status_idx").on(
			table.providerId,
			table.variantId,
			table.status
		),
		uniqueIndex("InventoryResource_variant_label_unique").on(table.variantId, table.label),
	]
)

export const ProviderExternalCalendar = pgTable(
	"ProviderExternalCalendar",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id, {
			onDelete: "cascade",
		}),
		variantId: txt("variantId").references(() => Variant.id),
		resourceId: txtOpt("resourceId").references(() => InventoryResource.id),
		name: txt("name"),
		feedUrlEncrypted: jsonb("feedUrlEncrypted").notNull(),
		feedUrlHost: txt("feedUrlHost"),
		feedUrlFingerprint: txt("feedUrlFingerprint"),
		/** Operational state of this individual inbound feed. */
		status: text("status").default("pending").notNull(),
		lastSyncAt: ts("lastSyncAt"),
		lastSyncStatus: txtOpt("lastSyncStatus"),
		lastError: txtOpt("lastError"),
		lastEventCount: intDefault("lastEventCount", 0),
		etag: txtOpt("etag"),
		lastModified: txtOpt("lastModified"),
		syncEnabled: boolDefault("syncEnabled", true),
		syncIntervalMinutes: intDefault("syncIntervalMinutes", 1440),
		nextSyncAt: now("nextSyncAt"),
		lastAutomaticSyncAt: ts("lastAutomaticSyncAt"),
		consecutiveFailures: intDefault("consecutiveFailures", 0),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderExternalCalendar_provider_status_idx").on(table.providerId, table.status),
		index("ProviderExternalCalendar_variant_status_idx").on(table.variantId, table.status),
		index("ProviderExternalCalendar_resource_status_idx").on(table.resourceId, table.status),
		index("ProviderExternalCalendar_due_sync_idx")
			.on(table.nextSyncAt, table.id)
			.where(sql`${table.syncEnabled} = true AND ${table.status} <> 'revoked'`),
		uniqueIndex("ProviderExternalCalendar_provider_variant_fingerprint_unique").on(
			table.providerId,
			table.variantId,
			table.feedUrlFingerprint
		),
		check(
			"ProviderExternalCalendar_status_check",
			sql`${table.status} IN ('pending', 'active', 'error', 'revoked')`
		),
	]
)

export const ProviderExternalCalendarEvent = pgTable(
	"ProviderExternalCalendarEvent",
	{
		id: pk(),
		calendarId: txt("calendarId").references(() => ProviderExternalCalendar.id, {
			onDelete: "cascade",
		}),
		providerId: txt("providerId").references(() => Provider.id),
		variantId: txt("variantId").references(() => Variant.id),
		resourceId: txtOpt("resourceId").references(() => InventoryResource.id),
		sourceKey: txt("sourceKey"),
		externalUid: txt("externalUid"),
		summary: txtOpt("summary"),
		startDate: day("startDate"),
		endDate: day("endDate"),
		sourceUpdatedAt: ts("sourceUpdatedAt"),
		fingerprint: txt("fingerprint"),
		isActive: boolDefault("isActive", true),
		firstSeenAt: now("firstSeenAt"),
		lastSeenAt: now("lastSeenAt"),
	},
	(table) => [
		uniqueIndex("ProviderExternalCalendarEvent_calendar_source_unique").on(
			table.calendarId,
			table.sourceKey
		),
		index("ProviderExternalCalendarEvent_variant_active_range_idx")
			.on(table.variantId, table.startDate, table.endDate)
			.where(sql`${table.isActive} = true`),
		index("ProviderExternalCalendarEvent_resource_active_range_idx")
			.on(table.resourceId, table.startDate, table.endDate)
			.where(sql`${table.isActive} = true AND ${table.resourceId} IS NOT NULL`),
		index("ProviderExternalCalendarEvent_calendar_active_idx").on(table.calendarId, table.isActive),
		index("ProviderExternalCalendarEvent_inactive_retention_idx")
			.on(table.lastSeenAt)
			.where(sql`${table.isActive} = false`),
		index("ProviderExternalCalendarEvent_ended_retention_idx").on(table.endDate),
	]
)

export const ProviderExternalCalendarConflict = pgTable(
	"ProviderExternalCalendarConflict",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		calendarId: txt("calendarId").references(() => ProviderExternalCalendar.id, {
			onDelete: "cascade",
		}),
		variantId: txt("variantId").references(() => Variant.id),
		resourceId: txtOpt("resourceId").references(() => InventoryResource.id),
		kind: txt("kind"),
		/** Host decision state for an operational overlap alert. */
		status: text("status").default("open").notNull(),
		dedupeKey: txt("dedupeKey"),
		startDate: day("startDate"),
		endDate: day("endDate"),
		title: txt("title"),
		description: txt("description"),
		actionLabel: txtOpt("actionLabel"),
		resolutionNote: txtOpt("resolutionNote"),
		actedAt: ts("actedAt"),
		actedBy: txtOpt("actedBy").references(() => User.id),
		firstSeenAt: now("firstSeenAt"),
		lastSeenAt: now("lastSeenAt"),
		metadataJson: jsonb("metadataJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("ProviderExternalCalendarConflict_calendar_dedupe_unique").on(
			table.calendarId,
			table.dedupeKey
		),
		index("ProviderExternalCalendarConflict_provider_status_idx").on(
			table.providerId,
			table.status,
			table.lastSeenAt
		),
		index("ProviderExternalCalendarConflict_calendar_status_idx").on(
			table.calendarId,
			table.status
		),
		check(
			"ProviderExternalCalendarConflict_status_check",
			sql`${table.status} IN ('open', 'accepted', 'ignored', 'resolved')`
		),
	]
)

export const ProviderExternalCalendarExport = pgTable(
	"ProviderExternalCalendarExport",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		variantId: txt("variantId").references(() => Variant.id),
		label: txt("label"),
		tokenHash: txt("tokenHash"),
		status: text("status").default("active").notNull(),
		lastDownloadedAt: ts("lastDownloadedAt"),
		downloadCount: intDefault("downloadCount", 0),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderExternalCalendarExport_provider_status_idx").on(table.providerId, table.status),
		index("ProviderExternalCalendarExport_variant_status_idx").on(table.variantId, table.status),
		uniqueIndex("ProviderExternalCalendarExport_token_unique").on(table.tokenHash),
		check(
			"ProviderExternalCalendarExport_status_check",
			sql`${table.status} IN ('active', 'revoked')`
		),
	]
)

export const VariantCapacity = pgTable("VariantCapacity", {
	variantId: text("variantId")
		.primaryKey()
		.references(() => Variant.id),
	minOccupancy: int("minOccupancy"),
	maxOccupancy: int("maxOccupancy"),
	maxAdults: intOpt("maxAdults"),
	maxChildren: intOpt("maxChildren"),
})

export const VariantRoomProfile = pgTable(
	"VariantRoomProfile",
	{
		variantId: text("variantId")
			.primaryKey()
			.references(() => Variant.id),
		roomTypeId: txtOpt("roomTypeId").references(() => RoomType.id),
		sizeM2: intOpt("sizeM2"),
		viewType: txtOpt("viewType"),
		bathroomCount: intOpt("bathroomCount"),
		bathroomType: txtOpt("bathroomType"),
		hasBalcony: boolOpt("hasBalcony"),
		guestFacingNotes: txtOpt("guestFacingNotes"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [index("VariantRoomProfile_roomTypeId_idx").on(table.roomTypeId)]
)

/** One row per tour_slot Variant: clock time + pax + language + booking mode. */
export const TourSlotProfile = pgTable(
	"TourSlotProfile",
	{
		variantId: text("variantId")
			.primaryKey()
			.references(() => Variant.id),
		departureTime: txt("departureTime"),
		/** Optional override of Tour.durationMinutes for this salida. */
		durationMinutes: intOpt("durationMinutes"),
		maxPax: int("maxPax"),
		languageCode: txt("languageCode"),
		bookingMode: text("bookingMode").notNull().default("shared"),
		meetingPointOverrideJson: jsonb("meetingPointOverrideJson"),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("TourSlotProfile_departureTime_idx").on(table.departureTime),
		index("TourSlotProfile_languageCode_idx").on(table.languageCode),
		index("TourSlotProfile_bookingMode_idx").on(table.bookingMode),
		check("TourSlotProfile_bookingMode_check", sql`${table.bookingMode} in ('shared', 'private')`),
		check("TourSlotProfile_maxPax_check", sql`${table.maxPax} >= 1`),
	]
)

/**
 * Date-specific operational metadata for a reusable tour_slot. Sellability remains
 * exclusively in DailyInventory; this row never owns capacity or pricing.
 */
export const TourDepartureInstance = pgTable(
	"TourDepartureInstance",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		variantId: txt("variantId").references(() => Variant.id),
		date: day("date"),
		departureTimeOverride: txtOpt("departureTimeOverride"),
		meetingPointOverrideJson: jsonb("meetingPointOverrideJson"),
		notes: txtOpt("notes"),
		isCancelled: boolDefault("isCancelled", false),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("TourDepartureInstance_variant_date_unique").on(table.variantId, table.date),
		index("TourDepartureInstance_provider_date_idx").on(table.providerId, table.date),
	]
)

/** Provider-owned operational resources. They are not inventory and cannot be sold. */
export const TourOperationalResource = pgTable(
	"TourOperationalResource",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		userId: txtOpt("userId").references(() => User.id),
		type: txt("type"), // guide | vehicle | pickup_coordinator
		name: txt("name"),
		status: text("status").default("active").notNull(),
		languagesJson: jsonb("languagesJson"),
		capacity: intOpt("capacity"),
		credentialsJson: jsonb("credentialsJson"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("TourOperationalResource_provider_type_status_idx").on(
			table.providerId,
			table.type,
			table.status
		),
	]
)

/** Effective resource assignment at the variant + date operational grain. */
export const TourResourceAssignment = pgTable(
	"TourResourceAssignment",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		variantId: txt("variantId").references(() => Variant.id),
		date: day("date"),
		resourceId: txt("resourceId").references(() => TourOperationalResource.id),
		role: txt("role"), // lead_guide | vehicle | pickup
		status: text("status").default("assigned").notNull(),
		assignedBy: txtOpt("assignedBy").references(() => User.id),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("TourResourceAssignment_variant_date_role_unique").on(
			table.variantId,
			table.date,
			table.role
		),
		uniqueIndex("TourResourceAssignment_resource_date_unique").on(table.resourceId, table.date),
	]
)

/** Age-band / ticket types for a tour product (Viator-style adult|child|infant|custom). */
export const TourTicketType = pgTable(
	"TourTicketType",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		code: txt("code"),
		label: txt("label"),
		minAge: intOpt("minAge"),
		maxAge: intOpt("maxAge"),
		sortOrder: intDefault("sortOrder", 0),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("TourTicketType_product_code_unique").on(table.productId, table.code),
		index("TourTicketType_productId_idx").on(table.productId),
		check(
			"TourTicketType_code_check",
			sql`${table.code} in ('adult', 'child', 'infant', 'custom')`
		),
	]
)

/** Questions collected from the lead traveler before confirming a Tour booking. */
export const TourBookingQuestion = pgTable(
	"TourBookingQuestion",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		code: txt("code"),
		label: txt("label"),
		isRequired: boolDefault("isRequired", false),
		sortOrder: intDefault("sortOrder", 0),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [index("TourBookingQuestion_product_sort_idx").on(table.productId, table.sortOrder)]
)

export const VariantRoomBed = pgTable(
	"VariantRoomBed",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		bedType: txt("bedType"),
		count: intDefault("count", 1),
		roomLabel: txtOpt("roomLabel"),
		sortOrder: intDefault("sortOrder", 0),
	},
	(table) => [index("VariantRoomBed_variantId_idx").on(table.variantId)]
)

export const VariantRoomAmenity = pgTable(
	"VariantRoomAmenity",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		amenityId: txt("amenityId").references(() => AmenityRoom.id),
		isAvailable: boolDefault("isAvailable", true),
		notes: txtOpt("notes"),
	},
	(table) => [
		uniqueIndex("VariantRoomAmenity_variantId_amenityId_unique").on(
			table.variantId,
			table.amenityId
		),
	]
)

export const VariantReadiness = pgTable("VariantReadiness", {
	variantId: text("variantId")
		.primaryKey()
		.references(() => Variant.id),
	state: text("state").default("draft").notNull(),
	validationErrorsJson: jsonb("validationErrorsJson"),
	updatedAt: now("updatedAt"),
})

export const ProductService = pgTable(
	"ProductService",
	{
		id: pk(),
		productId: txt("productId").references(() => Product.id),
		serviceId: txt("serviceId").references(() => Service.id),
		price: amountOpt("price"),
		currency: txtOpt("currency"),
		priceUnit: txtOpt("priceUnit"),
		appliesTo: text("appliesTo").default("both").notNull(),
		notes: txtOpt("notes"),
	},
	(table) => [
		uniqueIndex("ProductService_productId_serviceId_unique").on(table.productId, table.serviceId),
	]
)

export const ProductServiceAttribute = pgTable(
	"ProductServiceAttribute",
	{
		id: pk(),
		productServiceId: txt("productServiceId").references(() => ProductService.id),
		key: txt("key"),
		value: txt("value"),
	},
	(table) => [
		index("ProductServiceAttribute_productServiceId_key_idx").on(table.productServiceId, table.key),
	]
)

export const PolicyGroup = pgTable(
	"PolicyGroup",
	{
		id: pk(),
		category: txt("category"),
		ownerProviderId: txt("ownerProviderId").references(() => Provider.id),
	},
	(table) => [
		index("PolicyGroup_ownerProviderId_category_idx").on(table.ownerProviderId, table.category),
	]
)

export const Policy = pgTable(
	"Policy",
	{
		id: pk(),
		groupId: txt("groupId").references(() => PolicyGroup.id),
		description: txt("description"),
		version: int("version"),
		status: text("status").default("draft").notNull(),
		policyPresetKey: txtOpt("policyPresetKey"),
		stayLengthType: txtOpt("stayLengthType"),
		gracePeriod: intOpt("gracePeriod"),
		refundBasis: txtOpt("refundBasis"),
		payoutBasis: txtOpt("payoutBasis"),
		localTimezone: txtOpt("localTimezone"),
		effectiveFrom: dayOpt("effectiveFrom"),
		effectiveTo: dayOpt("effectiveTo"),
	},
	(table) => [
		uniqueIndex("Policy_groupId_version_unique").on(table.groupId, table.version),
		index("Policy_groupId_status_version_idx").on(table.groupId, table.status, table.version),
		index("Policy_groupId_status_effective_range_idx").on(
			table.groupId,
			table.status,
			table.effectiveFrom,
			table.effectiveTo
		),
		index("Policy_groupId_preset_status_idx").on(
			table.groupId,
			table.policyPresetKey,
			table.status
		),
	]
)

export const PolicyAssignment = pgTable(
	"PolicyAssignment",
	{
		id: pk(),
		policyGroupId: txt("policyGroupId").references(() => PolicyGroup.id),
		category: txt("category"),
		scope: txt("scope"),
		scopeId: txt("scopeId"),
		channel: txtOpt("channel"),
		effectiveFrom: dayOpt("effectiveFrom"),
		effectiveTo: dayOpt("effectiveTo"),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("PolicyAssignment_scope_resolution_idx").on(
			table.scope,
			table.scopeId,
			table.category,
			table.channel,
			table.isActive
		),
		index("PolicyAssignment_scope_active_range_idx").on(
			table.scope,
			table.scopeId,
			table.category,
			table.isActive,
			table.effectiveFrom,
			table.effectiveTo
		),
		index("PolicyAssignment_effective_range_idx").on(table.effectiveFrom, table.effectiveTo),
		index("PolicyAssignment_group_active_idx").on(table.policyGroupId, table.isActive),
	]
)

export const CancellationTier = pgTable(
	"CancellationTier",
	{
		id: pk(),
		policyId: txt("policyId").references(() => Policy.id),
		daysBeforeArrival: int("daysBeforeArrival"),
		/** When set, this lead-time (hours before departure) prevails over daysBeforeArrival. */
		hoursBeforeDeparture: intOpt("hoursBeforeDeparture"),
		penaltyType: text("penaltyType").default("percentage").notNull(),
		penaltyAmount: amountOpt("penaltyAmount"),
	},
	(table) => [
		uniqueIndex("CancellationTier_policyId_daysBeforeArrival_unique").on(
			table.policyId,
			table.daysBeforeArrival
		),
		index("CancellationTier_hoursBeforeDeparture_idx").on(table.hoursBeforeDeparture),
	]
)

export const PolicyRule = pgTable(
	"PolicyRule",
	{
		id: pk(),
		policyId: txt("policyId").references(() => Policy.id),
		ruleKey: txt("ruleKey"),
		ruleValue: jsonb("ruleValue"),
	},
	(table) => [uniqueIndex("PolicyRule_policyId_ruleKey_unique").on(table.policyId, table.ruleKey)]
)

export const PolicyExceptionRule = pgTable(
	"PolicyExceptionRule",
	{
		id: pk(),
		type: txt("type"),
		scope: text("scope").default("global").notNull(),
		scopeId: txtOpt("scopeId"),
		category: txtOpt("category"),
		priority: intDefault("priority", 100),
		isActive: boolDefault("isActive", true),
		effectiveFrom: dayOpt("effectiveFrom"),
		effectiveTo: dayOpt("effectiveTo"),
		reason: txtOpt("reason"),
		actionJson: jsonb("actionJson").notNull(),
		createdAt: now("createdAt"),
		createdBy: txtOpt("createdBy").references(() => User.id),
	},
	(table) => [
		index("PolicyExceptionRule_context_type_active_idx").on(
			table.scope,
			table.scopeId,
			table.category,
			table.type,
			table.isActive
		),
		index("PolicyExceptionRule_context_priority_idx").on(
			table.scope,
			table.scopeId,
			table.isActive,
			table.priority
		),
		index("PolicyExceptionRule_category_active_idx").on(table.category, table.isActive),
		index("PolicyExceptionRule_effective_range_idx").on(table.effectiveFrom, table.effectiveTo),
	]
)

export const PolicyAuditLog = pgTable(
	"PolicyAuditLog",
	{
		id: pk(),
		eventType: txt("eventType"),
		actorUserId: txtOpt("actorUserId").references(() => User.id),
		policyId: txtOpt("policyId").references(() => Policy.id),
		policyGroupId: txtOpt("policyGroupId").references(() => PolicyGroup.id),
		assignmentId: txtOpt("assignmentId").references(() => PolicyAssignment.id),
		scope: txtOpt("scope"),
		scopeId: txtOpt("scopeId"),
		channel: txtOpt("channel"),
		beforeJson: jsonb("beforeJson"),
		afterJson: jsonb("afterJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("PolicyAuditLog_event_created_idx").on(table.eventType, table.createdAt),
		index("PolicyAuditLog_policyGroupId_idx").on(table.policyGroupId),
		index("PolicyAuditLog_scope_scopeId_idx").on(table.scope, table.scopeId),
	]
)

export const RatePlanConditionState = pgTable(
	"RatePlanConditionState",
	{
		id: pk(),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		providerId: txt("providerId").references(() => Provider.id),
		productId: txt("productId").references(() => Product.id),
		variantId: txt("variantId").references(() => Variant.id),
		channel: text("channel").default("web").notNull(),
		totalCategories: intDefault("totalCategories", 0),
		coveredCategories: intDefault("coveredCategories", 0),
		missingCategoriesJson: jsonb("missingCategoriesJson").notNull(),
		conditionsComplete: boolDefault("conditionsComplete", false),
		summary: txt("summary"),
		policyCoverageUpdatedAt: now("policyCoverageUpdatedAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("RatePlanConditionState_ratePlan_channel_unique").on(
			table.ratePlanId,
			table.channel
		),
		index("RatePlanConditionState_provider_updated_idx").on(table.providerId, table.updatedAt),
		index("RatePlanConditionState_product_idx").on(table.productId),
		index("RatePlanConditionState_variant_idx").on(table.variantId),
		index("RatePlanConditionState_complete_idx").on(table.conditionsComplete),
	]
)

export const VariantInventoryConfig = pgTable("VariantInventoryConfig", {
	variantId: text("variantId")
		.primaryKey()
		.references(() => Variant.id),
	defaultTotalUnits: int("defaultTotalUnits"),
	horizonDays: intDefault("horizonDays", 365),
	createdAt: now("createdAt"),
})

export const DailyInventory = pgTable(
	"DailyInventory",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		date: day("date"),
		totalInventory: int("totalInventory"),
		reservedCount: intDefault("reservedCount", 0),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [uniqueIndex("DailyInventory_variantId_date_unique").on(table.variantId, table.date)]
)

export const EffectiveAvailability = pgTable(
	"EffectiveAvailability",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		date: day("date"),
		totalUnits: intDefault("totalUnits", 0),
		heldUnits: intDefault("heldUnits", 0),
		bookedUnits: intDefault("bookedUnits", 0),
		externalBlockedUnits: intDefault("externalBlockedUnits", 0),
		availableUnits: intDefault("availableUnits", 0),
		computedAt: tsReq("computedAt"),
	},
	(table) => [
		uniqueIndex("EffectiveAvailability_variantId_date_unique").on(table.variantId, table.date),
	]
)

export const SearchUnitView = pgTable(
	"SearchUnitView",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		productId: txt("productId").references(() => Product.id),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		date: day("date"),
		occupancyKey: txt("occupancyKey"),
		totalGuests: int("totalGuests"),
		hasAvailability: boolDefault("hasAvailability", false),
		hasPrice: boolDefault("hasPrice", false),
		isAvailable: boolDefault("isAvailable", false),
		availableUnits: intDefault("availableUnits", 0),
		pricePerNight: amountOpt("pricePerNight"),
		currency: text("currency").default("USD").notNull(),
		primaryBlocker: txtOpt("primaryBlocker"),
		minStay: intOpt("minStay"),
		maxStay: intOpt("maxStay"),
		minLeadTime: intOpt("minLeadTime"),
		maxLeadTime: intOpt("maxLeadTime"),
		cta: boolDefault("cta", false),
		ctd: boolDefault("ctd", false),
		computedAt: now("computedAt"),
		sourceVersion: txt("sourceVersion"),
	},
	(table) => [
		uniqueIndex("SearchUnitView_variant_rate_date_occupancy_unique").on(
			table.variantId,
			table.ratePlanId,
			table.date,
			table.occupancyKey
		),
		index("SearchUnitView_product_date_occupancy_idx").on(
			table.productId,
			table.date,
			table.occupancyKey
		),
		index("SearchUnitView_variant_date_idx").on(table.variantId, table.date),
		index("SearchUnitView_blocker_price_idx").on(table.primaryBlocker, table.pricePerNight),
	]
)

export const SearchMaterializationLog = pgTable(
	"SearchMaterializationLog",
	{
		id: pk(),
		runId: txt("runId"),
		trigger: txt("trigger"),
		status: txt("status"),
		variantId: txtOpt("variantId"),
		productId: txtOpt("productId"),
		fromDate: dayOpt("fromDate"),
		toDate: dayOpt("toDate"),
		horizonDays: intOpt("horizonDays"),
		currency: txtOpt("currency"),
		variantsScanned: intDefault("variantsScanned", 0),
		rowsMaterialized: intDefault("rowsMaterialized", 0),
		purgedRows: intDefault("purgedRows", 0),
		durationMs: intOpt("durationMs"),
		errorMessage: txtOpt("errorMessage"),
		metadataJson: jsonb("metadataJson"),
		startedAt: now("startedAt"),
		finishedAt: ts("finishedAt"),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("SearchMaterializationLog_run_unique").on(table.runId),
		index("SearchMaterializationLog_status_created_idx").on(table.status, table.createdAt),
		index("SearchMaterializationLog_started_idx").on(table.startedAt),
		index("SearchMaterializationLog_variant_started_idx").on(table.variantId, table.startedAt),
		index("SearchMaterializationLog_product_started_idx").on(table.productId, table.startedAt),
	]
)

export const RatePlan = pgTable(
	"RatePlan",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		name: txt("name"),
		description: txtOpt("description"),
		isDefault: boolDefault("isDefault", false),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("RatePlan_variantId_isActive_idx").on(table.variantId, table.isActive),
		index("RatePlan_variantId_isDefault_isActive_idx").on(
			table.variantId,
			table.isDefault,
			table.isActive
		),
	]
)

export const RatePlanOccupancyPolicy = pgTable(
	"RatePlanOccupancyPolicy",
	{
		id: pk(),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		baseAmount: amount("baseAmount"),
		baseCurrency: text("baseCurrency").default("USD").notNull(),
		baseAdults: int("baseAdults"),
		baseChildren: int("baseChildren"),
		extraAdultMode: txt("extraAdultMode"),
		extraAdultValue: amount("extraAdultValue"),
		childMode: txt("childMode"),
		childValue: amount("childValue"),
		currency: txt("currency"),
		effectiveFrom: tsReq("effectiveFrom"),
		effectiveTo: tsReq("effectiveTo"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("RatePlanOccupancyPolicy_ratePlan_effective_idx").on(
			table.ratePlanId,
			table.effectiveFrom,
			table.effectiveTo
		),
		index("RatePlanOccupancyPolicy_ratePlan_current_idx").on(
			table.ratePlanId,
			table.effectiveFrom,
			table.id,
			table.effectiveTo
		),
	]
)

export const CommercialRuleSet = pgTable(
	"CommercialRuleSet",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		name: txt("name"),
		description: txtOpt("description"),
		color: txtOpt("color"),
		status: text("status").default("active").notNull(),
		priority: intDefault("priority", 100),
		dateFrom: dayOpt("dateFrom"),
		dateTo: dayOpt("dateTo"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
		archivedAt: ts("archivedAt"),
	},
	(table) => [
		index("CommercialRuleSet_provider_status_idx").on(table.providerId, table.status),
		index("CommercialRuleSet_provider_date_range_idx").on(
			table.providerId,
			table.dateFrom,
			table.dateTo
		),
	]
)

export const CommercialRule = pgTable(
	"CommercialRule",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		ruleSetId: txt("ruleSetId").references(() => CommercialRuleSet.id),
		category: txt("category"),
		type: txt("type"),
		name: txtOpt("name"),
		value: amountOpt("value"),
		configJson: jsonb("configJson"),
		priority: intDefault("priority", 100),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("CommercialRule_provider_category_type_idx").on(
			table.providerId,
			table.category,
			table.type
		),
		index("CommercialRule_ruleSetId_isActive_idx").on(table.ruleSetId, table.isActive),
	]
)

export const CommercialRuleApplication = pgTable(
	"CommercialRuleApplication",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		ruleSetId: txt("ruleSetId").references(() => CommercialRuleSet.id),
		ruleId: txt("ruleId").references(() => CommercialRule.id),
		scope: txt("scope"),
		scopeId: txt("scopeId"),
		startDate: dayOpt("startDate"),
		endDate: dayOpt("endDate"),
		validDays: jsonb("validDays"),
		channel: txtOpt("channel"),
		isActive: boolDefault("isActive", true),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("CommercialRuleApplication_provider_scope_active_idx").on(
			table.providerId,
			table.scope,
			table.scopeId,
			table.isActive
		),
		index("CommercialRuleApplication_rule_scope_idx").on(table.ruleId, table.scope, table.scopeId),
		index("CommercialRuleApplication_ruleSet_active_idx").on(table.ruleSetId, table.isActive),
	]
)

export const EffectiveRestriction = pgTable(
	"EffectiveRestriction",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		ratePlanId: txtOpt("ratePlanId").references(() => RatePlan.id),
		date: day("date"),
		minStay: intOpt("minStay"),
		maxStay: intOpt("maxStay"),
		minLeadTime: intOpt("minLeadTime"),
		maxLeadTime: intOpt("maxLeadTime"),
		cta: boolDefault("cta", false),
		ctd: boolDefault("ctd", false),
		stopSell: boolDefault("stopSell", false),
		priority: intDefault("priority", 0),
		computedAt: tsReq("computedAt"),
	},
	(table) => [
		uniqueIndex("EffectiveRestriction_variant_rate_date_unique").on(
			table.variantId,
			table.ratePlanId,
			table.date
		),
		index("EffectiveRestriction_variant_date_idx").on(table.variantId, table.date),
		index("EffectiveRestriction_ratePlan_date_idx").on(table.ratePlanId, table.date),
	]
)

export const EffectivePricingV2 = pgTable(
	"EffectivePricingV2",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		date: day("date"),
		occupancyKey: txt("occupancyKey"),
		baseComponent: amount("baseComponent"),
		occupancyAdjustment: amount("occupancyAdjustment"),
		ruleAdjustment: amount("ruleAdjustment"),
		finalBasePrice: amount("finalBasePrice"),
		currency: text("currency").default("USD").notNull(),
		computedAt: tsReq("computedAt"),
		sourceVersion: text("sourceVersion").default("v2").notNull(),
	},
	(table) => [
		uniqueIndex("EffectivePricingV2_variant_rate_date_occupancy_unique").on(
			table.variantId,
			table.ratePlanId,
			table.date,
			table.occupancyKey
		),
		index("EffectivePricingV2_ratePlan_date_idx").on(table.ratePlanId, table.date),
		index("EffectivePricingV2_ratePlan_occupancy_date_idx").on(
			table.ratePlanId,
			table.occupancyKey,
			table.date,
			table.computedAt
		),
		index("EffectivePricingV2_variant_date_occupancy_idx").on(
			table.variantId,
			table.date,
			table.occupancyKey
		),
	]
)

export const TaxFeeDefinition = pgTable(
	"TaxFeeDefinition",
	{
		id: pk(),
		providerId: txtOpt("providerId").references(() => Provider.id),
		code: txt("code"),
		name: txt("name"),
		kind: txt("kind"),
		calculationType: txt("calculationType"),
		value: amount("value"),
		currency: txtOpt("currency"),
		inclusionType: txt("inclusionType"),
		appliesPer: txt("appliesPer"),
		priority: intDefault("priority", 0),
		jurisdictionJson: jsonb("jurisdictionJson"),
		effectiveFrom: ts("effectiveFrom"),
		effectiveTo: ts("effectiveTo"),
		status: text("status").default("active").notNull(),
		editingState: text("editingState").default("published").notNull(),
		currentVersionId: txtOpt("currentVersionId"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("TaxFeeDefinition_provider_status_priority_idx").on(
			table.providerId,
			table.status,
			table.priority
		),
		index("TaxFeeDefinition_provider_code_status_idx").on(
			table.providerId,
			table.code,
			table.status
		),
	]
)

/** Immutable publication history. TaxFeeDefinition keeps the current version pointer. */
export const TaxFeeDefinitionVersion = pgTable(
	"TaxFeeDefinitionVersion",
	{
		id: pk(),
		taxFeeDefinitionId: txt("taxFeeDefinitionId").references(() => TaxFeeDefinition.id),
		version: int("version"),
		publicationState: text("publicationState").notNull(),
		snapshotJson: jsonb("snapshotJson").notNull(),
		createdByUserId: txtOpt("createdByUserId").references(() => User.id),
		createdAt: now("createdAt"),
	},
	(table) => [
		uniqueIndex("TaxFeeDefinitionVersion_definition_version_unique").on(
			table.taxFeeDefinitionId,
			table.version
		),
		index("TaxFeeDefinitionVersion_definition_created_idx").on(
			table.taxFeeDefinitionId,
			table.createdAt
		),
	]
)

/** Append-only fiscal operations ledger. It never backs an editable UI surface. */
export const FiscalActivityEvent = pgTable(
	"FiscalActivityEvent",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		eventType: txt("eventType"),
		definitionId: txtOpt("definitionId").references(() => TaxFeeDefinition.id),
		definitionVersionId: txtOpt("definitionVersionId").references(() => TaxFeeDefinitionVersion.id),
		productId: txtOpt("productId").references(() => Product.id),
		channel: txtOpt("channel"),
		syncRunId: txtOpt("syncRunId").references(() => ProviderIntegrationSyncRun.id),
		actorUserId: txtOpt("actorUserId").references(() => User.id),
		actorRole: txtOpt("actorRole"),
		correlationId: txtOpt("correlationId"),
		result: text("result").default("succeeded").notNull(),
		riskLevel: text("riskLevel").default("low").notNull(),
		beforeJson: jsonb("beforeJson"),
		afterJson: jsonb("afterJson"),
		contextJson: jsonb("contextJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("FiscalActivityEvent_provider_created_idx").on(table.providerId, table.createdAt),
		index("FiscalActivityEvent_provider_type_created_idx").on(
			table.providerId,
			table.eventType,
			table.createdAt
		),
		index("FiscalActivityEvent_correlation_idx").on(table.correlationId),
	]
)

export const FiscalExportJob = pgTable(
	"FiscalExportJob",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		requestedByUserId: txtOpt("requestedByUserId").references(() => User.id),
		format: txt("format"),
		status: text("status").default("requested").notNull(),
		from: day("from"),
		to: day("to"),
		correlationId: txt("correlationId"),
		createdAt: now("createdAt"),
		completedAt: ts("completedAt"),
	},
	(table) => [index("FiscalExportJob_provider_created_idx").on(table.providerId, table.createdAt)]
)

export const FiscalReconciliationCase = pgTable(
	"FiscalReconciliationCase",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		bookingId: txt("bookingId").references(() => Booking.id),
		status: text("status").default("open").notNull(),
		assigneeUserId: txtOpt("assigneeUserId").references(() => User.id),
		resolutionComment: txtOpt("resolutionComment"),
		evidenceJson: jsonb("evidenceJson").notNull(),
		openedAt: now("openedAt"),
		resolvedAt: ts("resolvedAt"),
		resolvedByUserId: txtOpt("resolvedByUserId").references(() => User.id),
	},
	(table) => [
		index("FiscalReconciliationCase_provider_status_idx").on(table.providerId, table.status),
		uniqueIndex("FiscalReconciliationCase_provider_booking_unique").on(
			table.providerId,
			table.bookingId
		),
	]
)

export const FiscalChannelPublication = pgTable(
	"FiscalChannelPublication",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		definitionId: txt("definitionId").references(() => TaxFeeDefinition.id),
		definitionVersionId: txtOpt("definitionVersionId").references(() => TaxFeeDefinitionVersion.id),
		connectionId: txt("connectionId").references(() => ProviderIntegrationConnection.id),
		channel: txt("channel"),
		syncRunId: txtOpt("syncRunId").references(() => ProviderIntegrationSyncRun.id),
		status: text("status").default("pending").notNull(),
		divergenceJson: jsonb("divergenceJson"),
		payloadJson: jsonb("payloadJson"),
		confirmedAt: ts("confirmedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("FiscalChannelPublication_version_connection_unique").on(
			table.definitionVersionId,
			table.connectionId
		),
		index("FiscalChannelPublication_provider_status_idx").on(table.providerId, table.status),
	]
)

export const TaxFeeAssignment = pgTable(
	"TaxFeeAssignment",
	{
		id: pk(),
		taxFeeDefinitionId: txt("taxFeeDefinitionId").references(() => TaxFeeDefinition.id),
		scope: txt("scope"),
		scopeId: txtOpt("scopeId"),
		channel: txtOpt("channel"),
		status: text("status").default("active").notNull(),
		effectiveFrom: ts("effectiveFrom"),
		effectiveTo: ts("effectiveTo"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("TaxFeeAssignment_scope_active_channel_idx").on(
			table.scope,
			table.scopeId,
			table.status,
			table.channel
		),
		index("TaxFeeAssignment_definition_scope_active_idx").on(
			table.taxFeeDefinitionId,
			table.scope,
			table.scopeId,
			table.status,
			table.channel
		),
		index("TaxFeeAssignment_effective_range_idx").on(
			table.status,
			table.effectiveFrom,
			table.effectiveTo
		),
	]
)

export const Booking = pgTable(
	"Booking",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		userId: txtOpt("userId").references(() => User.id),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		bookingDate: now("bookingDate"),
		checkInDate: day("checkInDate"),
		checkOutDate: day("checkOutDate"),
		numAdults: intDefault("numAdults", 1),
		numChildren: intDefault("numChildren", 0),
		totalAmount: amount("totalAmount"),
		status: text("status").default("draft").notNull(),
		operationalStatus: text("operationalStatus").default("pending_arrival").notNull(),
		checkedInAt: ts("checkedInAt"),
		checkedInBy: txtOpt("checkedInBy").references(() => User.id),
		checkedOutAt: ts("checkedOutAt"),
		checkedOutBy: txtOpt("checkedOutBy").references(() => User.id),
		noShowAt: ts("noShowAt"),
		noShowBy: txtOpt("noShowBy").references(() => User.id),
		notes: txtOpt("notes"),
		currency: txt("currency"),
		source: text("source").default("web").notNull(),
		confirmedAt: ts("confirmedAt"),
		guestEmailSnapshot: txtOpt("guestEmailSnapshot"),
		guestNameSnapshot: txtOpt("guestNameSnapshot"),
		guestContactSnapshotJson: jsonb("guestContactSnapshotJson"),
		lifecycleAuditJson: jsonb("lifecycleAuditJson"),
		refundHandoffSnapshotJson: jsonb("refundHandoffSnapshotJson"),
		contractSnapshotVersion: txtOpt("contractSnapshotVersion"),
		integrationConnectionId: txtOpt("integrationConnectionId").references(
			() => ProviderIntegrationConnection.id,
			{ onDelete: "set null" }
		),
		externalBookingId: txtOpt("externalBookingId"),
		externalRevisionId: txtOpt("externalRevisionId"),
		externalRevisionAt: ts("externalRevisionAt"),
	},
	(table) => [
		index("Booking_provider_status_checkin_idx").on(
			table.providerId,
			table.status,
			table.checkInDate
		),
		index("Booking_provider_operation_checkout_idx").on(
			table.providerId,
			table.operationalStatus,
			table.checkOutDate
		),
		index("Booking_ratePlanId_idx").on(table.ratePlanId),
		uniqueIndex("Booking_connection_external_booking_unique")
			.on(table.integrationConnectionId, table.externalBookingId)
			.where(
				sql`${table.integrationConnectionId} IS NOT NULL AND ${table.externalBookingId} IS NOT NULL`
			),
		uniqueIndex("Booking_connection_external_revision_unique")
			.on(table.integrationConnectionId, table.externalRevisionId)
			.where(
				sql`${table.integrationConnectionId} IS NOT NULL AND ${table.externalRevisionId} IS NOT NULL`
			),
		index("Booking_provider_source_booking_date_idx").on(
			table.providerId,
			table.source,
			table.bookingDate.desc()
		),
	]
)

/** Guest voucher issued on tour booking confirm (day-of ops via Booking.checkedInAt). */
export const BookingVoucher = pgTable(
	"BookingVoucher",
	{
		id: pk(),
		bookingId: txt("bookingId").references(() => Booking.id),
		code: txt("code"),
		status: txt("status"),
		issuedAt: now("issuedAt"),
		redeemedAt: ts("redeemedAt"),
		instructionsJson: jsonb("instructionsJson"),
		qrPayload: txtOpt("qrPayload"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("BookingVoucher_bookingId_unique").on(table.bookingId),
		uniqueIndex("BookingVoucher_code_unique").on(table.code),
		index("BookingVoucher_status_idx").on(table.status),
		check("BookingVoucher_status_check", sql`${table.status} in ('issued', 'redeemed', 'void')`),
	]
)

export const BookingRoomDetail = pgTable(
	"BookingRoomDetail",
	{
		id: pk(),
		bookingId: txt("bookingId").references(() => Booking.id),
		variantId: txt("variantId").references(() => Variant.id),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		checkIn: day("checkIn"),
		checkOut: day("checkOut"),
		adults: int("adults"),
		children: int("children"),
		subtotalAmount: amount("subtotalAmount"),
		taxAmount: amount("taxAmount"),
		totalAmount: amount("totalAmount"),
		pricingBreakdownJson: jsonb("pricingBreakdownJson"),
		providerIdSnapshot: txtOpt("providerIdSnapshot"),
		productIdSnapshot: txtOpt("productIdSnapshot"),
		productNameSnapshot: txtOpt("productNameSnapshot"),
		variantNameSnapshot: txtOpt("variantNameSnapshot"),
		ratePlanNameSnapshot: txtOpt("ratePlanNameSnapshot"),
		occupancySnapshotJson: jsonb("occupancySnapshotJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("BookingRoomDetail_bookingId_idx").on(table.bookingId),
		index("BookingRoomDetail_variantId_idx").on(table.variantId),
		index("BookingRoomDetail_ratePlanId_idx").on(table.ratePlanId),
	]
)

/**
 * App-layer alias for BookingRoomDetail (all verticals).
 * Physical table name stays BookingRoomDetail — no schema rename (Fase 6).
 */
export const BookingLineItem = BookingRoomDetail
export type BookingLineItemRow = typeof BookingRoomDetail.$inferSelect
export type BookingLineItemInsert = typeof BookingRoomDetail.$inferInsert

export const InventoryLock = pgTable(
	"InventoryLock",
	{
		id: pk(),
		holdId: txtOpt("holdId"),
		variantId: txt("variantId").references(() => Variant.id),
		date: day("date"),
		quantity: intDefault("quantity", 1),
		expiresAt: tsReq("expiresAt"),
		bookingId: txtOpt("bookingId").references(() => Booking.id),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("InventoryLock_variantId_date_idx").on(table.variantId, table.date),
		index("InventoryLock_holdId_idx").on(table.holdId),
	]
)

export const Hold = pgTable(
	"Hold",
	{
		id: pk(),
		variantId: txt("variantId").references(() => Variant.id),
		ratePlanId: txt("ratePlanId").references(() => RatePlan.id),
		checkIn: day("checkIn"),
		checkOut: day("checkOut"),
		channel: txtOpt("channel"),
		expiresAt: tsReq("expiresAt"),
		policySnapshotJson: jsonb("policySnapshotJson").notNull(),
		guestExpectationsSnapshotJson: jsonb("guestExpectationsSnapshotJson"),
		commercialSnapshotVersion: text("commercialSnapshotVersion").notNull(),
		priceQuoteId: txtOpt("priceQuoteId"),
		commercialSnapshotJson: jsonb("commercialSnapshotJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("Hold_variantId_checkIn_idx").on(table.variantId, table.checkIn),
		index("Hold_expiresAt_idx").on(table.expiresAt),
		index("Hold_priceQuoteId_idx").on(table.priceQuoteId),
		check(
			"Hold_commercial_snapshot_check",
			sql`(${table.commercialSnapshotVersion} = 'legacy' AND ${table.priceQuoteId} IS NULL AND ${table.commercialSnapshotJson} IS NULL) OR (${table.commercialSnapshotVersion} = 'hold_commercial_snapshot_v1' AND ${table.priceQuoteId} IS NOT NULL AND ${table.commercialSnapshotJson} IS NOT NULL AND (${table.commercialSnapshotJson} -> 'priceQuote' ->> 'quoteId') = ${table.priceQuoteId})`
		),
	]
)

export const BookingPolicySnapshot = pgTable(
	"BookingPolicySnapshot",
	{
		id: pk(),
		bookingId: txt("bookingId").references(() => Booking.id),
		category: txt("category"),
		policyId: txtOpt("policyId").references(() => Policy.id),
		policySnapshotJson: jsonb("policySnapshotJson").notNull(),
		createdAt: ts("createdAt"),
	},
	(table) => [
		uniqueIndex("BookingPolicySnapshot_bookingId_category_unique").on(
			table.bookingId,
			table.category
		),
	]
)

export const BookingTaxFee = pgTable(
	"BookingTaxFee",
	{
		id: pk(),
		bookingId: txt("bookingId").references(() => Booking.id),
		name: txtOpt("name"),
		breakdownJson: jsonb("breakdownJson").notNull(),
		totalAmount: amount("totalAmount"),
		createdAt: now("createdAt"),
	},
	(table) => [index("BookingTaxFee_bookingId_idx").on(table.bookingId)]
)

export const FinancialExceptionRecord = pgTable(
	"FinancialExceptionRecord",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		code: txt("code"),
		severity: txt("severity"),
		status: txt("status"),
		basis: txt("basis"),
		reason: txt("reason"),
		nextOwner: txt("nextOwner"),
		source: txt("source"),
		openedAt: tsReq("openedAt"),
		acknowledgedAt: ts("acknowledgedAt"),
		resolvedAt: ts("resolvedAt"),
		resolvedBy: txtOpt("resolvedBy"),
		resolutionNote: txtOpt("resolutionNote"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("FinancialExceptionRecord_bookingId_idx").on(table.bookingId),
		index("FinancialExceptionRecord_booking_code_idx").on(table.bookingId, table.code),
		index("FinancialExceptionRecord_provider_status_idx").on(table.providerId, table.status),
		index("FinancialExceptionRecord_provider_code_status_idx").on(
			table.providerId,
			table.code,
			table.status
		),
		index("FinancialExceptionRecord_provider_owner_status_idx").on(
			table.providerId,
			table.nextOwner,
			table.status
		),
		index("FinancialExceptionRecord_openedAt_idx").on(table.openedAt),
	]
)

export const FinancialReference = pgTable(
	"FinancialReference",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		type: txt("type"),
		referenceValue: txt("referenceValue"),
		externalSystem: txtOpt("externalSystem"),
		amount: amountOpt("amount"),
		currency: txtOpt("currency"),
		recordedAt: tsReq("recordedAt"),
		source: txt("source"),
		basis: txt("basis"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("FinancialReference_bookingId_idx").on(table.bookingId),
		index("FinancialReference_booking_type_idx").on(table.bookingId, table.type),
		index("FinancialReference_provider_type_idx").on(table.providerId, table.type),
		index("FinancialReference_value_idx").on(table.referenceValue),
	]
)

export const RefundHandoffRecord = pgTable(
	"RefundHandoffRecord",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		status: txt("status"),
		reason: txt("reason"),
		refundType: txt("refundType"),
		expectedAmount: amountOpt("expectedAmount"),
		currency: txtOpt("currency"),
		basis: txt("basis"),
		nextOwner: txt("nextOwner"),
		openedAt: tsReq("openedAt"),
		acknowledgedAt: ts("acknowledgedAt"),
		closedAt: ts("closedAt"),
		notes: txtOpt("notes"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("RefundHandoffRecord_bookingId_idx").on(table.bookingId),
		index("RefundHandoffRecord_provider_status_idx").on(table.providerId, table.status),
		index("RefundHandoffRecord_provider_owner_status_idx").on(
			table.providerId,
			table.nextOwner,
			table.status
		),
		index("RefundHandoffRecord_openedAt_idx").on(table.openedAt),
	]
)

export const RefundQuote = pgTable(
	"RefundQuote",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		status: txt("status"),
		reason: txt("reason"),
		currency: txt("currency"),
		grossAmount: amount("grossAmount"),
		refundAmount: amount("refundAmount"),
		nonRefundableAmount: amount("nonRefundableAmount"),
		taxFeeRefundAmount: amount("taxFeeRefundAmount"),
		payoutImpactAmount: amount("payoutImpactAmount"),
		paymentDueLocal: txtOpt("paymentDueLocal"),
		cancellationDeadlineLocal: txtOpt("cancellationDeadlineLocal"),
		refundPercent: ratioOpt("refundPercent"),
		policySnapshotJson: jsonb("policySnapshotJson").notNull(),
		linesJson: jsonb("linesJson").notNull(),
		calculationSnapshotJson: jsonb("calculationSnapshotJson").notNull(),
		idempotencyKey: txt("idempotencyKey"),
		quotedAt: tsReq("quotedAt"),
		expiresAt: ts("expiresAt"),
		createdBy: txtOpt("createdBy"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("RefundQuote_bookingId_idx").on(table.bookingId),
		index("RefundQuote_provider_status_idx").on(table.providerId, table.status),
		uniqueIndex("RefundQuote_idempotencyKey_unique").on(table.idempotencyKey),
		index("RefundQuote_quotedAt_idx").on(table.quotedAt),
	]
)

export const RefundLedger = pgTable(
	"RefundLedger",
	{
		id: pk(),
		refundQuoteId: txt("refundQuoteId"),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		status: txt("status"),
		currency: txt("currency"),
		refundAmount: amount("refundAmount"),
		payoutImpactAmount: amount("payoutImpactAmount"),
		paymentTransactionId: txtOpt("paymentTransactionId"),
		externalReference: txtOpt("externalReference"),
		basis: txt("basis"),
		calculationSnapshotJson: jsonb("calculationSnapshotJson").notNull(),
		appliedAt: tsReq("appliedAt"),
		appliedBy: txtOpt("appliedBy"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("RefundLedger_bookingId_idx").on(table.bookingId),
		index("RefundLedger_provider_status_idx").on(table.providerId, table.status),
		uniqueIndex("RefundLedger_refundQuoteId_unique").on(table.refundQuoteId),
		index("RefundLedger_paymentTransactionId_idx").on(table.paymentTransactionId),
		index("RefundLedger_appliedAt_idx").on(table.appliedAt),
	]
)

export const FinancialReviewEvent = pgTable(
	"FinancialReviewEvent",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		financialExceptionId: txtOpt("financialExceptionId"),
		financialReferenceId: txtOpt("financialReferenceId"),
		refundHandoffId: txtOpt("refundHandoffId"),
		reconciliationMatchId: txtOpt("reconciliationMatchId"),
		type: txt("type"),
		actorId: txtOpt("actorId"),
		actorType: txt("actorType"),
		payloadJson: jsonb("payloadJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("FinancialReviewEvent_bookingId_idx").on(table.bookingId),
		index("FinancialReviewEvent_provider_created_idx").on(table.providerId, table.createdAt),
		index("FinancialReviewEvent_financialExceptionId_idx").on(table.financialExceptionId),
		index("FinancialReviewEvent_financialReferenceId_idx").on(table.financialReferenceId),
		index("FinancialReviewEvent_refundHandoffId_idx").on(table.refundHandoffId),
		index("FinancialReviewEvent_reconciliationMatchId_idx").on(table.reconciliationMatchId),
	]
)

export const PaymentTransaction = pgTable(
	"PaymentTransaction",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		type: txt("type"),
		status: txt("status"),
		amount: amount("amount"),
		currency: txt("currency"),
		externalReference: txt("externalReference"),
		pspProvider: txt("pspProvider"),
		idempotencyKey: txt("idempotencyKey"),
		occurredAt: tsReq("occurredAt"),
		source: txt("source"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("PaymentTransaction_bookingId_idx").on(table.bookingId),
		index("PaymentTransaction_provider_type_status_idx").on(
			table.providerId,
			table.type,
			table.status
		),
		uniqueIndex("PaymentTransaction_provider_psp_external_type_unique").on(
			table.providerId,
			table.pspProvider,
			table.externalReference,
			table.type
		),
		index("PaymentTransaction_idempotencyKey_idx").on(table.idempotencyKey),
		index("PaymentTransaction_occurredAt_idx").on(table.occurredAt),
	]
)

export const FinancialSettlementRecord = pgTable(
	"FinancialSettlementRecord",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		settlementReference: txt("settlementReference"),
		amount: amount("amount"),
		currency: txt("currency"),
		settlementDate: tsReq("settlementDate"),
		source: txt("source"),
		matchedAt: ts("matchedAt"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("FinancialSettlementRecord_bookingId_idx").on(table.bookingId),
		uniqueIndex("FinancialSettlementRecord_provider_reference_unique").on(
			table.providerId,
			table.settlementReference
		),
		index("FinancialSettlementRecord_settlementDate_idx").on(table.settlementDate),
	]
)

export const ReconciliationMatch = pgTable(
	"ReconciliationMatch",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		contractAmount: amount("contractAmount"),
		paymentAmount: amountOpt("paymentAmount"),
		settlementAmount: amountOpt("settlementAmount"),
		differenceAmount: amount("differenceAmount"),
		status: txt("status"),
		mismatchReasons: jsonb("mismatchReasons"),
		basis: txt("basis"),
		reviewStatus: txtOpt("reviewStatus"),
		reviewState: txtOpt("reviewState"),
		comparisonFingerprint: txtOpt("comparisonFingerprint"),
		reviewFingerprint: txtOpt("reviewFingerprint"),
		reviewedAt: ts("reviewedAt"),
		reviewedBy: txtOpt("reviewedBy"),
		reviewNote: txtOpt("reviewNote"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ReconciliationMatch_bookingId_idx").on(table.bookingId),
		index("ReconciliationMatch_provider_status_idx").on(table.providerId, table.status),
		index("ReconciliationMatch_provider_reviewStatus_idx").on(table.providerId, table.reviewStatus),
		index("ReconciliationMatch_updatedAt_idx").on(table.updatedAt),
	]
)

export const ProviderFinancialProfile = pgTable(
	"ProviderFinancialProfile",
	{
		providerId: text("providerId")
			.primaryKey()
			.references(() => Provider.id),
		payoutMethodReference: txtOpt("payoutMethodReference"),
		payoutSchedule: txt("payoutSchedule"),
		currency: txt("currency"),
		taxProfileStatus: txt("taxProfileStatus"),
		status: txt("status"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderFinancialProfile_status_idx").on(table.status),
		index("ProviderFinancialProfile_taxProfileStatus_idx").on(table.taxProfileStatus),
	]
)

export const FinancialProviderSummary = pgTable(
	"FinancialProviderSummary",
	{
		providerId: text("providerId")
			.primaryKey()
			.references(() => Provider.id),
		summaryJson: jsonb("summaryJson").notNull(),
		collectionsJson: jsonb("collectionsJson").notNull(),
		refundsJson: jsonb("refundsJson").notNull(),
		exceptionsJson: jsonb("exceptionsJson").notNull(),
		settlementsJson: jsonb("settlementsJson").notNull(),
		computedAt: now("computedAt"),
		invalidatedAt: ts("invalidatedAt"),
		invalidationReason: txtOpt("invalidationReason"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("FinancialProviderSummary_computedAt_idx").on(table.computedAt),
		index("FinancialProviderSummary_invalidatedAt_idx").on(table.invalidatedAt),
	]
)

export const CommissionSnapshot = pgTable(
	"CommissionSnapshot",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		commissionRate: ratioOpt("commissionRate").notNull(),
		commissionAmount: amount("commissionAmount"),
		basis: txt("basis"),
		currency: txt("currency"),
		snapshotAt: tsReq("snapshotAt"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("CommissionSnapshot_booking_provider_idx").on(table.bookingId, table.providerId),
		index("CommissionSnapshot_provider_snapshot_idx").on(table.providerId, table.snapshotAt),
	]
)

export const ProviderPayableSnapshot = pgTable(
	"ProviderPayableSnapshot",
	{
		id: pk(),
		bookingId: txt("bookingId"),
		providerId: txt("providerId"),
		grossAmount: amount("grossAmount"),
		commissionAmount: amount("commissionAmount"),
		taxAmount: amount("taxAmount"),
		netPayable: amount("netPayable"),
		currency: txt("currency"),
		basis: txt("basis"),
		snapshotAt: tsReq("snapshotAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderPayableSnapshot_booking_provider_idx").on(table.bookingId, table.providerId),
		index("ProviderPayableSnapshot_provider_snapshot_idx").on(table.providerId, table.snapshotAt),
	]
)

export const PayoutRecord = pgTable(
	"PayoutRecord",
	{
		id: pk(),
		bookingId: txtOpt("bookingId"),
		providerId: txt("providerId"),
		status: txt("status"),
		payoutReference: txtOpt("payoutReference"),
		amount: amountOpt("amount"),
		currency: txtOpt("currency"),
		basis: txt("basis"),
		recordedAt: ts("recordedAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("PayoutRecord_bookingId_idx").on(table.bookingId),
		index("PayoutRecord_provider_status_idx").on(table.providerId, table.status),
		index("PayoutRecord_payoutReference_idx").on(table.payoutReference),
	]
)

export const ProviderStatement = pgTable(
	"ProviderStatement",
	{
		id: pk(),
		providerId: txt("providerId"),
		statementReference: txtOpt("statementReference"),
		periodStart: ts("periodStart"),
		periodEnd: ts("periodEnd"),
		status: txt("status"),
		totalGrossAmount: amount("totalGrossAmount"),
		totalCommissionAmount: amount("totalCommissionAmount"),
		totalTaxAmount: amount("totalTaxAmount"),
		totalNetPayable: amount("totalNetPayable"),
		currency: txt("currency"),
		basis: txt("basis"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderStatement_provider_status_idx").on(table.providerId, table.status),
		index("ProviderStatement_statementReference_idx").on(table.statementReference),
	]
)
