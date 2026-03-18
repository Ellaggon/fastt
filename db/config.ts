import { defineDb, defineTable, column, NOW } from "astro:db"

// 1. Core master data (sin dependencias)

const Provider = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		userEmail: column.text({ optional: true }),
		companyName: column.text(),
		contactName: column.text({ optional: true }),
		contactEmail: column.text({ optional: true }),
		phone: column.text({ optional: true }),
		type: column.text({ optional: true }),
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
		entityType: column.text({ optional: true }), // e.g. "Product", "Hotel", "City"
		entityId: column.text({ optional: true }), // ID de la entidad
		url: column.text(),
		altText: column.text({ optional: true }),
		order: column.number({ default: 0 }),
		isPrimary: column.boolean({ default: false }),
	},
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
		providerId: column.text({ references: () => Provider.columns.id, optional: true }),
	},
})
const Product = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		description: column.text({ optional: true }),
		productType: column.text(),
		creationDate: column.date({ default: NOW }),
		lastUpdated: column.date({ default: NOW }),
		providerId: column.text({ references: () => Provider.columns.id, optional: true }),
		destinationId: column.text({ references: () => Destination.columns.id }),
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
		entityType: column.text(), // 'hotel_room', 'tour_slot', 'package_base'
		entityId: column.text(),
		name: column.text(),
		description: column.text({ optional: true }),

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

// 3. Configuración estructural de producto

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

// const DailyAvailability = defineTable({
// 	columns: {
// 		id: column.text({ primaryKey: true }),
// 		entityType: column.text(), // hotel_room | tour_slot | package_base
// 		entityId: column.text(),
// 		// hotelRoomTypeId: column.text({ references: () => HotelRoomType.columns.id }),
// 		date: column.text(),
// 		availableCount: column.number(), // Ej: 10 habitaciones
// 		priceOverride: column.number({ optional: true }), // Las OTAs permiten cambiar el precio por día específico aquí
// 	},
// })

const DailyInventory = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(), // YYYY-MM-DD
		totalInventory: column.number(), // Ej: 10 habitaciones físicas
		reservedCount: column.number({ default: 0 }),
		priceOverride: column.number({ optional: true }), // opcional si quieres override por día
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["variantId", "date"], unique: true }],
})
const EffectiveInventory = defineTable({
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
const TaxFee = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		type: column.text({ default: "percentage" }), // 'percentage'|'fixed'|'perPerson'|'perNight'|'perBooking'
		value: column.number(), // 13 => 13% si type=percentage, o 50 (moneda) si fixed
		currency: column.text({ default: "USD" }),
		isIncluded: column.boolean({ default: false }), // si está incluido en el precio mostrado
		isActive: column.boolean({ default: true }),
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
		createdAt: column.date({ default: NOW }),
	},
})
const InventoryLock = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),
		date: column.text(),
		quantity: column.number({ default: 1 }),
		expiresAt: column.date(),
		bookingId: column.text({ references: () => Booking.columns.id, optional: true }),
		createdAt: column.date({ default: NOW }),
	},
	indexes: [{ on: ["variantId", "date"] }],
})
const BookingPolicySnapshot = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text(),
		policyType: column.text(),
		description: column.text(),
		cancellationJson: column.json({ optional: true }),
	},
})
const BookingTaxFee = defineTable({
	/* --- Tax/fee cobrado en booking (registro de qué se cobró) --- */
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		type: column.text(), // percentage | fixed | perNight | perPerson
		isIncluded: column.boolean(),
		bookingId: column.text({ references: () => Booking.columns.id }),
		taxFeeId: column.text({ references: () => TaxFee.columns.id }),
		amountUSD: column.number({ optional: true }),
		amountBOB: column.number({ optional: true }),
	},
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
		Destination,
		RoomType,
		AmenityRoom,
		Service,
		Image,
		Translation,

		// 2 core entities
		User,
		Product,
		Hotel,
		Tour,
		Package,
		Variant,

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
		DailyInventory,
		EffectiveInventory,

		// 6 pricing
		RatePlanTemplate,
		RatePlan,
		PriceRule,
		Restriction,
		EffectiveRestriction,
		EffectivePricing,
		TaxFee,

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
