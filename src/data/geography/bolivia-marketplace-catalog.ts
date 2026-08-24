export const BOLIVIA_MARKETPLACE_CATALOG_VERSION = "2026.08.24"

export const BOLIVIA_ADMINISTRATIVE_SOURCE = {
	name: "Instituto Nacional de Estadística de Bolivia",
	url: "https://anda4.ine.gob.bo/ANDA4_3/index.php/catalog/495/download/2358",
} as const

export const BOLIVIA_COORDINATE_SOURCE = {
	name: "GeoNames",
	url: "https://www.geonames.org/export/",
	datum: "WGS84",
} as const

export type BoliviaGeoPlaceSeed = {
	id: string
	slug: string
	canonicalName: string
	placeType: "country" | "admin_area_1" | "city"
	parentId: string | null
	latitude: number
	longitude: number
	timezone: string
	aliases?: readonly { value: string; type?: "historic" | "alternate" | "search" }[]
}

export type BoliviaGeoPlaceContentSeed = {
	placeId: string
	title: string
	summary: string
	seoJson: {
		metaTitle: string
		metaDescription: string
	}
}

const country: BoliviaGeoPlaceSeed = {
	id: "geo:bo",
	slug: "bolivia",
	canonicalName: "Bolivia",
	placeType: "country",
	parentId: null,
	latitude: -16.2902,
	longitude: -63.5887,
	timezone: "America/La_Paz",
	aliases: [{ value: "Estado Plurinacional de Bolivia", type: "historic" }],
}

const departments: readonly BoliviaGeoPlaceSeed[] = [
	{
		id: "geo:bo:chuquisaca",
		slug: "chuquisaca",
		canonicalName: "Chuquisaca",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -19.0477,
		longitude: -64.9278,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:la-paz-department",
		slug: "la-paz-department",
		canonicalName: "La Paz",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -15.6333,
		longitude: -68.1333,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:cochabamba",
		slug: "cochabamba",
		canonicalName: "Cochabamba",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -17.5697,
		longitude: -65.7557,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:oruro",
		slug: "oruro",
		canonicalName: "Oruro",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -18.5712,
		longitude: -67.5397,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:potosi",
		slug: "potosi",
		canonicalName: "Potosí",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -19.5871,
		longitude: -65.7539,
		timezone: "America/La_Paz",
		aliases: [{ value: "Potosi", type: "search" }],
	},
	{
		id: "geo:bo:tarija",
		slug: "tarija",
		canonicalName: "Tarija",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -21.5355,
		longitude: -64.7296,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:santa-cruz",
		slug: "santa-cruz",
		canonicalName: "Santa Cruz",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -17.7705,
		longitude: -63.1809,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:beni",
		slug: "beni",
		canonicalName: "Beni",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -14.3783,
		longitude: -65.0958,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:pando",
		slug: "pando",
		canonicalName: "Pando",
		placeType: "admin_area_1",
		parentId: country.id,
		latitude: -11.0394,
		longitude: -68.7079,
		timezone: "America/La_Paz",
	},
]

