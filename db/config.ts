import { defineDb, defineTable, column, NOW } from "astro:db"

// 1. Core master data (sin dependencias)

const Provider = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// v2 (incremental): keep v1 fields intact while adding OTA-grade provider identity/lifecycle.
		legalName: column.text({ optional: true }),
		displayName: column.text({ optional: true }),
		// IMPORTANT (SQLite/Turso safe migration):
		// Keep these optional to avoid table-rebuild migrations that can fail under FK enforcement on remote DBs.
		// Defaults can be enforced at the application layer and tightened in a later migration.
		status: column.text({ optional: true }), // draft | active | archived (verification handled separately)
		createdAt: column.date({ optional: true }),
	},
})
const Destination = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		type: column.text(),
		country: column.text(),
		department: column.text({ optional: true }),
		latitude: column.number({ optional: true }),
		longitude: column.number({ optional: true }),
		slug: column.text(),
	},
})
// const Place = defineTable({
//  columns: {
//      id: column.text({ primaryKey: true }),
//      productId: column.text({ primaryKey: true, references: () => Product.columns.id }), // FK to Product
//      address: column.text({ optional: true }),
//      phone: column.text({ optional: true }),
//      email: column.text({ optional: true }),
//      latitude: column.number({ optional: true }),
//      longitude: column.number({ optional: true }),
//  }
// })
const RoomType = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		maxOccupancy: column.number({ optional: true }),
		description: column.text({ optional: true }),
	},
})
const AmenityRoom = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		category: column.text({ optional: true }),
	},
})
const Service = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
	},
})
const Image = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		entityType: column.text({ optional: true }), // product | variant | pending (legacy values can still exist)
		entityId: column.text({ optional: true }), // ID de la entidad
		objectKey: column.text(),
		url: column.text(),
		order: column.number({ default: 0 }),
		isPrimary: column.boolean({ default: false }),
	},
})

// Safe-minimum upload tracking for R2. Used to clean up incomplete uploads.
// NOTE: This is not an outbox/worker system; just enough metadata for cleanup + integrity checks.
const ImageUpload = defineTable({
	columns: {
		id: column.text({ primaryKey: true }), // upload record id
		imageId: column.text({ references: () => Image.columns.id }), // FK to Image.id
		objectKey: column.text(),
		status: column.text({ default: "pending" }), // pending | completed
		createdAt: column.date({ default: NOW }),
		completedAt: column.date({ optional: true }),
	},
	indexes: [{ on: ["objectKey", "status"] }],
})
const Translation = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		tableRef: column.text(), // e.g., 'Product'
		columnRef: column.text(), // e.g., 'name'
		recordId: column.text(), // ID of the record in the referenced table
		languageCode: column.text(), // e.g., 'es', 'en', 'pt'
		translatedText: column.text(),
	},
	// For Astro DB, to ensure uniqueness (tableRef, columnRef, recordId, languageCode),
	// you might need to handle this at the application level during insertion.
})

// 2. Usuarios y entidades principales

const User = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		email: column.text({ unique: true }),
		username: column.text({ unique: true, optional: true }),
		passwordHash: column.text({ optional: true }),
		firstName: column.text({ optional: true }),
		lastName: column.text({ optional: true }),
		registrationDate: column.date({ default: NOW }),
	},
})

// Provider v2 extensions (parallel system): profile, verification, and provider-user mapping.
// NOTE: These tables intentionally coexist with v1 flows. No existing routes/pages are changed here.
const ProviderProfile = defineTable({
	columns: {
		providerId: column.text({ primaryKey: true, references: () => Provider.columns.id }),
		timezone: column.text(),
		defaultCurrency: column.text({ default: "USD" }),
		supportEmail: column.text({ optional: true }),
		supportPhone: column.text({ optional: true }),
	},
})
const ProviderVerification = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		providerId: column.text({ references: () => Provider.columns.id }),
		status: column.text({ default: "pending" }), // pending | approved | rejected
		reason: column.text({ optional: true }),
		reviewedAt: column.date({ optional: true }),
		reviewedBy: column.text({ optional: true }),
		metadataJson: column.json({ optional: true }),
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["providerId", "status"] }],
})
const ProviderUser = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		providerId: column.text({ references: () => Provider.columns.id }),
		userId: column.text({ references: () => User.columns.id }),
		role: column.text({ default: "owner" }), // owner | admin | staff
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["providerId", "userId"], unique: true }],
})
const Product = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		productType: column.text(),
		creationDate: column.date({ default: NOW }),
		lastUpdated: column.date({ default: NOW }),
		providerId: column.text({ references: () => Provider.columns.id, optional: true }),
		destinationId: column.text({ references: () => Destination.columns.id }),
	},
})

