import { defineDb, defineTable, column, NOW } from "astro:db"

// --- Tablas de Proveedores y Usuarios ---
const Provider = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		userEmail: column.text({ optional: true }),
		companyName: column.text(),
		contactName: column.text({ optional: true }),
		contactEmail: column.text({ optional: true }),
		phone: column.text({ optional: true }),
		type: column.text({ optional: true }), // e.g., 'Hotel', 'Tour Operator', 'Transport'
	},
})

const User = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		email: column.text({ unique: true }),
		username: column.text({ unique: true, optional: true }), // Made username optional for flexibility
		passwordHash: column.text({ optional: true }), // Store hashed passwords, NEVER plain text
		firstName: column.text({ optional: true }),
		lastName: column.text({ optional: true }),
		registrationDate: column.date({ default: NOW }),
		providerId: column.text({ references: () => Provider.columns.id, optional: true }),
	},
})

// --- Tablas Geográficas ---
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

const PointOfInterest = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		description: column.text({ optional: true }),
		destinationId: column.text({ references: () => Destination.columns.id }),
		latitude: column.number({ optional: true }),
		longitude: column.number({ optional: true }),
		type: column.text({ optional: true }), // e.g., 'National Park', 'Monument', 'Museum'
	},
})

// --- Tablas de Contenido Principal (Productos) ---
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
		isActive: column.boolean({ default: true }),
		basePriceUSD: column.number({ default: 0 }),
		basePriceBOB: column.number({ default: 0 }),
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
		checkInTime: column.text({ optional: true }),
		checkOutTime: column.text({ optional: true }),
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

// --- Tablas de Soporte y Relación ---
const Image = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		entityType: column.text({ optional: true }), // e.g. "Product", "Hotel", "City"
		entityId: column.text({ optional: true }), // ID de la entidad
		url: column.text(),
		altText: column.text({ optional: true }),
		order: column.number({ default: 0 }),
		isPrimary: column.boolean({ default: false }),
		// You could add columns like `entityType` and `entityId` for polymorphic relations
		// e.g., `entityType: column.text()`, `entityId: column.text()`
	},
})

const Service = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text({ unique: true }),
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
	// Define a composite primary key if you want to ensure uniqueness of the pair
	// or a simple ID if you need to reference specific product-service entries
	// Here, we'll use a composite primary key to ensure unique relationships
	// Astro DB currently doesn't directly support composite primary keys in `defineTable`
	// so we'll treat the combination of productId and serviceId as the implicit key for uniqueness
	// and handle potential duplicates in seed or app logic.
	// For strict uniqueness, you'd usually create a composite primary key.
	// For Astro DB, you might need to enforce this at the database level if supported,
	// or via unique constraints in your ORM/app logic.
})

const RoomType = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(), // "Suite Familiar", "Habitación Doble", etc.
		description: column.text({ optional: true }),
		maxOccupancy: column.number({ optional: true }),
		bedType: column.text({ optional: true }), // "1 cama doble", "2 camas individuales"
		sizeM2: column.number({ optional: true }),
		hasPrivateBathroom: column.boolean({ default: true }),
		hasBalcony: column.boolean({ optional: true }),
		hasView: column.text({ optional: true }), // "Vista al mar", "Vista al salar"
	},
})

const HotelRoomType = defineTable({
	columns: {
		hotelId: column.text({ references: () => Hotel.columns.productId }), // FK to Hotel (which is Product ID)
		roomTypeId: column.text({ references: () => RoomType.columns.id }),
		totalRooms: column.number({ default: 0 }), // total inventory for this hotel
		priceUSD: column.number({ optional: true }),
		priceBOB: column.number({ optional: true }),
	},
})

// RatePlan (price rules)
const RatePlan = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }), // hotel/product
		name: column.text(),
		refundable: column.boolean({ default: true }),
		paymentType: column.text({ default: "Prepaid" }), // Prepaid | Postpaid
		basePriceUSD: column.number({ optional: true }),
		createdAt: column.date({ default: NOW }),
	},
})

const OperatingRule = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		ruleType: column.text(), // "CheckIn", "CheckOut", "OperationHours", "BlackoutDates"
		value: column.text(),
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

// --- Tablas de Reservas ---
const Booking = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		userId: column.text({ references: () => User.columns.id, optional: true }), // Optional for guest bookings
		productId: column.text({ references: () => Product.columns.id }),
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

const BookingRoomDetail = defineTable({
	// If a booking includes multiple rooms/types
	columns: {
		bookingId: column.text({ references: () => Booking.columns.id }),
		roomTypeId: column.text(),
		quantity: column.number(),
		unitPriceUSD: column.number({ optional: true }),
		unitPriceBOB: column.number({ optional: true }),
	},
	// Composite primary key (bookingId, roomTypeId) would be ideal here too.
})

// --- Tablas de Contenido Dinámico (Blog/Artículos) ---
const Author = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		biography: column.text({ optional: true }),
	},
})

const Article = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		title: column.text(),
		content: column.text(),
		publicationDate: column.date(),
		authorId: column.text({ references: () => Author.columns.id, optional: true }),
		urlSlug: column.text({ unique: true }),
		mainImageId: column.text({ references: () => Image.columns.id, optional: true }), // FK to Image
	},
})

const ArticleCategory = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text({ unique: true }),
	},
})

const ArticleToCategory = defineTable({
	// Junction table for Article-Category (Many-to-Many)
	columns: {
		articleId: column.text({ references: () => Article.columns.id }),
		categoryId: column.text({ references: () => ArticleCategory.columns.id }),
	},
	// Composite primary key (articleId, categoryId) would be ideal here.
})

// --- Tabla de Traducciones (para soporte multilenguaje) ---
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

const TaxFee = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		productId: column.text({ references: () => Product.columns.id }),
		name: column.text(), // "IVA", "Tarifa de servicio", etc.
		amount: column.number({ optional: true }),
		percentage: column.number({ optional: true }),
		currency: column.text({ default: "USD" }),
		isIncluded: column.boolean({ default: false }), // si está incluido en el precio mostrado
	},
})

const Payment = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		bookingId: column.text({ references: () => Booking.columns.id }),
		amountUSD: column.number(),
		currency: column.text({ default: "USD" }),
		paymentDate: column.date({ default: NOW }),
		paymentMethod: column.text(), // "Stripe", "PayPal", "BankTransfer", etc.
		status: column.text({ default: "Completed" }),
		processor: column.text({ optional: true }), // "Expedia", "Direct", etc.
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
		status: column.text({ default: "Pending" }), // "Pending", "Paid"
	},
})

export default defineDb({
	tables: {
		// Geográficas
		Destination,
		PointOfInterest,
		// Proveedores y Usuarios
		Provider,
		User,
		// Contenido Principal
		Product,
		Hotel,
		Tour,
		Package,
		// Soporte y Relación
		Image,
		Service,
		ProductService,
		RoomType,
		HotelRoomType,
		RatePlan,
		OperatingRule,
		Policy,
		TaxFee,
		// Reservas
		Booking,
		BookingRoomDetail,
		// Contenido Dinámico
		Author,
		Article,
		ArticleCategory,
		ArticleToCategory,
		// Multilenguaje
		Translation,
		Payment,
		Refund,
		ProviderPayout,
	},
})
