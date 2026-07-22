import {
	boolean,
	date as pgDate,
	index,
	integer,
	jsonb,
	numeric,
	pgTableCreator,
	real,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core"

const pgTable = pgTableCreator((name) => name)

const pk = (name = "id") => text(name).primaryKey()
const txt = (name: string) => text(name).notNull()
const txtOpt = (name: string) => text(name)
const int = (name: string) => integer(name).notNull()
const intOpt = (name: string) => integer(name)
const intDefault = (name: string, value: number) => integer(name).default(value).notNull()
const boolDefault = (name: string, value: boolean) => boolean(name).default(value).notNull()
const boolOpt = (name: string) => boolean(name)
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull()
const amountOpt = (name: string) => numeric(name, { precision: 14, scale: 2 })
const ratioOpt = (name: string) => numeric(name, { precision: 7, scale: 4 })
const day = (name: string) => pgDate(name).notNull()
const dayOpt = (name: string) => pgDate(name)
const ts = (name: string) => timestamp(name, { withTimezone: true })
const tsReq = (name: string) => timestamp(name, { withTimezone: true }).notNull()
const now = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull()

export const Provider = pgTable("Provider", {
	id: pk(),
	legalName: txtOpt("legalName"),
	displayName: txtOpt("displayName"),
	status: txtOpt("status"),
	createdAt: ts("createdAt"),
})

export const Destination = pgTable(
	"Destination",
	{
		id: pk(),
		name: txt("name"),
		type: txt("type"),
		country: txt("country"),
		department: txtOpt("department"),
		latitude: real("latitude"),
		longitude: real("longitude"),
		slug: txt("slug"),
	},
	(table) => [uniqueIndex("Destination_slug_unique").on(table.slug)]
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
		status: text("status").default("not_configured").notNull(),
		mode: text("mode").default("sandbox").notNull(),
		scopesJson: jsonb("scopesJson"),
		credentialsRef: txtOpt("credentialsRef"),
		lastSyncAt: ts("lastSyncAt"),
		lastSyncStatus: txtOpt("lastSyncStatus"),
		errorMessage: txtOpt("errorMessage"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		uniqueIndex("ProviderIntegrationConnection_provider_connector_unique").on(
			table.providerId,
			table.connectorKey
		),
		index("ProviderIntegrationConnection_providerId_status_idx").on(table.providerId, table.status),
	]
)

export const ProviderIntegrationSyncLog = pgTable(
	"ProviderIntegrationSyncLog",
	{
		id: pk(),
		providerId: txt("providerId").references(() => Provider.id),
		connectorKey: txt("connectorKey"),
		connectionId: txtOpt("connectionId").references(() => ProviderIntegrationConnection.id),
		eventType: txt("eventType"),
		status: txt("status"),
		mode: text("mode").default("sandbox").notNull(),
		message: txtOpt("message"),
		metadataJson: jsonb("metadataJson"),
		createdAt: now("createdAt"),
	},
	(table) => [
		index("ProviderIntegrationSyncLog_provider_connector_created_idx").on(
			table.providerId,
			table.connectorKey,
			table.createdAt
		),
		index("ProviderIntegrationSyncLog_provider_status_idx").on(table.providerId, table.status),
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
		invitedBy: txt("invitedBy").references(() => User.id),
		acceptedAt: ts("acceptedAt"),
		expiresAt: tsReq("expiresAt"),
		createdAt: now("createdAt"),
		updatedAt: now("updatedAt"),
	},
	(table) => [
		index("ProviderInvitation_providerId_status_idx").on(table.providerId, table.status),
		index("ProviderInvitation_providerId_email_idx").on(table.providerId, table.email),
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
		destinationId: txt("destinationId").references(() => Destination.id),
	},
	(table) => [
		index("Product_providerId_productType_idx").on(table.providerId, table.productType),
		index("Product_providerId_idx").on(table.providerId),
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

export const Tour = pgTable("Tour", {
	productId: text("productId")
		.primaryKey()
		.references(() => Product.id),
	duration: txtOpt("duration"),
	difficultyLevel: txtOpt("difficultyLevel"),
	meetingPointJson: jsonb("meetingPointJson"),
	itineraryJson: jsonb("itineraryJson"),
	safetyJson: jsonb("safetyJson"),
	guideJson: jsonb("guideJson"),
})

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
		penaltyType: text("penaltyType").default("percentage").notNull(),
		penaltyAmount: amountOpt("penaltyAmount"),
	},
	(table) => [
		uniqueIndex("CancellationTier_policyId_daysBeforeArrival_unique").on(
			table.policyId,
			table.daysBeforeArrival
		),
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
		index("EffectivePricingV2_variant_date_occupancy_idx").on(
			table.variantId,
			table.date,
			table.occupancyKey
		),
	]
)

export const TaxFeeDefinition = pgTable("TaxFeeDefinition", {
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
	createdAt: now("createdAt"),
	updatedAt: now("updatedAt"),
})

export const TaxFeeAssignment = pgTable("TaxFeeAssignment", {
	id: pk(),
	taxFeeDefinitionId: txt("taxFeeDefinitionId").references(() => TaxFeeDefinition.id),
	scope: txt("scope"),
	scopeId: txtOpt("scopeId"),
	channel: txtOpt("channel"),
	status: text("status").default("active").notNull(),
	createdAt: now("createdAt"),
})

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
		createdAt: now("createdAt"),
	},
	(table) => [
		index("Hold_variantId_checkIn_idx").on(table.variantId, table.checkIn),
		index("Hold_expiresAt_idx").on(table.expiresAt),
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