// House Rules (CAPA 6.5): UI-driven property information. Not part of booking contract.
const HouseRule = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		type: column.text(), // Children | Pets | Smoking | ExtraBeds | Access | Other
		description: column.text(),
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["productId", "type"] }],
})

// Product (canonical): additional 1:1 tables owned by the catalog domain.
const ProductStatus = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }),
		state: column.text({ default: "draft" }), // draft | ready | published
		validationErrorsJson: column.json({ optional: true }),
	},
})
const ProductContent = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }),
		description: column.text({ optional: true }),
		highlightsJson: column.json({ optional: true }),
		rules: column.text({ optional: true }),
		seoJson: column.json({ optional: true }),
	},
})
const ProductLocation = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }),
		address: column.text({ optional: true }),
		lat: column.number({ optional: true }),
		lng: column.number({ optional: true }),
	},
})
const Hotel = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }), // FK to Product
		stars: column.number({ optional: true }), // 1-5
		address: column.text({ optional: true }),
		phone: column.text({ optional: true }),
		email: column.text({ optional: true }),
		website: column.text({ optional: true }),
		latitude: column.number({ optional: true }),
		longitude: column.number({ optional: true }),
	},
})
const Tour = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }), // FK to Product
		duration: column.text({ optional: true }), // e.g., '3 Hours', '5 Days'
		difficultyLevel: column.text({ optional: true }), // e.g., 'Easy', 'Moderate', 'Difficult'
		guideLanguages: column.json({ optional: true }), // Array of strings: ['Spanish', 'English']
		includes: column.text({ optional: true }),
		excludes: column.text({ optional: true }),
	},
})
const Package = defineTable({
	columns: {
		productId: column.text({ primaryKey: true, references: () => Product.columns.id }), // FK to Product
		itinerary: column.text({ optional: true }),
		days: column.number({ optional: true }),
		nights: column.number({ optional: true }),
	},
})
const Variant = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		// Legacy subtype pointer (deprecated for new flows; kept for backward compatibility).
		// New flows should use `kind` + subtype extension tables.
		entityType: column.text(), // 'hotel_room', 'tour_slot', 'package_base'
		entityId: column.text(),
		name: column.text(),
		description: column.text({ optional: true }),

		// CAPA 3: clean variant identity + lifecycle (safe incremental: optional to avoid risky rebuilds).
		kind: column.text({ optional: true }), // hotel_room | tour_slot | package_base
		status: column.text({ optional: true }), // draft | ready | sellable | archived
		createdAt: column.date({ optional: true }),

		// Legacy fields (deprecated): pricing + capacity on Variant.
		// Do not remove yet; existing pricing/inventory/search code depends on them.
		maxOccupancy: column.number({ default: 1 }),
		minOccupancy: column.number({ default: 1 }),
		currency: column.text({ default: "USD" }),
		basePrice: column.number({ optional: true }),

		// Gestión de Confirmación
		// 'instant': Se confirma de inmediato si hay stock
		// 'request': El proveedor debe confirmar manualmente
		confirmationType: column.text({ default: "instant" }),
		// overbookingLimit: column.number({ default: 0 }),

		// Código para integraciones externas (Channel Managers)
		externalCode: column.text({ optional: true }),
		isActive: column.boolean({ default: true }),
	},
	indexes: [{ on: ["entityId", "entityType"] }],
})

// CAPA 3 (Variant): strong capacity model (new source of truth for capacity).
const VariantCapacity = defineTable({
	columns: {
		variantId: column.text({ primaryKey: true, references: () => Variant.columns.id }),
		minOccupancy: column.number(),
		maxOccupancy: column.number(),
		maxAdults: column.number({ optional: true }),
		maxChildren: column.number({ optional: true }),
	},
})

