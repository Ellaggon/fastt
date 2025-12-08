import { defineDb, defineTable, column, NOW } from "astro:db"

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

const Destination = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		type: column.text(), // city, region, landmark, etc.
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
		name: column.text(), // "Aire acondicionado", "TV", "Minibar"
		category: column.text({ optional: true }), // "Entretenimiento", "Comodidad", "Baño"
	},
})

const Service = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text({ unique: true }),
	},
})

//   2. TABLAS QUE DEPENDEN DE PROVIDER / DESTINATION

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

// 3. TABLAS QUE DEPENDEN DE PRODUCT

const Variant = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),

		entityType: column.text({ optional: true }),
		entityId: column.text({ optional: true }),

		name: column.text(),
		description: column.text({ optional: true }),

		basePriceUSD: column.number({ default: 0 }),
		basePriceBOB: column.number({ default: 0 }),

		isActive: column.boolean({ default: true }),
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

const ProductService = defineTable({
	// Junction table for Product-Service (Many-to-Many)
	columns: {
		productId: column.text({ references: () => Product.columns.id }),
		serviceId: column.text({ references: () => Service.columns.id }),
		isAvailable: column.boolean({ default: true }),
		isFree: column.boolean({ default: false }),
	},
})

const Policy = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		policyType: column.text(), // 'Cancellation', 'CheckIn', 'CheckOut', 'Children', 'Pets', 'Smoking', etc.
		description: column.text(),
		isActive: column.boolean({ default: true }),
	},
})

// 4. TABLAS QUE DEPENDEN DE PRODUCT + ROOMTYPE + HOTEL

const HotelRoomType = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		hotelId: column.text({ references: () => Hotel.columns.productId }),
		roomTypeId: column.text({ references: () => RoomType.columns.id }),
		totalRooms: column.number({ default: 0 }),
		hasView: column.text({ optional: true }), // "Vista al salar"
		bedType: column.json({ optional: true }), //cambiar s
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

const OperatingRule = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		ruleType: column.text(), // 'OperationHours' | 'BookingWindow' | 'Other'
		value: column.text(),
	},
	//  --- OperatingRule ---
	//    Reglas técnicas/operativas que afectan disponibilidad/operación:
	//    - OperationHours: horario de funcionamiento recurrente (ej: 08:00-17:00)
	//    - BlackoutDates: (vehiculado también por la tabla BlackoutDate) — fechas en las que NO OPERAMOS
	//    - BookingWindow: límites de venta anticipada (min/max days) — opcional aquí
	//    NOTA: No usar OperatingRule para reglas "legales" legibles por el usuario (esas van a Policy).
})

// 5. BlackoutDate (depende de HotelRoomType y Product)

const BlackoutDate = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id, optional: true }),
		hotelRoomTypeId: column.text({ references: () => HotelRoomType.columns.id, optional: true }),
		startDate: column.date(),
		endDate: column.date(),
		reason: column.text({ optional: true }),
	},
	/* --- BlackoutDate: rango de fechas en que un PRODUCTO o una HABITACIÓN no está disponible */
})

// 6. RATEPLAN (depende de Variant + Policy)

const RatePlan = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		variantId: column.text({ references: () => Variant.columns.id }),

		name: column.text(),
		description: column.text({ optional: true }),

		type: column.text({ default: "modifier" }),
		valueUSD: column.number({ default: 0 }),
		valueBOB: column.number({ default: 0 }),

		refundable: column.boolean({ default: true }),
		cancellationPolicyId: column.text({ optional: true, references: () => Policy.columns.id }),
		paymentType: column.text({ default: "Prepaid" }),

		minNights: column.number({ default: 1 }),
		maxNights: column.number({ optional: true }),

		minAdvanceDays: column.number({ default: 0 }),
		maxAdvanceDays: column.number({ optional: true }),

		validDays: column.json({ optional: true }),
		startDate: column.date({ optional: true }),
		endDate: column.date({ optional: true }),

		isActive: column.boolean({ default: true }),
		createdAt: column.date({ default: NOW }),
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

// 7. BOOKING (depende de User + Product)

