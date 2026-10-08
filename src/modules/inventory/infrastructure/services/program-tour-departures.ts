import { TourDepartureInstance } from "@/shared/infrastructure/db/schema/tables"
import {
	and,
	db,
	eq,
	gte,
	lte,
	gt,
	sql,
	Product,
	Variant,
	TourSlotProfile,
	ProviderProfile,
	VariantInventoryConfig,
	DailyInventory,
	ProviderExternalCalendarEvent,
	InventoryLock,
	CommandIdempotency,
} from "@/shared/infrastructure/db/compat"
import { commandPayloadHash } from "@/lib/commands/command-idempotency"
import { providerCalendarDate } from "@/lib/rates/providerCalendarDate"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import {
	scheduleDates,
	type TourScheduleInput,
	type TourSchedulePreview,
	type TourScheduleResult,
} from "@/lib/tours/tourScheduleContract"
import { applyInventoryMutation } from "@/modules/inventory/public"

type Connection = Pick<typeof db, "select" | "insert" | "update" | "execute">
export class TourScheduleError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message)
	}
}

export async function loadTourScheduleContext(
	providerId: string,
	variantId: string,
	connection: Connection = db
) {
	const [row] = await connection
		.select({
			name: Variant.name,
			productType: Product.productType,
			lifecycle: Variant.lifecycleState,
			kind: Variant.kind,
			time: TourSlotProfile.departureTime,
			capacity: VariantInventoryConfig.defaultTotalUnits,
			maxPax: TourSlotProfile.maxPax,
			mode: TourSlotProfile.bookingMode,
			updatedAt: TourSlotProfile.updatedAt,
			timezone: ProviderProfile.timezone,
		})
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.innerJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.leftJoin(VariantInventoryConfig, eq(VariantInventoryConfig.variantId, Variant.id))
		.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Product.providerId))
		.where(and(eq(Variant.id, variantId), eq(Product.providerId, providerId)))
	if (
		!row ||
		row.kind !== "tour_slot" ||
		row.lifecycle === "archived" ||
		!isTourProductType(row.productType)
	)
		throw new TourScheduleError(404, "No encontramos esta opción de tours")
	if (!/^\d{2}:\d{2}$/.test(row.time) || row.maxPax < 1)
		throw new TourScheduleError(422, "Completa el horario y la capacidad de la opción")
	const timezone = row.timezone || "UTC"
	return {
		name: row.name,
		time: row.time,
		timezone,
		today: providerCalendarDate(timezone),
		capacity: row.capacity || row.maxPax,
		mode: row.mode,
		version: commandPayloadHash(row),
	}
}

export async function previewTourDepartures(
	providerId: string,
	input: TourScheduleInput,
	connection: Connection = db
): Promise<TourSchedulePreview> {
	const context = await loadTourScheduleContext(providerId, input.variantId, connection)
	if (context.mode !== "shared")
		throw new TourScheduleError(
			422,
			"Esta opción privada recibe solicitudes; no necesita programar cupos compartidos"
		)
	if (input.from <= context.today)
		throw new TourScheduleError(422, "Selecciona fechas futuras según la zona horaria del negocio")
	const dates = scheduleDates(input)
	const range = and(
		eq(DailyInventory.variantId, input.variantId),
		gte(DailyInventory.date, input.from),
		lte(DailyInventory.date, input.to)
	)
	const [existing, cancelled, external, locks] = await Promise.all([
		connection.select({ date: DailyInventory.date }).from(DailyInventory).where(range),
		connection
			.select({ date: TourDepartureInstance.date })
			.from(TourDepartureInstance)
			.where(
				and(
					eq(TourDepartureInstance.variantId, input.variantId),
					eq(TourDepartureInstance.isCancelled, true),
					gte(TourDepartureInstance.date, input.from),
					lte(TourDepartureInstance.date, input.to)
				)
			),
		connection
			.select({
				from: ProviderExternalCalendarEvent.startDate,
				to: ProviderExternalCalendarEvent.endDate,
			})
			.from(ProviderExternalCalendarEvent)
			.where(
				and(
					eq(ProviderExternalCalendarEvent.variantId, input.variantId),
					eq(ProviderExternalCalendarEvent.isActive, true),
					lte(ProviderExternalCalendarEvent.startDate, input.to),
					gt(ProviderExternalCalendarEvent.endDate, input.from)
				)
			),
		connection
			.select({ date: InventoryLock.date })
			.from(InventoryLock)
			.where(
				and(
					eq(InventoryLock.variantId, input.variantId),
					gte(InventoryLock.date, input.from),
					lte(InventoryLock.date, input.to),
					gt(InventoryLock.expiresAt, new Date())
				)
			),
	])
	const persisted = new Set(existing.map((row) => row.date))
	const blocked = new Set([...cancelled, ...locks].map((row) => row.date))
	const blockedDates = dates.filter(
		(date) =>
			!persisted.has(date) &&
			(blocked.has(date) || external.some((event) => date >= event.from && date < event.to))
	)
	const preservedDates = dates.filter((date) => persisted.has(date))
	const newDates = dates.filter((date) => !persisted.has(date) && !blockedDates.includes(date))
	return {
		context,
		newDates,
		preservedDates,
		blockedDates,
		token: commandPayloadHash({ input, context, newDates, preservedDates, blockedDates }),
	}
}

