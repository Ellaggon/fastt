import {
	db,
	eq,
	Provider,
	Destination,
	Product,
	Hotel,
	Tour,
	Package,
	Service,
	ProductService,
} from "astro:db"
import { isDepartmentId } from "@/data/departments"

function dept(id: string) {
	if (!isDepartmentId(id)) {
		throw new Error(`Departamento invalido: "${id}`)
	}
	return id
}
function slugify(text: string) {
	return text
		.toString()
		.normalize("NFD") // quita acentos
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

export default async function seed() {
	console.log("Iniciando la siembra de datos...")

	// --- 1. Datos Geográficos (Ciudades/Departamentos de Bolivia) ---
	const destinations = [
		{
			id: "santa-cruz",
			name: "Santa Cruz de la Sierra",
			type: "city",
			country: "bolivia",
			department: dept("santa-cruz"),
			latitude: -17.8,
			longitude: -63.1833,
			slug: slugify("Santa Cruz de la Sierra"),
		},
		{
			id: "la-paz",
			name: "La Paz",
			type: "city",
			country: "bolivia",
			department: dept("la-paz"),
			latitude: -16.4958,
			longitude: -68.1333,
			slug: slugify("La Paz"),
		},
		{
			id: "el-alto",
			name: "El Alto",
			type: "city",
			country: "bolivia",
			department: dept("la-paz"),
			latitude: -16.5047,
			longitude: -68.1633,
			slug: slugify("El Alto"),
		},
		{
			id: "cochabamba",
			name: "Cochabamba",
			type: "city",
			country: "bolivia",
			department: dept("cochabamba"),
			latitude: -17.3883,
			longitude: -66.1597,
			slug: slugify("Cochabamba"),
		},
		{
			id: "sucre",
			name: "Sucre",
			type: "city",
			country: "bolivia",
			department: dept("chuquisaca"),
			latitude: -19.0196,
			longitude: -65.262,
			slug: slugify("Sucre"),
		},
		{
			id: "oruro",
			name: "Oruro",
			type: "city",
			country: "bolivia",
			department: dept("oruro"),
			latitude: -17.9622,
			longitude: -67.1121,
			slug: slugify("Oruro"),
		},
		{
			id: "potosi",
			name: "Potosí",
			type: "city",
			country: "bolivia",
			department: dept("potosi"),
			latitude: -19.5833,
			longitude: -65.75,
			slug: slugify("Potosí"),
		},
		{
			id: "tarija",
			name: "Tarija",
			type: "city",
			country: "bolivia",
			department: dept("tarija"),
			latitude: -21.5214,
			longitude: -64.7281,
			slug: slugify("Tarija"),
		},
		{
			id: "trinidad",
			name: "Trinidad",
			type: "city",
			country: "bolivia",
			department: dept("beni"),
			latitude: -14.8333,
			longitude: -64.9,
			slug: slugify("Trinidad"),
		},
		{
			id: "cobija",
			name: "Cobija",
			type: "city",
			country: "bolivia",
			department: dept("pando"),
			latitude: -11.0267,
			longitude: -68.7692,
			slug: slugify("Cobija"),
		},
		{
			id: "montero",
			name: "Montero",
			type: "city",
			country: "bolivia",
			department: dept("santa-cruz"),
			latitude: -17.35,
			longitude: -63.1667,
			slug: slugify("Montero"),
		},
		{
			id: "riberalta",
			name: "Riberalta",
			type: "city",
			country: "bolivia",
			department: dept("beni"),
			latitude: -10.9808,
			longitude: -66.0604,
			slug: slugify("Riberalta"),
		},
		{
			id: "san-ignacio-de-velasco",
			name: "San Ignacio de Velasco",
			type: "city",
			country: "bolivia",
			department: dept("santa-cruz"),
			latitude: -16.51,
			longitude: -60.9397,
			slug: slugify("San Ignacio de Velasco"),
		},
		{
			id: "camiri",
			name: "Camiri",
			type: "city",
			country: "bolivia",
			department: dept("santa-cruz"),
			latitude: -19.4525,
			longitude: -63.5686,
			slug: slugify("Camiri"),
		},
		{
			id: "yacuiba",
			name: "Yacuíba",
			type: "city",
			country: "bolivia",
			department: dept("tarija"),
			latitude: -22.0172,
			longitude: -63.5806,
			slug: slugify("Yacuíba"),
		},
		{
			id: "tupiza",
			name: "Tupiza",
			type: "city",
			country: "bolivia",
			department: dept("potosi"),
			latitude: -21.445,
			longitude: -65.7178,
			slug: slugify("Tupiza"),
		},
		{
			id: "villazon",
			name: "Villazón",
			type: "city",
			country: "bolivia",
			department: dept("potosi"),
			latitude: -22.025,
			longitude: -65.5486,
			slug: slugify("Villazón"),
		},
		{
			id: "warnes",
			name: "Warnes",
			type: "city",
			country: "bolivia",
			department: dept("santa-cruz"),
			latitude: -17.3297,
			longitude: -63.1215,
			slug: slugify("Warnes"),
		},
		{
			id: "uyuni",
			name: "Uyuni",
			type: "city",
			country: "bolivia",
			department: dept("potosi"),
			latitude: -20.4628,
			longitude: -66.8239,
			slug: slugify("Uyuni"),
		},
	]

	// --- 2. Datos de Proveedores ---
	const providersData = [
		{ id: "prov-1", companyName: "EcoTours Bolivia", type: "Tour Operator" },
		{ id: "prov-2", companyName: "Hoteles Altiplano S.A.", type: "Hotel" },
		{ id: "prov-3", companyName: "Aventuras del Sur", type: "Tour Operator" },
		{ id: "prov-4", companyName: "Transporte Aéreo Boliviano", type: "Transport" },
	]

	// --- 3. Datos de Servicios (Para Tours/Hoteles) ---
	const servicesData = [
		{ id: "serv-1", name: "Wi-Fi Gratuito", icon: "wifi" },
		{ id: "serv-2", name: "Piscina Climatizada", icon: "pool" },
		{ id: "serv-3", name: "Guía Bilingüe", icon: "language" },
		{ id: "serv-4", name: "Desayuno Incluido", icon: "coffee" },
		{ id: "serv-5", name: "Transporte 4x4", icon: "car" },
		{ id: "serv-6", name: "Equipo de Montaña", icon: "tent" },
	]

	// --- URL genérica para imágenes de prueba (Usa placehold.co) ---
	const generateImageUrl = (id: string, width = 800, height = 600) => [
		`https://placehold.co/${width}x${height}/E7E5E4/000000?text=FT-${id}`,
	]

	// --- 4. Generación de Productos ---

	const hotelsData = [
		{
			name: "Los Tajibos Hotel & Convention Center",
			destinationId: "santa-cruz",
			stars: 5,
			address: "Av. San Martín",
			departmentId: "santa-cruz", // Corregido/Añadido
		},
		{
			name: "Hotel Presidente",
			destinationId: "la-paz",
			stars: 4,
			address: "Av. 6 de Agosto",
			departmentId: "la-paz", // Corregido/Añadido
		},
		{
			name: "Cochabamba Palace Hotel",
			destinationId: "cochabamba",
			stars: 4,
			address: "Av. Libertador",
			departmentId: "cochabamba", // Corregido/Añadido
		},
		{
			name: "Parador Santa Maria La Real",
			destinationId: "sucre",
			stars: 5,
			address: "Calle Bolívar",
			departmentId: "chuquisaca", // Añadido (Sucre)
		},
		{
			name: "Hostal Colonial",
			destinationId: "potosi",
			stars: 3,
			address: "Calle Linares",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Hotel Los Parrales",
			destinationId: "tarija",
			stars: 4,
			address: "Av. La Banda",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Gran Hotel Trópico",
			destinationId: "trinidad",
			stars: 3,
			address: "Plaza Principal",
			departmentId: "beni", // Añadido (Trinidad)
		},
		{
			name: "Hotel Edén",
			destinationId: "oruro",
			stars: 3,
			address: "Calle Junín",
			departmentId: "oruro", // Añadido
		},
		{
			name: "Hotel Cabañas del Lago",
			destinationId: "cobija",
			stars: 4,
			address: "Ribera del Acre",
			departmentId: "pando", // Añadido (Cobija)
		},
		{
			name: "Casa Grande Hotel",
			destinationId: "la-paz",
			stars: 5,
			address: "Zona Sur",
			departmentId: "la-paz", // Añadido
		},
		{
			name: "Senses Hotel Boutique",
			destinationId: "santa-cruz",
			stars: 4,
			address: "Equipetrol",
			departmentId: "santa-cruz", // Añadido
		},
		{
			name: "Cesars Plaza Hotel",
			destinationId: "cochabamba",
			stars: 3,
			address: "Centro Histórico",
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Hotel Samary",
			destinationId: "sucre",
			stars: 4,
			address: "Barrio San Lázaro",
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Gala Hotel",
			destinationId: "potosi",
			stars: 3,
			address: "Cerca de la Casa de la Moneda",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Hostal Carmen",
			destinationId: "tarija",
			stars: 2,
			address: "Barrio Central",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Hotel Trinidad",
			destinationId: "trinidad",
			stars: 4,
			address: "Zona Residencial",
			departmentId: "beni", // Añadido
		},
		{
			name: "Regis Hotel",
			destinationId: "oruro",
			stars: 4,
			address: "Av. 6 de Agosto",
			departmentId: "oruro", // Añadido
		},
		{
			name: "Pando Palace",
			destinationId: "cobija",
			stars: 3,
			address: "Cerca del Aeropuerto",
			departmentId: "pando", // Añadido
		},
		{
			name: "La Casona Hotel",
			destinationId: "la-paz",
			stars: 3,
			address: "Casco Viejo",
			departmentId: "la-paz", // Añadido
		},
		{
			name: "Resort Jardines del Este",
			destinationId: "santa-cruz",
			stars: 5,
			address: "Kilómetro 8",
			departmentId: "santa-cruz", // Añadido
		},
	]

	const toursData = [
		{
			name: "City Tour Histórico La Paz",
			destinationId: "la-paz",
			duration: "4 Horas",
			difficulty: "Fácil",
			languages: ["Español", "Inglés"],
			departmentId: "la-paz", // Añadido
		},
		{
			name: "Salar de Uyuni: 3 Días y 2 Noches",
			destinationId: "potosi",
			duration: "3 Días",
			difficulty: "Moderado",
			languages: ["Español", "Francés"],
			departmentId: "potosi", // Añadido
		},
		{
			name: "Ruta del Vino y Singani",
			destinationId: "tarija",
			duration: "8 Horas",
			difficulty: "Fácil",
			languages: ["Español"],
			departmentId: "tarija", // Añadido
		},
		{
			name: "Parque Nacional Amboró - Lado Oeste",
			destinationId: "santa-cruz",
			duration: "1 Día",
			difficulty: "Moderado",
			languages: ["Español", "Alemán"],
			departmentId: "santa-cruz", // Añadido
		},
		{
			name: "Parque Toro Toro: Cañones y Dinosaurios",
			destinationId: "cochabamba",
			duration: "2 Días",
			difficulty: "Moderado",
			languages: ["Español"],
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Recorrido por la Casa de la Libertad",
			destinationId: "sucre",
			duration: "3 Horas",
			difficulty: "Fácil",
			languages: ["Español", "Portugués"],
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Ruta de la Coca y el Chairo",
			destinationId: "la-paz",
			duration: "6 Horas",
			difficulty: "Moderado",
			languages: ["Español"],
			departmentId: "la-paz", // Añadido
		},
		{
			name: "Misiones Jesuíticas de Chiquitos",
			destinationId: "santa-cruz",
			duration: "3 Días",
			difficulty: "Fácil",
			languages: ["Español", "Inglés"],
			departmentId: "santa-cruz", // Añadido
		},
		{
			name: "Carnaval de Oruro: Entrada VIP",
			destinationId: "oruro",
			duration: "1 Día",
			difficulty: "Fácil",
			languages: ["Español"],
			departmentId: "oruro", // Añadido
		},
		{
			name: "Amazonía Profunda - Río Mamoré",
			destinationId: "trinidad",
			duration: "4 Días",
			difficulty: "Difícil",
			languages: ["Español", "Inglés"],
			departmentId: "beni", // Añadido
		},
	]

	const packagesData = [
		{
			name: "Aventura Boliviana (Uyuni + Amboró)",
			destinationId: "santa-cruz",
			days: 7,
			nights: 6,
			itinerary: "Día 1: SCZ a Uyuni. Días 2-3: Salar. Día 4: Vuelo a SCZ. Días 5-6: Amboró.",
			departmentId: "santa-cruz", // Añadido
		},
		{
			name: "Culturas Andinas (La Paz + Titicaca)",
			destinationId: "la-paz",
			days: 5,
			nights: 4,
			itinerary: "Día 1: City Tour LPZ. Día 2: Tiwanaku. Días 3-4: Copacabana e Isla del Sol.",
			departmentId: "la-paz", // Añadido
		},
		{
			name: "El Encanto del Sur (Sucre + Potosí)",
			destinationId: "sucre",
			days: 4,
			nights: 3,
			itinerary: "Días 1-2: Sucre colonial. Días 3-4: Potosí (Mina y Casa de la Moneda).",
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Trópico y Valle (Cochabamba)",
			destinationId: "cochabamba",
			days: 3,
			nights: 2,
			itinerary: "Día 1: Cristo de la Concordia. Día 2: Parque Machía y Trópico. Día 3: Regreso.",
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Descanso y Viñedos (Tarija)",
			destinationId: "tarija",
			days: 3,
			nights: 2,
			itinerary: "Día 1: City Tour. Días 2: Visita a 3 bodegas. Día 3: Tiempo libre.",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Misterios Amazónicos (Beni)",
			destinationId: "trinidad",
			days: 4,
			nights: 3,
			itinerary: "Día 1: Llegada a Trinidad. Días 2-3: Safari fluvial y fauna. Día 4: Despedida.",
			departmentId: "beni", // Añadido
		},
		{
			name: "Ruta de las Lagunas (Potosí)",
			destinationId: "potosi",
			days: 4,
			nights: 3,
			itinerary: "Recorrido completo por las lagunas de colores y los géiseres del desierto.",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Patrimonio de la UNESCO (Chiquitania)",
			destinationId: "santa-cruz",
			days: 5,
			nights: 4,
			itinerary: "Visita a 4 misiones jesuíticas históricas.",
			departmentId: "santa-cruz", // Añadido
		},
		{
			name: "Aventura Extrema (Yungas)",
			destinationId: "la-paz",
			days: 2,
			nights: 1,
			itinerary: "Día 1: Descenso en bicicleta por la 'Carretera de la Muerte'. Día 2: Trekking.",
			departmentId: "la-paz", // Añadido
		},
		{
			name: "Relax en Cobija (Pando)",
			destinationId: "cobija",
			days: 3,
			nights: 2,
			itinerary: "Día 1: Paseo por el río. Día 2: Reserva de fauna silvestre. Día 3: Compras.",
			departmentId: "pando", // Añadido
		},
	]

	// --- INSERTAR DATOS GEOGRÁFICOS ---
	try {
		for (const destination of destinations) {
			const exists = await db
				.select()
				.from(Destination)
				.where(eq(Destination.name, destination.name))
			if (exists.length === 0) {
				await db.insert(Destination).values(destination)
				console.log(`✅ Insertada ciudad: ${destination.name}`)
			} else {
				console.log(`⏭️ Ciudad ya existe: ${destination.name}`)
			}
		}
		console.log("✅ Seed completado correctamente.")
	} catch (e) {
		console.error("Error al insertar cities: ", e)
	}

	// --- INSERTAR PROVEEDORES ---
	for (const p of providersData) {
		const exists = await db.select().from(Provider).where(eq(Provider.id, p.id))
		if (exists.length === 0) {
			await db.insert(Provider).values(p)
			console.log(`✅ Insertado proveedor: ${p.id}`)
		} else {
			console.log(`⏭️ Proveedor ya existe: ${p.id}`)
		}
	}

	// --- INSERTAR SERVICIOS ---
	for (const s of servicesData) {
		// Si tu ID de servicio es la restricción única, búscalo por ID.
		// Si la restricción es el nombre, búscalo por nombre. Asumo que el ID es clave.
		const exists = await db.select().from(Service).where(eq(Service.id, s.id))
		if (exists.length === 0) {
			await db.insert(Service).values(s)
			console.log(`✅ Insertado servicio: ${s.name}`)
		} else {
			console.log(`⏭️ Servicio ya existe: ${s.name}`)
		}
	}

	const allProductsToInsert: any[] = []
	const allHotelsToInsert: any[] = []
	const allToursToInsert: any[] = []
	const allPackagesToInsert: any[] = []

	// --- GENERAR HOTELES ---
	hotelsData.forEach((h, index) => {
		const productId = `prod-H${index + 1}`
		allProductsToInsert.push({
			id: productId,
			name: h.name,
			shortDescription: `Alojamiento ${h.stars} estrellas en ${h.departmentId.toUpperCase()}`,
			longDescription: `Disfrute de la comodidad y lujo en ${h.name}. Ofrecemos una experiencia única con atención de primera y la mejor ubicación para su viaje. Ideal para viajes de negocio y placer.`,
			images: generateImageUrl(productId),
			productType: "Hotel",
			providerId: "e639e684-92e4-472c-a288-c6e53aca65c3",
			departmentId: h.departmentId,
			destinationId: h.destinationId,
			basePriceUSD: 50 + h.stars * 15,
			basePriceBOB: (50 + h.stars * 15) * 6.96,
		})
		allHotelsToInsert.push({
			productId: productId,
			stars: h.stars,
			address: h.address,
			checkInTime: "14:00",
			checkOutTime: "12:00",
		})
	})

	// --- GENERAR TOURS ---
	toursData.forEach((t, index) => {
		const productId = `prod-T${index + 1}`
		allProductsToInsert.push({
			id: productId,
			name: t.name,
			shortDescription: `Tour de ${t.duration} en ${t.departmentId.toUpperCase()}. Nivel: ${t.difficulty}.`,
			longDescription: `Experimente la aventura con nuestro tour exclusivo. Incluye transporte, guía profesional y seguro. No se pierda esta inmersión cultural y natural.`,
			images: generateImageUrl(productId),
			productType: "Tour",
			providerId: providersData[0].id, // Proveedor: EcoTours Bolivia
			departmentId: t.departmentId,
			destinationId: t.destinationId,
			basePriceUSD: 25 + index * 5,
			basePriceBOB: (25 + index * 5) * 6.96,
		})
		allToursToInsert.push({
			productId: productId,
			duration: t.duration,
			difficultyLevel: t.difficulty,
			guideLanguages: t.languages,
			includes: "Transporte, Guía, Agua",
			excludes: "Propinas, Almuerzo",
		})
	})

	// --- GENERAR PAQUETES ---
	packagesData.forEach((p, index) => {
		const productId = `prod-P${index + 1}`
		allProductsToInsert.push({
			id: productId,
			name: p.name,
			shortDescription: `Paquete de ${p.days} días, ${p.nights} noches. Incluye todo lo necesario.`,
			longDescription: `Nuestro paquete turístico más popular. Cubre las mejores atracciones de la región con alojamiento de lujo y todas las comidas incluidas. ¡La opción más cómoda y completa!`,
			images: generateImageUrl(productId),
			productType: "Package",
			providerId: providersData[2].id, // Proveedor: Aventuras del Sur
			departmentId: p.departmentId,
			destinationId: p.destinationId,
			basePriceUSD: 250 + index * 50,
			basePriceBOB: (250 + index * 50) * 6.96,
		})
		allPackagesToInsert.push({
			productId: productId,
			itinerary: p.itinerary,
			days: p.days,
			nights: p.nights,
		})
	})

	// --- INSERCIÓN FINAL DE PRODUCTOS ---
	await db.insert(Product).values(allProductsToInsert)
	await db.insert(Hotel).values(allHotelsToInsert)
	await db.insert(Tour).values(allToursToInsert)
	await db.insert(Package).values(allPackagesToInsert)

	// --- RELACIONES DE SERVICIOS (Ejemplo: Hoteles con Wi-Fi y Desayuno) ---
	const hotelProductIds = allHotelsToInsert.map((h) => h.productId)
	const productServicesToInsert: any[] = []

	// Asignar Wi-Fi (serv-1) y Desayuno (serv-4) a todos los hoteles
	hotelProductIds.forEach((id) => {
		productServicesToInsert.push({ productId: id, serviceId: "serv-1", isFree: true })
		productServicesToInsert.push({ productId: id, serviceId: "serv-4", isFree: true })
	})

	// Asignar Guía Bilingüe (serv-3) y Transporte 4x4 (serv-5) a los Tours
	allToursToInsert
		.filter((t) => t.duration.includes("Día"))
		.forEach((t) => {
			productServicesToInsert.push({ productId: t.productId, serviceId: "serv-3", isFree: true })
			productServicesToInsert.push({
				productId: t.productId,
				serviceId: "serv-5",
				isAvailable: true,
				isFree: false,
			})
		})

	await db.insert(ProductService).values(productServicesToInsert)

	console.log("¡Siembra de datos completada exitosamente!")
}

// const destinations = [
//   {
//     id: "santa-cruz-de-la-sierra",
//     name: "Santa Cruz de la Sierra",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.7892,
//     longitude: -63.1975,
//     slug: slugify("Santa Cruz de la Sierra"),
//   },
//   {
//     id: "la-paz",
//     name: "La Paz",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.4958,
//     longitude: -68.1333,
//     slug: slugify("La Paz"),
//   },
//   {
//     id: "el-alto",
//     name: "El Alto",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.5047,
//     longitude: -68.1633,
//     slug: slugify("El Alto"),
//   },
//   {
//     id: "cochabamba",
//     name: "Cochabamba",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.3883,
//     longitude: -66.1597,
//     slug: slugify("Cochabamba"),
//   },
//   {
//     id: "oruro",
//     name: "Oruro",
//     type: "city",
//     country: "bolivia",
//     department: dept("oruro"),
//     latitude: -17.9667,
//     longitude: -67.1167,
//     slug: slugify("Oruro"),
//   },
//   {
//     id: "sucre",
//     name: "Sucre",
//     type: "city",
//     country: "bolivia",
//     department: dept("chuquisaca"),
//     latitude: -19.0475,
//     longitude: -65.2600,
//     slug: slugify("Sucre"),
//   },
//   {
//     id: "tarija",
//     name: "Tarija",
//     type: "city",
//     country: "bolivia",
//     department: dept("tarija"),
//     latitude: -21.5333,
//     longitude: -64.7333,
//     slug: slugify("Tarija"),
//   },
//   {
//     id: "potosi",
//     name: "Potosí",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -19.5892,
//     longitude: -65.7533,
//     slug: slugify("Potosí"),
//   },
//   {
//     id: "warnes",
//     name: "Warnes",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.5167,
//     longitude: -63.1667,
//     slug: slugify("Warnes"),
//   },
//   {
//     id: "sacaba",
//     name: "Sacaba",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.4042,
//     longitude: -66.0408,
//     slug: slugify("Sacaba"),
//   },
//   {
//     id: "montero",
//     name: "Montero",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.3422,
//     longitude: -63.2558,
//     slug: slugify("Montero"),
//   },
//   {
//     id: "quillacollo",
//     name: "Quillacollo",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.4000,
//     longitude: -66.2833,
//     slug: slugify("Quillacollo"),
//   },
//   {
//     id: "trinidad",
//     name: "Trinidad",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -14.8292,
//     longitude: -64.9014,
//     slug: slugify("Trinidad"),
//   },
//   {
//     id: "riberalta",
//     name: "Riberalta",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -11.0128,
//     longitude: -66.0572,
//     slug: slugify("Riberalta"),
//   },
//   {
//     id: "yacuiba",
//     name: "Yacuiba",
//     type: "city",
//     country: "bolivia",
//     department: dept("tarija"),
//     latitude: -22.0153,
//     longitude: -63.6772,
//     slug: slugify("Yacuiba"),
//   },
//   {
//     id: "villa-tunari",
//     name: "Villa Tunari",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -16.9747,
//     longitude: -65.4203,
//     slug: slugify("Villa Tunari"),
//   },
//   {
//     id: "colcapirhua",
//     name: "Colcapirhua",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.4167,
//     longitude: -66.2500,
//     slug: slugify("Colcapirhua"),
//   },
//   {
//     id: "puerto-villarroel",
//     name: "Puerto Villarroel",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -16.8667,
//     longitude: -64.7831,
//     slug: slugify("Puerto Villarroel"),
//   },
//   {
//     id: "cobija",
//     name: "Cobija",
//     type: "city",
//     country: "bolivia",
//     department: dept("pando"),
//     latitude: -11.0333,
//     longitude: -68.7333,
//     slug: slugify("Cobija"),
//   },
//   {
//     id: "sipe-sipe",
//     name: "Sipe Sipe",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.4500,
//     longitude: -66.3833,
//     slug: slugify("Sipe Sipe"),
//   },
//   {
//     id: "villamontes",
//     name: "Villamontes",
//     type: "city",
//     country: "bolivia",
//     department: dept("tarija"),
//     latitude: -21.2608,
//     longitude: -63.4761,
//     slug: slugify("Villamontes"),
//   },
//   {
//     id: "guayaramerin",
//     name: "Guayaramerín",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -10.8000,
//     longitude: -65.3833,
//     slug: slugify("Guayaramerín"),
//   },
//   {
//     id: "camiri",
//     name: "Camiri",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -20.1000,
//     longitude: -63.5333,
//     slug: slugify("Camiri"),
//   },
//   {
//     id: "tiquipaya",
//     name: "Tiquipaya",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.3333,
//     longitude: -66.2167,
//     slug: slugify("Tiquipaya"),
//   },
//   {
//     id: "viacha",
//     name: "Viacha",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.6533,
//     longitude: -68.3017,
//     slug: slugify("Viacha"),
//   },
//   {
//     id: "bermejo",
//     name: "Bermejo",
//     type: "city",
//     country: "bolivia",
//     department: dept("tarija"),
//     latitude: -22.7322,
//     longitude: -64.3425,
//     slug: slugify("Bermejo"),
//   },
//   {
//     id: "villazon",
//     name: "Villazón",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -22.0911,
//     longitude: -65.5961,
//     slug: slugify("Villazón"),
//   },
//   {
//     id: "uyuni",
//     name: "Uyuni",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -20.4628,
//     longitude: -66.8239,
//     slug: slugify("Uyuni"),
//   },
//   {
//     id: "mizque",
//     name: "Mizque",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.9333,
//     longitude: -65.3167,
//     slug: slugify("Mizque"),
//   },
//   {
//     id: "cotoca",
//     name: "Cotoca",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.7539,
//     longitude: -62.9969,
//     slug: slugify("Cotoca"),
//   },
//   {
//     id: "yapacani",
//     name: "Yapacani",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.4028,
//     longitude: -63.8850,
//     slug: slugify("Yapacani"),
//   },
//   {
//     id: "san-borja",
//     name: "San Borja",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -14.8583,
//     longitude: -66.7475,
//     slug: slugify("San Borja"),
//   },
//   {
//     id: "independencia",
//     name: "Independencia",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.0839,
//     longitude: -66.8181,
//     slug: slugify("Independencia"),
//   },
//   {
//     id: "san-ignacio-de-velasco",
//     name: "San Ignacio de Velasco",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -16.3667,
//     longitude: -60.9500,
//     slug: slugify("San Ignacio de Velasco"),
//   },
//   {
//     id: "tupiza",
//     name: "Tupiza",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -21.4375,
//     longitude: -65.7158,
//     slug: slugify("Tupiza"),
//   },
//   {
//     id: "patacamaya",
//     name: "Patacamaya",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.2333,
//     longitude: -67.9167,
//     slug: slugify("Patacamaya"),
//   },
//   {
//     id: "caranavi",
//     name: "Caranavi",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -15.8333,
//     longitude: -67.5667,
//     slug: slugify("Caranavi"),
//   },
//   {
//     id: "chimoré",
//     name: "Chimoré",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -16.9833,
//     longitude: -65.1333,
//     slug: slugify("Chimoré"),
//   },
//   {
//     id: "san-julian",
//     name: "San Julián",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -16.9064,
//     longitude: -62.6169,
//     slug: slugify("San Julián"),
//   },
//   {
//     id: "huanuni",
//     name: "Huanuni",
//     type: "city",
//     country: "bolivia",
//     department: dept("oruro"),
//     latitude: -18.2900,
//     longitude: -66.8383,
//     slug: slugify("Huanuni"),
//   },
//   {
//     id: "llallagua",
//     name: "Llallagua",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -18.4167,
//     longitude: -66.5833,
//     slug: slugify("Llallagua"),
//   },
//   {
//     id: "capinota",
//     name: "Capinota",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.7150,
//     longitude: -66.2636,
//     slug: slugify("Capinota"),
//   },
//   {
//     id: "rurrenabaque",
//     name: "Rurrenabaque",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -14.4422,
//     longitude: -67.5283,
//     slug: slugify("Rurrenabaque"),
//   },
//   {
//     id: "ascencion-de-guarayos",
//     name: "Ascención de Guarayos",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -15.8922,
//     longitude: -63.1881,
//     slug: slugify("Ascención de Guarayos"),
//   },
//   {
//     id: "achocalla",
//     name: "Achocalla",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.5833,
//     longitude: -68.1667,
//     slug: slugify("Achocalla"),
//   },
//   {
//     id: "mineros",
//     name: "Mineros",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.1178,
//     longitude: -63.2331,
//     slug: slugify("Mineros"),
//   },
//   {
//     id: "san-jose-de-chiquitos",
//     name: "San José de Chiquitos",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.8500,
//     longitude: -60.7500,
//     slug: slugify("San José de Chiquitos"),
//   },
//   {
//     id: "vallegrande",
//     name: "Vallegrande",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.4833,
//     longitude: -64.1000,
//     slug: slugify("Vallegrande"),
//   },
//   {
//     id: "mapiri",
//     name: "Mapiri",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -15.3097,
//     longitude: -68.2161,
//     slug: slugify("Mapiri"),
//   },
//   {
//     id: "portachuelo",
//     name: "Portachuelo",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.3572,
//     longitude: -63.3906,
//     slug: slugify("Portachuelo"),
//   },
//   {
//     id: "comarapa",
//     name: "Comarapa",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.9158,
//     longitude: -64.5300,
//     slug: slugify("Comarapa"),
//   },
//   {
//     id: "punata",
//     name: "Punata",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.5500,
//     longitude: -65.8333,
//     slug: slugify("Punata"),
//   },
//   {
//     id: "villa-yapacani",
//     name: "Villa Yapacaní",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.4028,
//     longitude: -63.8850,
//     slug: slugify("Villa Yapacaní"),
//   },
//   {
//     id: "ascension",
//     name: "Ascensión",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -15.6996,
//     longitude: -63.0800,
//     slug: slugify("Ascensión"),
//   },
//   {
//     id: "vinto",
//     name: "Vinto",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.3833,
//     longitude: -66.3000,
//     slug: slugify("Vinto"),
//   },
//   {
//     id: "chulumani",
//     name: "Chulumani",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.6833,
//     longitude: -67.8667,
//     slug: slugify("Chulumani"),
//   },
//   {
//     id: "santa-ana-de-yacuma",
//     name: "Santa Ana de Yacuma",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -13.7444,
//     longitude: -65.4269,
//     slug: slugify("Santa Ana de Yacuma"),
//   },
//   {
//     id: "challapata",
//     name: "Challapata",
//     type: "city",
//     country: "bolivia",
//     department: dept("oruro"),
//     latitude: -18.9000,
//     longitude: -66.7667,
//     slug: slugify("Challapata"),
//   },
//   {
//     id: "okinawa-numero-uno",
//     name: "Okinawa Número Uno",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.2189,
//     longitude: -62.8953,
//     slug: slugify("Okinawa Número Uno"),
//   },
//   {
//     id: "puerto-suarez",
//     name: "Puerto Suárez",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.9667,
//     longitude: -57.7981,
//     slug: slugify("Puerto Suárez"),
//   },
//   {
//     id: "corocoro",
//     name: "Corocoro",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.1667,
//     longitude: -68.4500,
//     slug: slugify("Corocoro"),
//   },
//   {
//     id: "torotoro",
//     name: "Torotoro",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -18.1342,
//     longitude: -65.7633,
//     slug: slugify("Torotoro"),
//   },
//   {
//     id: "puerto-quijarro",
//     name: "Puerto Quijarro",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.7796,
//     longitude: -57.7700,
//     slug: slugify("Puerto Quijarro"),
//   },
//   {
//     id: "robore",
//     name: "Roboré",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.3333,
//     longitude: -59.7500,
//     slug: slugify("Roboré"),
//   },
//   {
//     id: "san-ignacio-de-moxo",
//     name: "San Ignacio de Moxo",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -14.9961,
//     longitude: -65.6400,
//     slug: slugify("San Ignacio de Moxo"),
//   },
//   {
//     id: "pailon",
//     name: "Pailón",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.6594,
//     longitude: -62.7197,
//     slug: slugify("Pailón"),
//   },
//   {
//     id: "achacachi",
//     name: "Achacachi",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.0444,
//     longitude: -68.6850,
//     slug: slugify("Achacachi"),
//   },
//   {
//     id: "reyes",
//     name: "Reyes",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -14.2958,
//     longitude: -67.3353,
//     slug: slugify("Reyes"),
//   },
//   {
//     id: "monteagudo",
//     name: "Monteagudo",
//     type: "city",
//     country: "bolivia",
//     department: dept("chuquisaca"),
//     latitude: -19.8047,
//     longitude: -63.9561,
//     slug: slugify("Monteagudo"),
//   },
//   {
//     id: "aiquile",
//     name: "Aiquile",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -18.1667,
//     longitude: -65.1667,
//     slug: slugify("Aiquile"),
//   },
//   {
//     id: "charagua",
//     name: "Charagua",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -19.7906,
//     longitude: -63.1978,
//     slug: slugify("Charagua"),
//   },
//   {
//     id: "cliza",
//     name: "Cliza",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.6000,
//     longitude: -65.9333,
//     slug: slugify("Cliza"),
//   },
//   {
//     id: "ivirgarzama",
//     name: "Ivirgarzama",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.0333,
//     longitude: -64.8500,
//     slug: slugify("Ivirgarzama"),
//   },
//   {
//     id: "san-carlos",
//     name: "San Carlos",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.4044,
//     longitude: -63.7325,
//     slug: slugify("San Carlos"),
//   },
//   {
//     id: "copacabana",
//     name: "Copacabana",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -16.1667,
//     longitude: -69.0833,
//     slug: slugify("Copacabana"),
//   },
//   {
//     id: "lahuachaca",
//     name: "Lahuachaca",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.3667,
//     longitude: -67.6667,
//     slug: slugify("Lahuachaca"),
//   },
//   {
//     id: "uncia",
//     name: "Uncia",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -18.4681,
//     longitude: -66.5647,
//     slug: slugify("Uncia"),
//   },
//   {
//     id: "san-ramon",
//     name: "San Ramón",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -13.2672,
//     longitude: -64.6172,
//     slug: slugify("San Ramón"),
//   },
//   {
//     id: "santiago-de-machaca",
//     name: "Santiago de Machaca",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.0667,
//     longitude: -69.2000,
//     slug: slugify("Santiago de Machaca"),
//   },
//   {
//     id: "san-joaquin",
//     name: "San Joaquín",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -13.0414,
//     longitude: -64.6681,
//     slug: slugify("San Joaquín"),
//   },
//   {
//     id: "camargo",
//     name: "Camargo",
//     type: "city",
//     country: "bolivia",
//     department: dept("chuquisaca"),
//     latitude: -20.6403,
//     longitude: -65.2103,
//     slug: slugify("Camargo"),
//   },
//   {
//     id: "samaipata",
//     name: "Samaipata",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.1794,
//     longitude: -63.8756,
//     slug: slugify("Samaipata"),
//   },
//   {
//     id: "magdalena",
//     name: "Magdalena",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -13.2606,
//     longitude: -64.0528,
//     slug: slugify("Magdalena"),
//   },
//   {
//     id: "santa-rosa-del-sara",
//     name: "Santa Rosa del Sara",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.1167,
//     longitude: -63.5833,
//     slug: slugify("Santa Rosa del Sara"),
//   },
//   {
//     id: "colquiri",
//     name: "Colquiri",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.4000,
//     longitude: -67.1333,
//     slug: slugify("Colquiri"),
//   },
//   {
//     id: "guanay",
//     name: "Guanay",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -15.4978,
//     longitude: -67.8794,
//     slug: slugify("Guanay"),
//   },
//   {
//     id: "mairana",
//     name: "Mairana",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.1167,
//     longitude: -63.9333,
//     slug: slugify("Mairana"),
//   },
//   {
//     id: "sicasica",
//     name: "Sicasica",
//     type: "city",
//     country: "bolivia",
//     department: dept("la-paz"),
//     latitude: -17.3333,
//     longitude: -67.7333,
//     slug: slugify("Sicasica"),
//   },
//   {
//     id: "buena-vista",
//     name: "Buena Vista",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.4589,
//     longitude: -63.6592,
//     slug: slugify("Buena Vista"),
//   },
//   {
//     id: "colomi",
//     name: "Colomi",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.3500,
//     longitude: -65.8667,
//     slug: slugify("Colomi"),
//   },
//   {
//     id: "padilla",
//     name: "Padilla",
//     type: "city",
//     country: "bolivia",
//     department: dept("chuquisaca"),
//     latitude: -19.3000,
//     longitude: -64.3000,
//     slug: slugify("Padilla"),
//   },
//   {
//     id: "arani",
//     name: "Arani",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.5667,
//     longitude: -65.7667,
//     slug: slugify("Arani"),
//   },
//   {
//     id: "tarata",
//     name: "Tarata",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.6114,
//     longitude: -66.0233,
//     slug: slugify("Tarata"),
//   },
//   {
//     id: "puerto-pailas",
//     name: "Puerto Pailas",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -17.6675,
//     longitude: -62.7908,
//     slug: slugify("Puerto Pailas"),
//   },
//   {
//     id: "limoncito",
//     name: "Limoncito",
//     type: "city",
//     country: "bolivia",
//     department: dept("santa-cruz"),
//     latitude: -18.0289,
//     longitude: -63.4031,
//     slug: slugify("Limoncito"),
//   },
//   {
//     id: "huacaraje",
//     name: "Huacaraje",
//     type: "city",
//     country: "bolivia",
//     department: dept("el-beni"),
//     latitude: -13.5500,
//     longitude: -63.7500,
//     slug: slugify("Huacaraje"),
//   },
//   {
//     id: "villa-serrano",
//     name: "Villa Serrano",
//     type: "city",
//     country: "bolivia",
//     department: dept("chuquisaca"),
//     latitude: -19.1167,
//     longitude: -64.3333,
//     slug: slugify("Villa Serrano"),
//   },
//   {
//     id: "puerto-rico",
//     name: "Puerto Rico",
//     type: "city",
//     country: "bolivia",
//     department: dept("pando"),
//     latitude: -11.1033,
//     longitude: -67.5547,
//     slug: slugify("Puerto Rico"),
//   },
//   {
//     id: "irpa-irpa",
//     name: "Irpa Irpa",
//     type: "city",
//     country: "bolivia",
//     department: dept("cochabamba"),
//     latitude: -17.7167,
//     longitude: -66.2833,
//     slug: slugify("Irpa Irpa"),
//   },
//   {
//     id: "santa-barbara",
//     name: "Santa Bárbara",
//     type: "city",
//     country: "bolivia",
//     department: dept("potosi"),
//     latitude: -20.9233,
//     longitude: -66.0494,
//     slug: slugify("Santa Bárbara"),
//   },
// ]
