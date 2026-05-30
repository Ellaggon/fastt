import { db, Hotel, Limousine, Tour, Package, eq } from "astro:db"

export type HotelPayload = {
	productId: string
	stars?: number | null
	phone?: string | null
	email?: string | null
	website?: string | null
}
export type TourPayload = {
	productId: string
	duration?: string | null
	difficultyLevel?: string | null
	meetingPointJson?: unknown | null
	itineraryJson?: unknown | null
	safetyJson?: unknown | null
	guideJson?: unknown | null
}
export type PackagePayload = {
	productId: string
	days?: number | null
	nights?: number | null
	itineraryJson?: unknown | null
	includesJson?: unknown | null
	excludesJson?: unknown | null
}
export type LimousinePayload = {
	productId: string
	vehicleProfileJson?: unknown | null
	pickupJson?: unknown | null
	dropoffJson?: unknown | null
	passengerCapacity?: number | null
	luggageCapacity?: number | null
}

type DrizzleDB = typeof db
type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0]
export type DBOrTx = DrizzleDB | DrizzleTx

export class SubtypeRepository {
	async runInTransaction<T>(fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => fn(tx))
	}

	// Convenience helpers so application code doesn't need to import `astro:db`.
	async insertHotelStandalone(data: HotelPayload) {
		return this.insertHotel(db, data)
	}
	async insertTourStandalone(data: TourPayload) {
		return this.insertTour(db, data)
	}
	async insertPackageStandalone(data: PackagePayload) {
		return this.insertPackage(db, data)
	}
	async insertLimousineStandalone(data: LimousinePayload) {
		return this.insertLimousine(db, data)
	}

	/* ---------- HOTEL ---------- */
	async insertHotel(dbOrTx: DBOrTx, data: HotelPayload) {
		return await dbOrTx.insert(Hotel).values({
			productId: data.productId,
			stars: data.stars ?? null,
			phone: data.phone ?? null,
			email: data.email ?? null,
			website: data.website ?? null,
		})
	}

	async updateHotel(dbOrTx: DBOrTx, productId: string, data: Partial<HotelPayload>) {
		await dbOrTx
			.update(Hotel)
			.set({
				stars: data.stars ?? null,
				phone: data.phone ?? null,
				email: data.email ?? null,
				website: data.website ?? null,
			})
			.where(eq(Hotel.productId, productId))
	}

	async deleteHotel(dbOrTx: DBOrTx, productId: string) {
		await dbOrTx.delete(Hotel).where(eq(Hotel.productId, productId))
	}

	/* ---------- TOUR ---------- */
	async insertTour(dbOrTx: DBOrTx, data: TourPayload) {
		return await dbOrTx.insert(Tour).values({
			productId: data.productId,
			duration: data.duration ?? null,
			difficultyLevel: data.difficultyLevel ?? null,
			meetingPointJson: data.meetingPointJson ?? null,
			itineraryJson: data.itineraryJson ?? null,
			safetyJson: data.safetyJson ?? null,
			guideJson: data.guideJson ?? null,
		})
	}

	async updateTour(dbOrTx: DBOrTx, productId: string, data: Partial<TourPayload>) {
		await dbOrTx
			.update(Tour)
			.set({
				duration: data.duration ?? null,
				difficultyLevel: data.difficultyLevel ?? null,
				meetingPointJson: data.meetingPointJson ?? null,
				itineraryJson: data.itineraryJson ?? null,
				safetyJson: data.safetyJson ?? null,
				guideJson: data.guideJson ?? null,
			})
			.where(eq(Tour.productId, productId))
	}

	async deleteTour(dbOrTx: DBOrTx, productId: string) {
		return await dbOrTx.delete(Tour).where(eq(Tour.productId, productId))
	}

	/* ---------- PACKAGE ---------- */
	async insertPackage(dbOrTx: DBOrTx, data: PackagePayload) {
		return await dbOrTx.insert(Package).values({
			productId: data.productId,
			days: data.days ?? null,
			nights: data.nights ?? null,
			itineraryJson: data.itineraryJson ?? null,
			includesJson: data.includesJson ?? null,
			excludesJson: data.excludesJson ?? null,
		})
	}

	async updatePackage(dbOrTx: DBOrTx, productId: string, data: Partial<PackagePayload>) {
		return await dbOrTx
			.update(Package)
			.set({
				days: data.days ?? null,
				nights: data.nights ?? null,
				itineraryJson: data.itineraryJson ?? null,
				includesJson: data.includesJson ?? null,
				excludesJson: data.excludesJson ?? null,
			})
			.where(eq(Package.productId, productId))
	}

	async deletePackage(dbOrTx: DBOrTx, productId: string) {
		await dbOrTx.delete(Package).where(eq(Package.productId, productId))
	}

	/* ---------- LIMOUSINE ---------- */
	async insertLimousine(dbOrTx: DBOrTx, data: LimousinePayload) {
		return await dbOrTx.insert(Limousine).values({
			productId: data.productId,
			vehicleProfileJson: data.vehicleProfileJson ?? null,
			pickupJson: data.pickupJson ?? null,
			dropoffJson: data.dropoffJson ?? null,
			passengerCapacity: data.passengerCapacity ?? null,
			luggageCapacity: data.luggageCapacity ?? null,
		})
	}

	async updateLimousine(dbOrTx: DBOrTx, productId: string, data: Partial<LimousinePayload>) {
		await dbOrTx
			.update(Limousine)
			.set({
				vehicleProfileJson: data.vehicleProfileJson ?? null,
				pickupJson: data.pickupJson ?? null,
				dropoffJson: data.dropoffJson ?? null,
				passengerCapacity: data.passengerCapacity ?? null,
				luggageCapacity: data.luggageCapacity ?? null,
			})
			.where(eq(Limousine.productId, productId))
	}

	async deleteLimousine(dbOrTx: DBOrTx, productId: string) {
		await dbOrTx.delete(Limousine).where(eq(Limousine.productId, productId))
	}

	/* ---------- AUX ---------- */
	async subtypeExists(
		productId: string,
		subtype: "hotel" | "tour" | "package" | "limousine"
	): Promise<boolean>
	async subtypeExists(
		dbOrTx: DBOrTx,
		productId: string,
		subtype: "hotel" | "tour" | "package" | "limousine"
	): Promise<boolean>
	async subtypeExists(a: any, b?: any, c?: any) {
		let dbOrtx: DBOrTx
		let productId: string
		let subtype: "hotel" | "tour" | "package" | "limousine"

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

		// Preserve legacy semantics (even though it ignores the tx variable in selects).
		if (subtype === "hotel") {
			const r = await db.select().from(Hotel).where(eq(Hotel.productId, productId)).get()
			return !!r
		}
		if (subtype === "tour") {
			const r = await db.select().from(Tour).where(eq(Tour.productId, productId)).get()
			return !!r
		}
		if (subtype === "package") {
			const r = await db.select().from(Package).where(eq(Package.productId, productId)).get()
			return !!r
		}
		const r = await db.select().from(Limousine).where(eq(Limousine.productId, productId)).get()
		return !!r
	}
}