/** Inventory and durable replay result commit together; retries never edit existing dates. */
export async function programTourDepartures(
	providerId: string,
	input: TourScheduleInput,
	token: string,
	key: string
): Promise<TourScheduleResult> {
	const scope = `tour-schedule:${providerId}:${input.variantId}`
	const hash = commandPayloadHash({ input, token })
	let result = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope}, 0))`)
		await loadTourScheduleContext(providerId, input.variantId, tx)
		const [previous] = await tx
			.select()
			.from(CommandIdempotency)
			.where(and(eq(CommandIdempotency.scope, scope), eq(CommandIdempotency.key, key)))
		if (previous) {
			if (previous.requestHash !== hash)
				throw new TourScheduleError(409, "La operación cambió; vuelve a revisar las fechas")
			return previous.responseJson as TourScheduleResult
		}
		// Lock the reusable profile so its clock/mode cannot change during insertion.
		await tx.execute(
			sql`select "variantId" from "TourSlotProfile" where "variantId" = ${input.variantId} for update`
		)
		const preview = await previewTourDepartures(providerId, input, tx)
		if (preview.token !== token)
			throw new TourScheduleError(
				409,
				"Las fechas o la opción cambiaron; vuelve a revisar antes de programar"
			)
		const created = preview.newDates.length
			? await tx
					.insert(DailyInventory)
					.values(
						preview.newDates.map((date) => ({
							id: crypto.randomUUID(),
							variantId: input.variantId,
							date,
							totalInventory: input.capacity,
							reservedCount: 0,
						}))
					)
					.onConflictDoNothing({ target: [DailyInventory.variantId, DailyInventory.date] })
					.returning({ date: DailyInventory.date })
			: []
		const createdDates = created.map((row) => row.date)
		const response: TourScheduleResult = {
			createdDates,
			preservedDates: [
				...preview.preservedDates,
				...preview.newDates.filter((date) => !createdDates.includes(date)),
			],
			blockedDates: preview.blockedDates,
			refresh: "pending",
		}
		await tx.insert(CommandIdempotency).values({
			id: crypto.randomUUID(),
			scope,
			key,
			requestHash: hash,
			status: "succeeded",
			requestId: key,
			expiresAt: new Date(Date.now() + 86400000),
			responseJson: response,
		})
		return response
	})
	if (result.refresh === "pending") {
		try {
			const to = new Date(`${input.to}T00:00:00Z`)
			to.setUTCDate(to.getUTCDate() + 1)
			await applyInventoryMutation({
				mutate: async () => result,
				recompute: {
					variantId: input.variantId,
					from: input.from,
					to: to.toISOString().slice(0, 10),
					reason: "tour_schedule",
					idempotencyKey: key,
				},
			})
			result = { ...result, refresh: "ready" }
			await db
				.update(CommandIdempotency)
				.set({ responseJson: result, updatedAt: new Date() })
				.where(and(eq(CommandIdempotency.scope, scope), eq(CommandIdempotency.key, key)))
		} catch {
			// A retry uses the durable result and retries only derived availability.
		}
	}
	return result
}
