import { defineDb, defineTable, column, NOW } from "astro:db"

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

const Publication = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		title: column.text(),
		description: column.text(),
		images: column.json({ optional: true }),
		published: column.date({ default: NOW }),
		price: column.number({ default: 0 }),
		vehicle_type_id: column.text(),
		city_id: column.text(),
		user_id: column.text({ references: () => User.columns.id }),
	},
})

// --- Tablas Geográficas ---
const City = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text({ unique: true }),
		department: column.text(),
		latitude: column.number({ optional: true }),
		longitude: column.number({ optional: true }),
		description: column.text({ optional: true }),
	},
})

const PointOfInterest = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		description: column.text({ optional: true }),
		cityId: column.text({ references: () => City.columns.id }),
		latitude: column.number({ optional: true }),
		longitude: column.number({ optional: true }),
		type: column.text({ optional: true }), // e.g., 'National Park', 'Monument', 'Museum'
	},
})

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

// --- Tablas de Contenido Principal (Productos) ---
// Product es una tabla base para Hotel, Tour, Package
const Product = defineTable({
	columns: {
		id: column.text({ primaryKey: true }),
		name: column.text(),
		shortDescription: column.text({ optional: true }),
		longDescription: column.text({ optional: true }),
		productType: column.text(), // 'Hotel', 'Tour', 'Cruise', 'Package'
		creationDate: column.date({ default: NOW }),
		lastUpdated: column.date({ default: NOW }),
		providerId: column.text({ references: () => Provider.columns.id, optional: true }),
		cityId: column.text({ references: () => City.columns.id }),
		isActive: column.boolean({ default: true }),
		basePriceUSD: column.number({ default: 0 }), // Added base price directly to product for simplicity
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
		checkInTime: column.text({ optional: true }), // Store as string 'HH:MM'
		checkOutTime: column.text({ optional: true }), // Store as string 'HH:MM'
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
		productId: column.text({
			references: () => Product.columns.id,
			optional: true,
			deprecated: true,
		}), // Images can be related to a product
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
		icon: column.text({ optional: true }), // e.g., 'wifi-icon.svg' or a Tailwind class
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

const HotelRoomType = defineTable({
	// Junction table for Hotel-RoomType (Many-to-Many)
	columns: {
		hotelId: column.text({ references: () => Hotel.columns.productId }), // FK to Hotel (which is Product ID)
		roomTypeId: column.text(),
		availableRooms: column.number({ default: 0 }),
		priceUSD: column.number({ optional: true }),
		priceBOB: column.number({ optional: true }),
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

export default defineDb({
	tables: {
		Publication,
		// Geográficas
		City,
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
		HotelRoomType,
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
	},
})