// CAPA 3 (Variant): hotel_room subtype extension.
// Links a variant to a RoomType (e.g. "double"). ProductId is on Variant.
const VariantHotelRoom = defineTable({
	columns: {
		variantId: column.text({ primaryKey: true, references: () => Variant.columns.id }),
		roomTypeId: column.text({ references: () => RoomType.columns.id }),
	},
	indexes: [{ on: ["roomTypeId"] }],
})

// CAPA 3 (Variant): readiness snapshot (catalog completeness only).
const VariantReadiness = defineTable({
	columns: {
		variantId: column.text({ primaryKey: true, references: () => Variant.columns.id }),
		state: column.text({ default: "draft" }), // draft | ready
		validationErrorsJson: column.json({ optional: true }),
		updatedAt: column.date({ default: NOW }),
	},
})

// 3. Configuración estructural de producto delete hotelroomtype

const HotelRoomType = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		hotelId: column.text({ references: () => Hotel.columns.productId }),
		roomTypeId: column.text({ references: () => RoomType.columns.id }),
		totalRooms: column.number({ default: 0 }),
		hasView: column.text({ optional: true }),
		bedType: column.json({ optional: true }),
		sizeM2: column.number({ optional: true }),
		bathroom: column.number({ optional: true }),
		hasBalcony: column.boolean({ optional: true }),
		maxOccupancyOverride: column.number({ optional: true }),
	},
})
const HotelRoomAmenity = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		hotelRoomTypeId: column.text({ references: () => HotelRoomType.columns.id }),
		amenityId: column.text({ references: () => AmenityRoom.columns.id }),
		isAvailable: column.boolean({ default: true }),
	},
})
const ProductService = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		serviceId: column.text({ references: () => Service.columns.id }),
		price: column.number({ optional: true }),
		currency: column.text({ optional: true }),
		priceUnit: column.text({ optional: true }),
		appliesTo: column.text({ default: "both" }),
		notes: column.text({ optional: true }),
	},
	indexes: [{ on: ["productId", "serviceId"], unique: true }],
})
const ProductServiceAttribute = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productServiceId: column.text({ references: () => ProductService.columns.id }),
		key: column.text(), // "location", "type"
		value: column.text(), // "room", "free", "wifi", "12"
	},
	// EFICIENCIA: Búsquedas rápidas por atributo
	indexes: [{ on: ["productServiceId", "key"] }],
})

// 4. Policy system

const PolicyGroup = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		category: column.text(),
	},
})
const Policy = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		groupId: column.text({ references: () => PolicyGroup.columns.id }),
		description: column.text(),
		version: column.number(),
		status: column.text({ default: "draft" }), // draft | active | archived
		effectiveFrom: column.text({ optional: true }),
		effectiveTo: column.text({ optional: true }),
	},
})
const PolicyAssignment = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		policyGroupId: column.text({ references: () => PolicyGroup.columns.id }),
		scope: column.text(),
		scopeId: column.text(),
		channel: column.text({ optional: true }),
		isActive: column.boolean({ default: true }),
	},
})
const CancellationTier = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		policyId: column.text({ references: () => Policy.columns.id }),
		daysBeforeArrival: column.number(),
		penaltyType: column.text({ default: "percentage" }),
		penaltyAmount: column.number({ optional: true }),
	},
})
const PolicyRule = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		policyId: column.text({ references: () => Policy.columns.id }),
		ruleKey: column.text({ optional: true }),
		ruleValue: column.json({ optional: true }),
	},
})
const EffectivePolicy = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		entityType: column.text(), // hotel | product | variant | rateplan | channel
		entityId: column.text(),
		category: column.text(),
		effectivePolicyId: column.text(),
		effectiveGroupId: column.text(),
		description: column.text({ optional: true }),
		rules: column.json({ optional: true }),
		cancellationTiers: column.json({ optional: true }),
		priority: column.number(),
		computedAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["entityType", "entityId", "category"], unique: true }],
})

// 5. Inventory / Availability base

