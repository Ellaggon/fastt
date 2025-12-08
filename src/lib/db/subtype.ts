import { db, Hotel, Tour, Package, eq, HotelRoomType } from "astro:db"

export type HotelPayload = {
	productId: string
	stars?: number | null
	address?: string | null
	phone?: string | null
	email?: string | null
	website?: string | null
	latitude?: number | null
	longitude?: number | null
}
export type TourPayload = {
	productId: string
	duration?: string | null
	difficultyLevel?: string | null
	guideLanguages?: string[] | null
	includes?: string | null
	excludes?: string | null
}
export type PackagePayload = {
	productId: string
	itinerary?: string | null
	days?: number | null
	nights?: number | null
}

type DrizzleDB = typeof db
type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0]
export type DBOrTx = DrizzleDB | DrizzleTx

/* ---------- HOTEL ---------- */
export async function insertHotel(dbOrTx: DBOrTx, data: HotelPayload) {
	return await dbOrTx.insert(Hotel).values({
		productId: data.productId,
		stars: data.stars ?? null,
		address: data.address ?? null,
		phone: data.phone ?? null,
		email: data.email ?? null,
		website: data.website ?? null,
		latitude: data.latitude ?? null,
		longitude: data.longitude ?? null,
	})
}
export async function updateHotel(dbOrTx: DBOrTx, productId: string, data: Partial<HotelPayload>) {
	await dbOrTx
		.update(Hotel)
		.set({
			stars: data.stars ?? null,
			address: data.address ?? null,
			phone: data.phone ?? null,
			email: data.email ?? null,
			website: data.website ?? null,
			latitude: data.latitude ?? null,
			longitude: data.longitude ?? null,
		})
		.where(eq(Hotel.productId, productId))
}
export async function deleteHotel(dbOrTx: DBOrTx, productId: string) {
	// borrar hotel room types (si la tabla existe y tiene hotelId)
	try {
		await dbOrTx.delete(HotelRoomType).where(eq(HotelRoomType.hotelId, productId))
	} catch (e) {
		console.warn("deleteHotel: no pudo borrar HotelRoomType (o no existe): ", e)
	}
	await dbOrTx.delete(Hotel).where(eq(Hotel.productId, productId))
}

/* ---------- TOUR ---------- */
export async function insertTour(dbOrTx: DBOrTx, data: TourPayload) {
	return await dbOrTx.insert(Tour).values({
		productId: data.productId,
		duration: data.duration ?? null,
		difficultyLevel: data.difficultyLevel ?? null,
		guideLanguages: data.guideLanguages ?? null,
		includes: data.includes ?? null,
		excludes: data.excludes ?? null,
	})
}
export async function updateTour(dbOrTx: DBOrTx, productId: string, data: Partial<TourPayload>) {
	await dbOrTx
		.update(Tour)
		.set({
			duration: data.duration ?? null,
			difficultyLevel: data.difficultyLevel ?? null,
			guideLanguages: data.guideLanguages ?? null,
			includes: data.includes ?? null,
			excludes: data.excludes ?? null,
		})
		.where(eq(Tour.productId, productId))
}
export async function deleteTour(dbOrTx: DBOrTx, productId: string) {
	return await dbOrTx.delete(Tour).where(eq(Tour.productId, productId))
}

/* ---------- PACKAGE ---------- */
export async function insertPackage(dbOrTx: DBOrTx, data: PackagePayload) {
	return await dbOrTx.insert(Package).values({
		productId: data.productId,
		itinerary: data.itinerary ?? null,
		days: data.days ?? null,
		nights: data.nights ?? null,
	})
}
export async function updatePackage(
	dbOrTx: DBOrTx,
	productId: string,
	data: Partial<PackagePayload>
) {
	return await dbOrTx
		.update(Package)
		.set({
			itinerary: data.itinerary ?? null,
			days: data.days ?? null,
			nights: data.nights ?? null,
		})
		.where(eq(Package.productId, productId))
}
export async function deletePackage(dbOrTx: DBOrTx, productId: string) {
	await dbOrTx.delete(Package).where(eq(Package.productId, productId))
}

/* ---------- AUX ---------- */
/** Verifica existencia previa del subtype para productId */
export async function subtypeExists(
	productId: string,
	subtype: "hotel" | "tour" | "package"
): Promise<boolean>
export async function subtypeExists(
	dbOrTx: DBOrTx,
	productId: string,
	subtype: "hotel" | "tour" | "package"
): Promise<boolean>
export async function subtypeExists(a: any, b?: any, c?: any) {
	let dbOrtx: DBOrTx
	let productId: string
	let subtype: "hotel" | "tour" | "package"

	if (typeof a === "string") {
		// llamada: subtypeExists(productId, subtype)
		dbOrtx = db
		productId = a
		subtype = b
	} else {
		// llamada: subtypeExists(dbOrTx, productId, subtype)
		dbOrtx = a
		productId = b
		subtype = c
	}

	if (subtype === "hotel") {
		const r = await db.select().from(Hotel).where(eq(Hotel.productId, productId)).get()
		return !!r
	}
	if (subtype === "tour") {
		const r = await db.select().from(Tour).where(eq(Tour.productId, productId)).get()
		return !!r
	}
	const r = await db.select().from(Package).where(eq(Package.productId, productId)).get()
	return !!r
}