const cities: readonly BoliviaGeoPlaceSeed[] = [
	{
		id: "geo:bo:sucre",
		slug: "sucre",
		canonicalName: "Sucre",
		placeType: "city",
		parentId: "geo:bo:chuquisaca",
		latitude: -19.0333,
		longitude: -65.2627,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:la-paz-city",
		slug: "la-paz",
		canonicalName: "La Paz",
		placeType: "city",
		parentId: "geo:bo:la-paz-department",
		latitude: -16.5,
		longitude: -68.15,
		timezone: "America/La_Paz",
		aliases: [{ value: "Nuestra Señora de La Paz", type: "historic" }],
	},
	{
		id: "geo:bo:el-alto",
		slug: "el-alto",
		canonicalName: "El Alto",
		placeType: "city",
		parentId: "geo:bo:la-paz-department",
		latitude: -16.5,
		longitude: -68.2,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:copacabana",
		slug: "copacabana",
		canonicalName: "Copacabana",
		placeType: "city",
		parentId: "geo:bo:la-paz-department",
		latitude: -16.1667,
		longitude: -69.0833,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:coroico",
		slug: "coroico",
		canonicalName: "Coroico",
		placeType: "city",
		parentId: "geo:bo:la-paz-department",
		latitude: -16.1881,
		longitude: -67.7268,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:rurrenabaque",
		slug: "rurrenabaque",
		canonicalName: "Rurrenabaque",
		placeType: "city",
		parentId: "geo:bo:beni",
		latitude: -14.4413,
		longitude: -67.5278,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:cochabamba-city",
		slug: "cochabamba-city",
		canonicalName: "Cochabamba",
		placeType: "city",
		parentId: "geo:bo:cochabamba",
		latitude: -17.3895,
		longitude: -66.1568,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:quillacollo",
		slug: "quillacollo",
		canonicalName: "Quillacollo",
		placeType: "city",
		parentId: "geo:bo:cochabamba",
		latitude: -17.3935,
		longitude: -66.2784,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:oruro-city",
		slug: "oruro-city",
		canonicalName: "Oruro",
		placeType: "city",
		parentId: "geo:bo:oruro",
		latitude: -17.9833,
		longitude: -67.15,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:potosi-city",
		slug: "potosi-city",
		canonicalName: "Potosí",
		placeType: "city",
		parentId: "geo:bo:potosi",
		latitude: -19.5836,
		longitude: -65.7531,
		timezone: "America/La_Paz",
		aliases: [{ value: "Potosi", type: "search" }],
	},
	{
		id: "geo:bo:uyuni",
		slug: "uyuni",
		canonicalName: "Uyuni",
		placeType: "city",
		parentId: "geo:bo:potosi",
		latitude: -20.4597,
		longitude: -66.825,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:tupiza",
		slug: "tupiza",
		canonicalName: "Tupiza",
		placeType: "city",
		parentId: "geo:bo:potosi",
		latitude: -21.4435,
		longitude: -65.7185,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:tarija-city",
		slug: "tarija-city",
		canonicalName: "Tarija",
		placeType: "city",
		parentId: "geo:bo:tarija",
		latitude: -21.5355,
		longitude: -64.7296,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:yacuiba",
		slug: "yacuiba",
		canonicalName: "Yacuiba",
		placeType: "city",
		parentId: "geo:bo:tarija",
		latitude: -22.0164,
		longitude: -63.6775,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:santa-cruz-de-la-sierra",
		slug: "santa-cruz-de-la-sierra",
		canonicalName: "Santa Cruz de la Sierra",
		placeType: "city",
		parentId: "geo:bo:santa-cruz",
		latitude: -17.7863,
		longitude: -63.1812,
		timezone: "America/La_Paz",
		aliases: [{ value: "Santa Cruz", type: "alternate" }],
	},
	{
		id: "geo:bo:samaipata",
		slug: "samaipata",
		canonicalName: "Samaipata",
		placeType: "city",
		parentId: "geo:bo:santa-cruz",
		latitude: -18.1801,
		longitude: -63.875,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:san-jose-de-chiquitos",
		slug: "san-jose-de-chiquitos",
		canonicalName: "San José de Chiquitos",
		placeType: "city",
		parentId: "geo:bo:santa-cruz",
		latitude: -17.848,
		longitude: -60.743,
		timezone: "America/La_Paz",
		aliases: [{ value: "San Jose de Chiquitos", type: "search" }],
	},
	{
		id: "geo:bo:trinidad",
		slug: "trinidad",
		canonicalName: "Trinidad",
		placeType: "city",
		parentId: "geo:bo:beni",
		latitude: -14.8333,
		longitude: -64.9,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:riberalta",
		slug: "riberalta",
		canonicalName: "Riberalta",
		placeType: "city",
		parentId: "geo:bo:beni",
		latitude: -10.9833,
		longitude: -66.1,
		timezone: "America/La_Paz",
	},
	{
		id: "geo:bo:cobija",
		slug: "cobija",
		canonicalName: "Cobija",
		placeType: "city",
		parentId: "geo:bo:pando",
		latitude: -11.0333,
		longitude: -68.7333,
		timezone: "America/La_Paz",
	},
]

export const BOLIVIA_MARKETPLACE_GEO_PLACES = [country, ...departments, ...cities] as const

const departmentSummaries: Record<string, string> = {
	"geo:bo:beni":
		"Llanos, ríos y naturaleza para viajes de ritmo tranquilo y experiencias al aire libre.",
	"geo:bo:chuquisaca":
		"Historia, arquitectura y cultura viva alrededor de Sucre y sus paisajes cercanos.",
	"geo:bo:cochabamba":
		"Valles, gastronomía y una base cómoda para descubrir el centro de Bolivia.",
	"geo:bo:la-paz-department":
		"Altiplano, ciudad, lago y montaña en una región de contrastes para cada tipo de viaje.",
	"geo:bo:oruro":
		"Tradición, altiplano y paisajes abiertos con una identidad cultural propia.",
	"geo:bo:potosi":
		"Historia minera, rutas andinas y el salar de Uyuni para viajes de gran escala.",
	"geo:bo:tarija":
		"Valles, viñedos y gastronomía en un destino sereno del sur de Bolivia.",
	"geo:bo:santa-cruz":
		"Ciudad, naturaleza y escapadas tropicales desde el oriente boliviano.",
	"geo:bo:pando":
		"Amazonía, biodiversidad y recorridos de naturaleza en el norte del país.",
}

function defaultSummary(place: BoliviaGeoPlaceSeed): string {
	if (place.placeType === "country") {
		return "Encuentra alojamientos y experiencias para organizar tu viaje por Bolivia."
	}
	if (place.placeType === "admin_area_1") {
		return departmentSummaries[place.id] ?? `Explora alojamientos y experiencias en ${place.canonicalName}.`
	}
	return `Encuentra alojamientos y experiencias para conocer ${place.canonicalName}.`
}

export const BOLIVIA_GEO_PLACE_CONTENT: readonly BoliviaGeoPlaceContentSeed[] =
	BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => {
		const summary = defaultSummary(place)
		return {
			placeId: place.id,
			title: place.canonicalName,
			summary,
			seoJson: {
				metaTitle: `${place.canonicalName} | Alojamientos y experiencias en Fastt`,
				metaDescription: summary,
			},
		}
	})