// CAPA 5 (Inventory foundation): per-variant inventory configuration for generating DailyInventory rows.
// Intentionally minimal; completeness is enforced in application logic.
const VariantInventoryConfig = defineTable({
	columns: {
		variantId: column.text({ primaryKey: true, references: () => Variant.columns.id }),
		defaultTotalUnits: column.number(),
		horizonDays: column.number({ default: 365 }),
		createdAt: column.date({ default: NOW }),
	},
})

const DailyInventory = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(), // YYYY-MM-DD
		totalInventory: column.number(), // Ej: 10 habitaciones físicas
		reservedCount: column.number({ default: 0 }),
		// CAPA 5 (Inventory Calendar): operational stop-sell flag. Search treats stopSell=true as unavailable.
		stopSell: column.boolean({ default: false }),
		createdAt: column.date({ default: NOW }),
		updatedAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["variantId", "date"], unique: true }],
})
const EffectiveAvailability = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(),
		availableInventory: column.number(),
		computedAt: column.date(),
	},
	indexes: [{ on: ["variantId", "date"], unique: true }],
})

// 6. Pricing / Restrictions

const RatePlanTemplate = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		description: column.text({ optional: true }),
		paymentType: column.text(), // 'prepaid', 'at_property'
		refundable: column.boolean(),
		cancellationPolicyId: column.text({ references: () => Policy.columns.id, optional: true }),
		createdAt: column.date({ default: NOW }),
	},
})
const RatePlan = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		templateId: column.text({ references: () => RatePlanTemplate.columns.id }),
		variantId: column.text({ references: () => Variant.columns.id }),
		// CAPA 4B (Pricing Engine minimal): allow one default rate plan per variant.
		// Enforced at application layer (SQLite-safe incremental schema).
		isDefault: column.boolean({ default: false }),
		isActive: column.boolean({ default: true }),
		createdAt: column.date({ default: NOW }),
	},
})
const PriceRule = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		ratePlanId: column.text({ references: () => RatePlan.columns.id }),
		name: column.text({ optional: true }), // Ej: "Recargo Fin de Semana" o "Temporada Alta"
		type: column.text({ default: "modifier" }), // 'modifier', 'absolute', 'override'
		value: column.number(), // El monto o porcentaje

		// Campos de estacionalidad (antes estaban en PriceSeason)
		// startDate: column.text({ optional: true }),
		// endDate: column.text({ optional: true }),
		// validDays: column.json({ optional: true }), // [1,2,3,4,5]

		priority: column.number({ default: 10 }), // Para saber qué regla se aplica primero
		// CAPA 4: optional schedule metadata for deterministic OTA-style evaluation.
		// Backward compatible with existing rules that do not define schedule.
		dateRangeJson: column.json({ optional: true }), // { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
		dayOfWeekJson: column.json({ optional: true }), // number[] 0..6
		isActive: column.boolean({ default: true }),
		createdAt: column.date({ default: NOW }),
	},
})
const Restriction = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// A qué se aplica: 'product', 'variant' o 'rate_plan'
		scope: column.text(),
		scopeId: column.text(),
		type: column.text(), // 'min_stay', 'max_stay', 'cta' (closed to arrival), 'stop_sell'
		value: column.number({ optional: true }),
		startDate: column.text(),
		endDate: column.text(),
		validDays: column.json({ optional: true }), // [1,2,3,4,5,6,0]
		isActive: column.boolean({ default: true }),
		priority: column.number({ default: 100 }),
		createdAt: column.date({ default: NOW }),
	},
})
const EffectiveRestriction = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(),
		minStay: column.number({ optional: true }),
		maxStay: column.number({ optional: true }),
		cta: column.boolean({ default: false }),
		ctd: column.boolean({ default: false }),
		stopSell: column.boolean({ default: false }),
		priority: column.number({ default: 0 }),
		computedAt: column.date(),
	},
	indexes: [{ on: ["variantId", "date"], unique: true }],
})
const EffectivePricing = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({
			references: () => Variant.columns.id,
		}),
		ratePlanId: column.text({
			references: () => RatePlan.columns.id,
		}),
		date: column.text(),
		basePrice: column.number(),
		yieldMultiplier: column.number({ default: 1 }),
		finalBasePrice: column.number(),
		computedAt: column.date(),
	},
	indexes: [
		{
			on: ["variantId", "ratePlanId", "date"],
			unique: true,
		},
	],
})

