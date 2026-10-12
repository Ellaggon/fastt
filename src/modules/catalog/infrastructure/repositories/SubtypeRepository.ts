import { experienceProgramMoments } from "@/shared/domain/experience-program"
import { tourProgramPatch } from "@/modules/catalog/application/tourProgramPatch"
import { tourProgramSchema } from "@/schemas/product/subtype"
import {
	first,
	db,
	Hotel,
	Limousine,
	Tour,
	Package,
	Product,
	and,
	eq,
} from "@/shared/infrastructure/db/compat"

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
	durationMinutes?: number | null
	difficultyLevel?: string | null
	meetingPointJson?: unknown | null
	itineraryJson?: unknown | null
	safetyJson?: unknown | null
	guideJson?: unknown | null
	includesJson?: unknown | null
	excludesJson?: unknown | null
	pickupJson?: unknown | null
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

	// Convenience helpers keep application code behind the repository boundary.
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
			durationMinutes: data.durationMinutes ?? null,
			difficultyLevel: data.difficultyLevel ?? null,
			meetingPointJson: data.meetingPointJson ?? null,
			itineraryJson: data.itineraryJson ?? null,
			safetyJson: data.safetyJson ?? null,
			guideJson: data.guideJson ?? null,
			includesJson: data.includesJson ?? null,
			excludesJson: data.excludesJson ?? null,
			pickupJson: data.pickupJson ?? null,
		})
	}

	async updateTour(dbOrTx: DBOrTx, productId: string, data: Partial<TourPayload>) {
		const patch = { ...data }
		delete patch.productId
		if (!Object.keys(patch).length) return
		await dbOrTx
			.update(Tour)
			.set(patch as any)
			.where(eq(Tour.productId, productId))
	}

	/** Serialize program edits with format declarations; validate the effective saved record. */
	async saveTourProgram(productId: string, providerId: string, form: FormData) {
		return db.transaction(async (tx) => {
			const [product] = await tx
				.select({ id: Product.id })
				.from(Product)
				.where(
					and(
						eq(Product.id, productId),
						eq(Product.providerId, providerId),
						eq(Product.productType, "tour")
					)
				)
				.for("update")
			if (!product)
				return Response.json({ error: "No tienes acceso a esta experiencia." }, { status: 403 })
			const [current] = await tx.select().from(Tour).where(eq(Tour.productId, productId))
			const expected = form.get("expectedExperienceFormat")
			if (expected !== null && expected !== (current?.experienceFormat ?? "historical"))
				return Response.json(
					{
						error:
							"El formato cambió. Recarga el formulario antes de guardar; tus cambios no se guardaron.",
					},
					{ status: 409 }
				)
			const patch = tourProgramPatch(form, current ?? {})
			const parsed = tourProgramSchema.safeParse({
				...current,
				...patch,
				itineraryJson: experienceProgramMoments(patch.itineraryJson ?? current?.itineraryJson).map(
					(description, index) => ({ step: index + 1, description })
				),
				productId,
				productType: "tour",
				experienceFormat: current?.experienceFormat ?? null,
			})
			if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
			if (current) await this.updateTour(tx, productId, patch)
			else await this.insertTour(tx, { productId, ...patch })
			return Response.json({ ok: true })
		})
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

		// Read through the same transaction as the subtype mutation.
		if (subtype === "hotel") {
			const r = await dbOrtx.select().from(Hotel).where(eq(Hotel.productId, productId)).then(first)
			return !!r
		}
		if (subtype === "tour") {
			const r = await dbOrtx.select().from(Tour).where(eq(Tour.productId, productId)).then(first)
			return !!r
		}
		if (subtype === "package") {
			const r = await dbOrtx
				.select()
				.from(Package)
				.where(eq(Package.productId, productId))
				.then(first)
			return !!r
		}
		const r = await dbOrtx
			.select()
			.from(Limousine)
			.where(eq(Limousine.productId, productId))
			.then(first)
		return !!r
	}
}