const Booking = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		userId: column.text({ references: () => User.columns.id, optional: true }), // Optional for guest bookings
		productId: column.text({ references: () => Product.columns.id, optional: true }),
		bookingDate: column.date({ default: NOW }),
		checkInDate: column.date(),
		checkOutDate: column.date(),
		numAdults: column.number({ default: 1 }),
		numChildren: column.number({ default: 0 }),
		totalAmountUSD: column.number({ optional: true }),
		totalAmountBOB: column.number({ optional: true }),
		status: column.text({ default: "Pending" }), // e.g., 'Pending', 'Confirmed', 'Cancelled'
		notes: column.text({ optional: true }),
	},
})

const TaxFee = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		name: column.text(),
		type: column.text({ default: "percentage" }), // 'percentage'|'fixed'|'perPerson'|'perNight'|'perBooking'
		value: column.number(), // 13 => 13% si type=percentage, o 50 (moneda) si fixed
		currency: column.text({ default: "USD" }),
		isIncluded: column.boolean({ default: false }), // si está incluido en el precio mostrado
		isActive: column.boolean({ default: true }),
		createdAt: column.date({ default: NOW }),
	},
})

const BookingTaxFee = defineTable({
	/* --- Tax/fee cobrado en booking (registro de qué se cobró) --- */
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		taxFeeId: column.text({ references: () => TaxFee.columns.id }),
		amountUSD: column.number({ optional: true }),
		amountBOB: column.number({ optional: true }),
	},
})

//  8. TABLAS DE PAGOS

const Payment = defineTable({
	/* --- Pagos / Reembolsos / Payouts --- */
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		amountUSD: column.number(),
		currency: column.text({ default: "USD" }),
		paymentDate: column.date({ default: NOW }),
		paymentMethod: column.text(),
		status: column.text({ default: "Completed" }),
		processor: column.text({ optional: true }),
		transactionId: column.text({ optional: true }),
	},
})

const Refund = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		policyId: column.text({ references: () => Policy.columns.id, optional: true }),
		amountUSD: column.number(),
		reason: column.text({ optional: true }),
		refundDate: column.date({ default: NOW }),
		status: column.text({ default: "Pending" }),
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

// 9. TRANSLATION

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

// 10. ÚLTIMA TABLA — BookingRoomDetail

const BookingRoomDetail = defineTable({
	// If a booking includes multiple rooms/types
	columns: {
		bookingId: column.text({ references: () => Booking.columns.id }),
		hotelRoomTypeId: column.text({ references: () => HotelRoomType.columns.id }), // ✅ vínculo a habitación específica del hotel
		ratePlanId: column.text({ references: () => RatePlan.columns.id, optional: true }), // ✅ tarifa aplicada
		quantity: column.number(),
		unitPriceUSD: column.number({ optional: true }),
		unitPriceBOB: column.number({ optional: true }),
	},
	// Composite primary key (bookingId, roomTypeId) would be ideal here too.
})

export default defineDb({
	tables: {
		// --- 1. Tablas base sin dependencias ---
		Provider,
		Destination,
		RoomType,
		AmenityRoom,
		Service,
		Image, // Es genérica, puede ir aquí

		// --- 2. Tablas de entidades principales ---
		Product, // Depende de Provider, Destination
		User, // Depende de Provider

		// --- 3. Tablas de configuración de producto/hotel ---
		Variant, // Depende de Product
		Hotel, // Depende de Product
		Tour, // Depende de Product
		Package, // Depende de Product
		Policy, // Depende de Product
		ProductService, // Depende de Product, Service
		TaxFee, // Depende de Product

		// --- 4. Tablas de detalle de Hotel/Habitaciones (Profundo) ---
		HotelRoomType, // Depende de Hotel, RoomType
		OperatingRule, // Depende de Product
		HotelRoomAmenity, // Depende de HotelRoomType, AmenityRoom
		BlackoutDate, // Depende de Product, HotelRoomType

		// --- 5. Tablas de Precios y Tarifas ---
		RatePlan, // Depende de Variant, Policy

		// --- 6. Tablas de Booking/Transacciones (Nivel 1) ---
		Booking, // Depende de User, Product
		ProviderPayout, // Depende de Provider

		// --- 7. Tablas de Pagos y Detalles (Nivel 2) ---
		BookingTaxFee, // Depende de Booking, TaxFee
		Payment, // Depende de Booking
		Refund, // Depende de Booking, Policy

		// --- 8. Tablas de Enlace Final y Traducción ---
		Translation,
		BookingRoomDetail, // Depende de Booking, HotelRoomType, RatePlan (DEBE IR AL FINAL)
	},
})