// CAPA 4A (Pricing Base Rate): 1:1 base pricing per Variant (sellable unit).
// This replaces Variant.basePrice/currency as the canonical source of truth (legacy fields remain for compatibility).
const PricingBaseRate = defineTable({
	columns: {
		variantId: column.text({ primaryKey: true, references: () => Variant.columns.id }),
		currency: column.text({ default: "USD" }),
		basePrice: column.number(),
		createdAt: column.date({ default: NOW }),
	},
})
const TaxFee = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// Legacy tax table kept for compatibility during CAPA 7 rollout.
		// Plain text avoids remote reset failures caused by FK teardown order.
		productId: column.text(),
		type: column.text({ default: "percentage" }), // 'percentage'|'fixed'|'perPerson'|'perNight'|'perBooking'
		value: column.number(), // 13 => 13% si type=percentage, o 50 (moneda) si fixed
		currency: column.text({ default: "USD" }),
		isIncluded: column.boolean({ default: false }), // si está incluido en el precio mostrado
		isActive: column.boolean({ default: true }),
		createdAt: column.date({ default: NOW }),
	},
})
// CAPA 7 (Taxes & Fees): canonical additive tax/fee definitions.
const TaxFeeDefinition = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// Plain text for now to keep CAPA 7 schema resets deterministic in remote dev DBs.
		providerId: column.text({ optional: true }),
		code: column.text(),
		name: column.text(),
		kind: column.text(), // tax | fee
		calculationType: column.text(), // percentage | fixed
		value: column.number(),
		currency: column.text({ optional: true }),
		inclusionType: column.text(), // included | excluded
		appliesPer: column.text(), // stay | night | guest | guest_night
		priority: column.number({ default: 0 }),
		jurisdictionJson: column.json({ optional: true }),
		effectiveFrom: column.date({ optional: true }),
		effectiveTo: column.date({ optional: true }),
		status: column.text({ default: "active" }), // active | archived
		createdAt: column.date({ default: NOW }),
		updatedAt: column.date({ default: NOW }),
	},
})
// CAPA 7 (Taxes & Fees): assignment-based application (no dedupe).
const TaxFeeAssignment = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// CAPA 7: keep as plain text for now to avoid FK-related remote reset failures.
		// Domain logic enforces integrity until we reintroduce DB-level constraints safely.
		taxFeeDefinitionId: column.text(),
		scope: column.text(), // global | provider | product | variant | rate_plan
		scopeId: column.text({ optional: true }),
		channel: column.text({ optional: true }),
		status: column.text({ default: "active" }),
		createdAt: column.date({ default: NOW }),
	},
})

// 7. Booking core

