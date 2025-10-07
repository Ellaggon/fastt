import {
	db,
	eq,
	Provider,
	City,
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
export default async function seed() {
	console.log("Iniciando la siembra de datos...")

	// --- 1. Datos Geográficos (Ciudades/Departamentos de Bolivia) ---
	const cities = [
		{
			id: "uuid-city-cobija",
			name: "Cobija",
			department: dept("pando"),
			latitude: -11.0267,
			longitude: -68.7692,
			description:
				"Cobija, la capital de Pando, es una ciudad amazónica en la frontera con Brasil, rodeada de ríos y selva. Su ambiente fronterizo y su historia ligada a la explotación del caucho la convierten en un lugar exótico. Explora sus mercados, navega por el río Acre y sumérgete en la vida de una de las ciudades más remotas de Bolivia.",
		},
		{
			id: "uuid-city-trinidad",
			name: "Trinidad",
			department: dept("beni"),
			latitude: -14.8333,
			longitude: -64.9,
			description:
				"Trinidad, la capital del Beni, es la puerta de entrada a la Amazonía boliviana. Un destino donde la vida gira en torno a los ríos y la ganadería. Con sus fiestas folclóricas y su vibrante cultura, es el lugar ideal para explorar las vastas llanuras y los humedales del Beni, hogar de una fauna espectacular.",
		},
		{
			id: "uuid-city-cochabamba",
			name: "Cochabamba",
			department: dept("cochabamba"),
			latitude: -17.3939,
			longitude: -66.1568,
			description:
				"Cochabamba, la capital gastronómica de Bolivia, es una ciudad moderna y vibrante, enclavada en un valle fértil. Conocida por su deliciosa comida, su agradable clima y su gente hospitalaria. Disfruta de sus parques, su vida nocturna y las impresionantes vistas desde el Cristo de la Concordia, la estatua de Cristo más grande del mundo.",
		},
		{
			id: "uuid-city-oruro",
			name: "Oruro",
			department: dept("oruro"),
			latitude: -17.9622,
			longitude: -67.1121,
			description:
				"Oruro, una ciudad minera en el altiplano, es un crisol de cultura y tradición. Su mayor atractivo es el Carnaval, una explosión de música, danza y devoción. Explora su historia minera, visita los lagos cercanos y adéntrate en un destino que te hará sentir la mística del altiplano.",
		},
		{
			id: "uuid-city-potosi",
			name: "Potosí",
			department: dept("potosi"),
			latitude: -19.5833,
			longitude: -65.75,
			description:
				"Potosí, la ciudad más alta del mundo, es una joya colonial y un testimonio de la historia. Su centro histórico, con sus calles empedradas y sus iglesias barrocas, te transporta al pasado. Es la base ideal para explorar el Salar de Uyuni y vivir la experiencia de la historia minera de Bolivia.",
		},
		{
			id: "uuid-city-sucre",
			name: "Sucre",
			department: dept("chuquisaca"),
			latitude: -19.0333,
			longitude: -65.2627,
			description:
				"Sucre, la capital constitucional de Bolivia, es una 'Ciudad Blanca' de arquitectura colonial, declarada Patrimonio de la Humanidad. Su ambiente tranquilo, sus patios floridos y sus impresionantes edificios históricos la convierten en una de las ciudades más hermosas de Sudamérica. Es un destino perfecto para la historia, la cultura y la relajación.",
		},
		{
			id: "uuid-city-tarija",
			name: "Tarija",
			department: dept("tarija"),
			latitude: -21.535,
			longitude: -64.7291,
			description:
				"Tarija, la 'ciudad del vino', te enamorará con su clima agradable y su ambiente andaluz. Explora sus viñedos, degusta sus vinos de altura y disfruta de la hospitalidad de su gente. Un destino para los amantes de la buena mesa, el vino y la música, rodeado de un paisaje de valles fértiles y hermosas montañas.",
		},
		{
			id: "uuid-city-lapaz",
			name: "Nuestra Señora de La Paz",
			department: dept("lapaz"),
			latitude: -16.5,
			longitude: -68.15,
			description:
				"La Paz, la sede de gobierno de Bolivia, es una metrópoli andina que desafía la gravedad. Situada en un cañón, sus casas se aferran a las laderas y sus teleféricos ofrecen vistas de otro mundo. Explora el Mercado de las Brujas, maravíllate con la arquitectura colonial de la Plaza Murillo y siente la energía única de una ciudad suspendida entre las nubes.",
		},
		{
			id: "uuid-city-santacruz",
			name: "Santa Cruz de la Cierra",
			department: dept("santacruz"),
			latitude: -17.7833,
			longitude: -63.1822,
			description:
				"Santa Cruz de la Sierra es la capital del oriente boliviano y un oasis de modernidad y tradición. Con su clima cálido y su atmósfera relajada, es el punto de partida ideal para explorar la selva, los safaris fotográficos y las impresionantes ruinas de las misiones jesuíticas. Disfruta de la hospitalidad cruceña y de su deliciosa cocina, donde el sabor de la tierra es protagonista.",
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
			cityId: "uuid-city-santacruz",
			stars: 5,
			address: "Av. San Martín",
			departmentId: "santacruz", // Corregido/Añadido
		},
		{
			name: "Hotel Presidente",
			cityId: "uuid-city-lapaz",
			stars: 4,
			address: "Av. 6 de Agosto",
			departmentId: "lapaz", // Corregido/Añadido
		},
		{
			name: "Cochabamba Palace Hotel",
			cityId: "uuid-city-cochabamba",
			stars: 4,
			address: "Av. Libertador",
			departmentId: "cochabamba", // Corregido/Añadido
		},
		{
			name: "Parador Santa Maria La Real",
			cityId: "uuid-city-sucre",
			stars: 5,
			address: "Calle Bolívar",
			departmentId: "chuquisaca", // Añadido (Sucre)
		},
		{
			name: "Hostal Colonial",
			cityId: "uuid-city-potosi",
			stars: 3,
			address: "Calle Linares",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Hotel Los Parrales",
			cityId: "uuid-city-tarija",
			stars: 4,
			address: "Av. La Banda",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Gran Hotel Trópico",
			cityId: "uuid-city-trinidad",
			stars: 3,
			address: "Plaza Principal",
			departmentId: "beni", // Añadido (Trinidad)
		},
		{
			name: "Hotel Edén",
			cityId: "uuid-city-oruro",
			stars: 3,
			address: "Calle Junín",
			departmentId: "oruro", // Añadido
		},
		{
			name: "Hotel Cabañas del Lago",
			cityId: "uuid-city-cobija",
			stars: 4,
			address: "Ribera del Acre",
			departmentId: "pando", // Añadido (Cobija)
		},
		{
			name: "Casa Grande Hotel",
			cityId: "uuid-city-lapaz",
			stars: 5,
			address: "Zona Sur",
			departmentId: "lapaz", // Añadido
		},
		{
			name: "Senses Hotel Boutique",
			cityId: "uuid-city-santacruz",
			stars: 4,
			address: "Equipetrol",
			departmentId: "santacruz", // Añadido
		},
		{
			name: "Cesars Plaza Hotel",
			cityId: "uuid-city-cochabamba",
			stars: 3,
			address: "Centro Histórico",
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Hotel Samary",
			cityId: "uuid-city-sucre",
			stars: 4,
			address: "Barrio San Lázaro",
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Gala Hotel",
			cityId: "uuid-city-potosi",
			stars: 3,
			address: "Cerca de la Casa de la Moneda",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Hostal Carmen",
			cityId: "uuid-city-tarija",
			stars: 2,
			address: "Barrio Central",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Hotel Trinidad",
			cityId: "uuid-city-trinidad",
			stars: 4,
			address: "Zona Residencial",
			departmentId: "beni", // Añadido
		},
		{
			name: "Regis Hotel",
			cityId: "uuid-city-oruro",
			stars: 4,
			address: "Av. 6 de Agosto",
			departmentId: "oruro", // Añadido
		},
		{
			name: "Pando Palace",
			cityId: "uuid-city-cobija",
			stars: 3,
			address: "Cerca del Aeropuerto",
			departmentId: "pando", // Añadido
		},
		{
			name: "La Casona Hotel",
			cityId: "uuid-city-lapaz",
			stars: 3,
			address: "Casco Viejo",
			departmentId: "lapaz", // Añadido
		},
		{
			name: "Resort Jardines del Este",
			cityId: "uuid-city-santacruz",
			stars: 5,
			address: "Kilómetro 8",
			departmentId: "santacruz", // Añadido
		},
	]

	const toursData = [
		{
			name: "City Tour Histórico La Paz",
			cityId: "uuid-city-lapaz",
			duration: "4 Horas",
			difficulty: "Fácil",
			languages: ["Español", "Inglés"],
			departmentId: "lapaz", // Añadido
		},
		{
			name: "Salar de Uyuni: 3 Días y 2 Noches",
			cityId: "uuid-city-potosi",
			duration: "3 Días",
			difficulty: "Moderado",
			languages: ["Español", "Francés"],
			departmentId: "potosi", // Añadido
		},
		{
			name: "Ruta del Vino y Singani",
			cityId: "uuid-city-tarija",
			duration: "8 Horas",
			difficulty: "Fácil",
			languages: ["Español"],
			departmentId: "tarija", // Añadido
		},
		{
			name: "Parque Nacional Amboró - Lado Oeste",
			cityId: "uuid-city-santacruz",
			duration: "1 Día",
			difficulty: "Moderado",
			languages: ["Español", "Alemán"],
			departmentId: "santacruz", // Añadido
		},
		{
			name: "Parque Toro Toro: Cañones y Dinosaurios",
			cityId: "uuid-city-cochabamba",
			duration: "2 Días",
			difficulty: "Moderado",
			languages: ["Español"],
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Recorrido por la Casa de la Libertad",
			cityId: "uuid-city-sucre",
			duration: "3 Horas",
			difficulty: "Fácil",
			languages: ["Español", "Portugués"],
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Ruta de la Coca y el Chairo",
			cityId: "uuid-city-lapaz",
			duration: "6 Horas",
			difficulty: "Moderado",
			languages: ["Español"],
			departmentId: "lapaz", // Añadido
		},
		{
			name: "Misiones Jesuíticas de Chiquitos",
			cityId: "uuid-city-santacruz",
			duration: "3 Días",
			difficulty: "Fácil",
			languages: ["Español", "Inglés"],
			departmentId: "santacruz", // Añadido
		},
		{
			name: "Carnaval de Oruro: Entrada VIP",
			cityId: "uuid-city-oruro",
			duration: "1 Día",
			difficulty: "Fácil",
			languages: ["Español"],
			departmentId: "oruro", // Añadido
		},
		{
			name: "Amazonía Profunda - Río Mamoré",
			cityId: "uuid-city-trinidad",
			duration: "4 Días",
			difficulty: "Difícil",
			languages: ["Español", "Inglés"],
			departmentId: "beni", // Añadido
		},
	]

	const packagesData = [
		{
			name: "Aventura Boliviana (Uyuni + Amboró)",
			cityId: "uuid-city-santacruz",
			days: 7,
			nights: 6,
			itinerary: "Día 1: SCZ a Uyuni. Días 2-3: Salar. Día 4: Vuelo a SCZ. Días 5-6: Amboró.",
			departmentId: "santacruz", // Añadido
		},
		{
			name: "Culturas Andinas (La Paz + Titicaca)",
			cityId: "uuid-city-lapaz",
			days: 5,
			nights: 4,
			itinerary: "Día 1: City Tour LPZ. Día 2: Tiwanaku. Días 3-4: Copacabana e Isla del Sol.",
			departmentId: "lapaz", // Añadido
		},
		{
			name: "El Encanto del Sur (Sucre + Potosí)",
			cityId: "uuid-city-sucre",
			days: 4,
			nights: 3,
			itinerary: "Días 1-2: Sucre colonial. Días 3-4: Potosí (Mina y Casa de la Moneda).",
			departmentId: "chuquisaca", // Añadido
		},
		{
			name: "Trópico y Valle (Cochabamba)",
			cityId: "uuid-city-cochabamba",
			days: 3,
			nights: 2,
			itinerary: "Día 1: Cristo de la Concordia. Día 2: Parque Machía y Trópico. Día 3: Regreso.",
			departmentId: "cochabamba", // Añadido
		},
		{
			name: "Descanso y Viñedos (Tarija)",
			cityId: "uuid-city-tarija",
			days: 3,
			nights: 2,
			itinerary: "Día 1: City Tour. Días 2: Visita a 3 bodegas. Día 3: Tiempo libre.",
			departmentId: "tarija", // Añadido
		},
		{
			name: "Misterios Amazónicos (Beni)",
			cityId: "uuid-city-trinidad",
			days: 4,
			nights: 3,
			itinerary: "Día 1: Llegada a Trinidad. Días 2-3: Safari fluvial y fauna. Día 4: Despedida.",
			departmentId: "beni", // Añadido
		},
		{
			name: "Ruta de las Lagunas (Potosí)",
			cityId: "uuid-city-potosi",
			days: 4,
			nights: 3,
			itinerary: "Recorrido completo por las lagunas de colores y los géiseres del desierto.",
			departmentId: "potosi", // Añadido
		},
		{
			name: "Patrimonio de la UNESCO (Chiquitania)",
			cityId: "uuid-city-santacruz",
			days: 5,
			nights: 4,
			itinerary: "Visita a 4 misiones jesuíticas históricas.",
			departmentId: "santacruz", // Añadido
		},
		{
			name: "Aventura Extrema (Yungas)",
			cityId: "uuid-city-lapaz",
			days: 2,
			nights: 1,
			itinerary: "Día 1: Descenso en bicicleta por la 'Carretera de la Muerte'. Día 2: Trekking.",
			departmentId: "lapaz", // Añadido
		},
		{
			name: "Relax en Cobija (Pando)",
			cityId: "uuid-city-cobija",
			days: 3,
			nights: 2,
			itinerary: "Día 1: Paseo por el río. Día 2: Reserva de fauna silvestre. Día 3: Compras.",
			departmentId: "pando", // Añadido
		},
	]

	// --- INSERTAR DATOS GEOGRÁFICOS ---
	try {
		for (const city of cities) {
			const exists = await db.select().from(City).where(eq(City.name, city.name))
			if (exists.length === 0) {
				await db.insert(City).values(city)
				console.log(`✅ Insertada ciudad: ${city.name}`)
			} else {
				console.log(`⏭️ Ciudad ya existe: ${city.name}`)
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
	await db.insert(Service).values(servicesData)

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
			shortDescription: `Alojamiento ${h.stars} estrellas en ${h.cityId.toUpperCase()}`,
			longDescription: `Disfrute de la comodidad y lujo en ${h.name}. Ofrecemos una experiencia única con atención de primera y la mejor ubicación para su viaje. Ideal para viajes de negocio y placer.`,
			images: generateImageUrl(productId),
			productType: "Hotel",
			providerId: "dda096b1-9d55-4013-aed3-d8c2b327e68d",
			departmentId: h.departmentId,
			cityId: h.cityId,
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
			shortDescription: `Tour de ${t.duration} en ${t.cityId.toUpperCase()}. Nivel: ${t.difficulty}.`,
			longDescription: `Experimente la aventura con nuestro tour exclusivo. Incluye transporte, guía profesional y seguro. No se pierda esta inmersión cultural y natural.`,
			images: generateImageUrl(productId),
			productType: "Tour",
			providerId: providersData[0].id, // Proveedor: EcoTours Bolivia
			departmentId: t.departmentId,
			cityId: t.cityId,
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
			cityId: p.cityId,
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