const Booking = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		userId: column.text({ references: () => User.columns.id, optional: true }), // Optional for guest bookings
		ratePlanId: column.text({ references: () => RatePlan.columns.id }),
		bookingDate: column.date({ default: NOW }),
		checkInDate: column.date(),
		checkOutDate: column.date(),
		numAdults: column.number({ default: 1 }),
		numChildren: column.number({ default: 0 }),
		totalAmountUSD: column.number({ optional: true }),
		totalAmountBOB: column.number({ optional: true }),
		status: column.text({ default: "draft" }), // e.g., "draft"(recién creado) | "locked"(inventario bloqueado) | "confirmed"(pago OK) | "cancelled" | "expired"(lock vencido)
		notes: column.text({ optional: true }),
		currency: column.text({ optional: true }), // "USD" | "BOB"
		source: column.text({ default: "web" }),
		confirmedAt: column.date({ optional: true }),
	},
})
const BookingRoomDetail = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		variantId: column.text({ references: () => Variant.columns.id }),
		ratePlanId: column.text({ references: () => RatePlan.columns.id }),
		checkIn: column.text(),
		checkOut: column.text(),
		adults: column.number(),
		children: column.number(),
		basePrice: column.number(),
		taxes: column.number(),
		totalPrice: column.number(),
		// CAPA 4/6: immutable pricing snapshot consumed by booking confirmation.
		pricingBreakdownJson: column.json({ optional: true }),
		createdAt: column.date({ default: NOW }),
	},
})
const InventoryLock = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		// CAPA 5 Phase 2: hold identifier (UUID) for temporary inventory locks.
		// NOT a FK. Booking integration can later set bookingId separately.
		holdId: column.text({ optional: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(),
		quantity: column.number({ default: 1 }),
		expiresAt: column.date(),
		bookingId: column.text({ references: () => Booking.columns.id, optional: true }),
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["variantId", "date"] }, { on: ["holdId"] }],
})
const BookingPolicySnapshot = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text(),
		policyType: column.text(),
		description: column.text(),
		cancellationJson: column.json({ optional: true }),
		// CAPA 6 (Booking snapshot): canonical immutable policy snapshot at booking time.
		// Keep legacy columns above for backward compatibility.
		category: column.text({ optional: true }),
		policyId: column.text({ optional: true }),
		policySnapshotJson: column.json({ optional: true }),
		createdAt: column.date({ optional: true }),
	},
})
const BookingTaxFee = defineTable({
	// CAPA 7: immutable tax/fee snapshot at booking confirmation.
	columns: {
		id: column.text({ primaryKey: true }),
		// Keep as plain text for now to avoid FK-related remote reset failures during CAPA 7 rollout.
		bookingId: column.text(),
		// Legacy snapshot line kept as deprecated so remote migrations do not attempt a rename/drop.
		lineJson: column.json({ optional: true, deprecated: true }),
		// New additive snapshot label kept separate from legacy lineJson.
		name: column.text({ optional: true }),
		breakdownJson: column.json(),
		totalAmount: column.number(),
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["bookingId"] }],
})

// 8. Payments / Finance

const Payment = defineTable({
	/* --- Pagos / Reembolsos / Payouts --- */
	columns: {
		id: column.text({ primaryKey: true }),
		type: column.text(), // payment | refund | adjustment
		bookingId: column.text({ references: () => Booking.columns.id }),
		amount: column.number(),
		currency: column.text(),
		paymentDate: column.date({ default: NOW }),
		paymentMethod: column.text(),
		status: column.text({ default: "Completed" }),
		processor: column.text({ optional: true }),
		transactionId: column.text({ optional: true }),
	},
})
const ProviderPayout = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		providerId: column.text({ references: () => Provider.columns.id }),
		periodStart: column.date(),
		periodEnd: column.date(),
		amountUSD: column.number(),
		commissionUSD: column.number(),
		paymentDate: column.date({ optional: true }),
		status: column.text({ default: "Pending" }),
	},
})
const ProviderPayoutBooking = defineTable({
	columns: {
		payoutId: column.text({ references: () => ProviderPayout.columns.id }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		amountUSD: column.number(),
	},
})

export default defineDb({
	tables: {
		// 1 master
		Provider,
		ProviderProfile,
		ProviderVerification,
		ProviderUser,
		Destination,
		RoomType,
		AmenityRoom,
		Service,
		Image,
		ImageUpload,
		Translation,

		// 2 core entities
		User,
		Product,
		HouseRule,
		ProductStatus,
		ProductContent,
		ProductLocation,
		Hotel,
		Tour,
		Package,
		Variant,
		VariantCapacity,
		VariantHotelRoom,
		VariantReadiness,

		// 3 product structure
		HotelRoomType,
		HotelRoomAmenity,
		ProductService,
		ProductServiceAttribute,

		// 4 policy
		PolicyGroup,
		Policy,
		PolicyAssignment,
		CancellationTier,
		PolicyRule,
		EffectivePolicy,

		// 5 inventory
		// DailyAvailability,
		VariantInventoryConfig,
		DailyInventory,
		EffectiveAvailability,

		// 6 pricing
		RatePlanTemplate,
		RatePlan,
		PriceRule,
		Restriction,
		EffectiveRestriction,
		EffectivePricing,
		PricingBaseRate,
		TaxFee,
		TaxFeeDefinition,
		TaxFeeAssignment,

		// 7 booking
		Booking,
		BookingRoomDetail,
		InventoryLock,
		BookingPolicySnapshot,
		BookingTaxFee,

		// 8 finance
		Payment,
		ProviderPayout,
		ProviderPayoutBooking,
	},
})
