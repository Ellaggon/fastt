import type {
	ChannelManagerAdapter,
	ChannelManagerBookingRevision,
} from "@/lib/channel-manager/channel-manager-adapter"
import { ChannelManagerAdapterError } from "@/lib/channel-manager/channel-manager-adapter"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"
import {
	finishProviderIntegrationSyncRun,
	listProviderIntegrationMappingsForConnection,
	recordProviderIntegrationIncident,
	startProviderIntegrationSyncRun,
} from "@/lib/provider-integration-operations"
import { getProviderChannelManagerRuntime } from "@/lib/provider-integrations"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import {
	and,
	Booking,
	BookingRoomDetail,
	db,
	DailyInventory,
	eq,
	first,
	gt,
	inArray,
	InventoryLock,
	lte,
	Product,
	ProviderExternalCalendarEvent,
	ProviderIntegrationConnection,
	RatePlan,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"

export const BOOKING_REVISION_FEED_OPERATION = "booking_revision_feed"

type ResolvedRoom = {
	variantId: string
	ratePlanId: string
	checkIn: string
	checkOut: string
	amount: number
	adults: number
	children: number
	infants: number
}

type PersistResult = {
	bookingId: string
	idempotent: boolean
	affected: Array<{ variantId: string; from: string; to: string }>
}

class BookingRevisionError extends Error {
	constructor(
		readonly code: string,
		readonly category: "mapping" | "inventory" | "data_quality" | "persistence",
		message: string
	) {
		super(message)
		this.name = "BookingRevisionError"
	}
}

function dateOnly(value: unknown, code: string): string {
	const normalized = String(value ?? "").slice(0, 10)
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		throw new BookingRevisionError(code, "data_quality", "La revisión no contiene fechas válidas.")
	}
	return normalized
}

function enumerateDates(from: string, toExclusive: string): string[] {
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${toExclusive}T00:00:00.000Z`)
	if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor >= end) {
		throw new BookingRevisionError(
			"BOOKING_REVISION_DATE_RANGE_INVALID",
			"data_quality",
			"La salida debe ser posterior a la llegada."
		)
	}
	const dates: string[] = []
	while (cursor < end) {
		dates.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return dates
}

function nonNegativeAmount(value: unknown, fallback = 0): number {
	const amount = Number(value)
	return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : fallback
}

function compactName(revision: ChannelManagerBookingRevision): string | null {
	const value = [revision.customer?.name, revision.customer?.surname]
		.map((part) => String(part ?? "").trim())
		.filter(Boolean)
		.join(" ")
	return value || null
}

async function resolveRevisionRooms(params: {
	providerId: string
	connectionId: string
	revision: ChannelManagerBookingRevision
}): Promise<ResolvedRoom[]> {
	if (params.revision.status === "cancelled") return []
	if (!params.revision.rooms.length) {
		throw new BookingRevisionError(
			"BOOKING_REVISION_ROOMS_REQUIRED",
			"data_quality",
			"La revisión no contiene habitaciones."
		)
	}
	const mappings = await listProviderIntegrationMappingsForConnection(params)
	const roomByExternal = new Map(
		mappings
			.filter((row) => row.status === "active" && row.mappingType === "room_type")
			.map((row) => [row.externalEntityId, row.localEntityId])
	)
	const rateByExternal = new Map(
		mappings
			.filter((row) => row.status === "active" && row.mappingType === "rate_plan")
			.map((row) => [row.externalEntityId, row.localEntityId])
	)
	const resolved = params.revision.rooms.map((room, index) => {
		const variantId = room.roomTypeId ? roomByExternal.get(room.roomTypeId) : null
		const ratePlanId =
			(room.ratePlanId ? rateByExternal.get(room.ratePlanId) : null) ??
			(room.parentRatePlanId ? rateByExternal.get(room.parentRatePlanId) : null)
		if (!variantId || !ratePlanId) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_MAPPING_REQUIRED",
				"mapping",
				`La habitación ${index + 1} no tiene mapping completo de habitación y tarifa.`
			)
		}
		const occupancy = room.occupancy ?? (index === 0 ? params.revision.occupancy : null)
		return {
			variantId,
			ratePlanId,
			checkIn: dateOnly(
				room.checkinDate ?? params.revision.arrivalDate,
				"BOOKING_CHECKIN_REQUIRED"
			),
			checkOut: dateOnly(
				room.checkoutDate ?? params.revision.departureDate,
				"BOOKING_CHECKOUT_REQUIRED"
			),
			amount: nonNegativeAmount(room.amount),
			adults: Math.max(1, Number(occupancy?.adults ?? 1)),
			children: Math.max(0, Number(occupancy?.children ?? 0)),
			infants: Math.max(0, Number(occupancy?.infants ?? 0)),
		}
	})
	for (const room of resolved) enumerateDates(room.checkIn, room.checkOut)
	const ratePlans = await db
		.select({ id: RatePlan.id, variantId: RatePlan.variantId })
		.from(RatePlan)
		.where(inArray(RatePlan.id, [...new Set(resolved.map((room) => room.ratePlanId))]))
	const variantByRate = new Map(ratePlans.map((row) => [row.id, row.variantId]))
	if (resolved.some((room) => variantByRate.get(room.ratePlanId) !== room.variantId)) {
		throw new BookingRevisionError(
			"BOOKING_REVISION_MAPPING_INCOMPATIBLE",
			"mapping",
			"La tarifa mapeada no pertenece a la habitación mapeada."
		)
	}
	return resolved
}

function countLocks(
	rows: Array<{ variantId: string; date: string; quantity?: number | null }>
): Map<string, number> {
	const counts = new Map<string, number>()
	for (const row of rows) {
		const key = `${row.variantId}:${row.date}`
		counts.set(key, Number(counts.get(key) ?? 0) + Math.max(0, Number(row.quantity ?? 1)))
	}
	return counts
}

async function applyInventoryInsideTransaction(params: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
	bookingId: string
	rooms: ResolvedRoom[]
	cancelled: boolean
}) {
	const oldLocks = await params.tx
		.select({
			id: InventoryLock.id,
			variantId: InventoryLock.variantId,
			date: InventoryLock.date,
			quantity: InventoryLock.quantity,
		})
		.from(InventoryLock)
		.where(eq(InventoryLock.bookingId, params.bookingId))
	const desired = params.cancelled
		? []
		: params.rooms.flatMap((room) =>
				enumerateDates(room.checkIn, room.checkOut).map((date) => ({
					variantId: room.variantId,
					date,
					quantity: 1,
				}))
			)
	const oldCounts = countLocks(oldLocks.map((row) => ({ ...row, date: String(row.date) })))
	const desiredCounts = countLocks(desired)
	const keys = [...new Set([...oldCounts.keys(), ...desiredCounts.keys()])]
	for (const key of keys) {
		const separator = key.lastIndexOf(":")
		const variantId = key.slice(0, separator)
		const date = key.slice(separator + 1)
		await params.tx.execute(sql`
			SELECT "id" FROM "DailyInventory"
			WHERE "variantId" = ${variantId} AND "date" = ${date}
			FOR UPDATE
		`)
		const inventory = await params.tx
			.select({
				id: DailyInventory.id,
				totalInventory: DailyInventory.totalInventory,
				reservedCount: DailyInventory.reservedCount,
			})
			.from(DailyInventory)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, date)))
			.then(first)
		if (!inventory) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_INVENTORY_MISSING",
				"inventory",
				`No existe inventario operativo para ${date}.`
			)
		}
		const delta = Number(desiredCounts.get(key) ?? 0) - Number(oldCounts.get(key) ?? 0)
		const nextReserved = Number(inventory.reservedCount ?? 0) + delta
		const externalBlocks = await params.tx
			.select({ id: ProviderExternalCalendarEvent.id })
			.from(ProviderExternalCalendarEvent)
			.where(
				and(
					eq(ProviderExternalCalendarEvent.variantId, variantId),
					eq(ProviderExternalCalendarEvent.isActive, true),
					lte(ProviderExternalCalendarEvent.startDate, date),
					gt(ProviderExternalCalendarEvent.endDate, date)
				)
			)
		if (
			nextReserved < 0 ||
			nextReserved + externalBlocks.length > Number(inventory.totalInventory ?? 0)
		) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_INVENTORY_CONFLICT",
				"inventory",
				`No hay inventario compatible para ${date}.`
			)
		}
		await params.tx
			.update(DailyInventory)
			.set({ reservedCount: nextReserved, updatedAt: new Date() })
			.where(eq(DailyInventory.id, inventory.id))
	}
	await params.tx.delete(InventoryLock).where(eq(InventoryLock.bookingId, params.bookingId))
	return { oldLocks, desired }
}

async function persistBookingRevision(params: {
	providerId: string
	connectionId: string
	revision: ChannelManagerBookingRevision
	rooms: ResolvedRoom[]
}): Promise<PersistResult> {
	const externalBookingId = String(
		params.revision.bookingId || params.revision.uniqueId || ""
	).trim()
	if (!externalBookingId) {
		throw new BookingRevisionError(
			"BOOKING_REVISION_EXTERNAL_ID_REQUIRED",
			"data_quality",
			"La revisión no contiene un identificador de reserva."
		)
	}
	const revisionAt = params.revision.insertedAt ? new Date(params.revision.insertedAt) : new Date()
	if (Number.isNaN(revisionAt.getTime())) {
		throw new BookingRevisionError(
			"BOOKING_REVISION_TIMESTAMP_INVALID",
			"data_quality",
			"La revisión contiene una fecha de recepción inválida."
		)
	}
	return db.transaction(async (tx) => {
		await tx.execute(sql`
			SELECT pg_advisory_xact_lock(
				hashtext(${params.connectionId}),
				hashtext(${externalBookingId})
			)
		`)
		const existing = await tx
			.select()
			.from(Booking)
			.where(
				and(
					eq(Booking.integrationConnectionId, params.connectionId),
					eq(Booking.externalBookingId, externalBookingId)
				)
			)
			.then(first)
		if (existing?.externalRevisionId === params.revision.id) {
			const details = await tx
				.select({
					variantId: BookingRoomDetail.variantId,
					checkIn: BookingRoomDetail.checkIn,
					checkOut: BookingRoomDetail.checkOut,
				})
				.from(BookingRoomDetail)
				.where(eq(BookingRoomDetail.bookingId, existing.id))
			return {
				bookingId: existing.id,
				idempotent: true,
				affected: details.flatMap((detail) =>
					enumerateDates(String(detail.checkIn), String(detail.checkOut)).map((date) => ({
						variantId: String(detail.variantId),
						from: date,
						to: date,
					}))
				),
			}
		}
		if (
			existing?.externalRevisionAt &&
			new Date(existing.externalRevisionAt).getTime() > revisionAt.getTime()
		) {
			return { bookingId: existing.id, idempotent: true, affected: [] }
		}
		if (params.revision.status === "cancelled" && !existing) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_CANCEL_TARGET_MISSING",
				"persistence",
				"La cancelación no corresponde a una reserva importada."
			)
		}
		const bookingId = existing?.id ?? crypto.randomUUID()
		const inventory = await applyInventoryInsideTransaction({
			tx,
			bookingId,
			rooms: params.rooms,
			cancelled: params.revision.status === "cancelled",
		})
		const affected = [
			...inventory.oldLocks.map((row) => ({
				variantId: String(row.variantId),
				from: String(row.date),
				to: String(row.date),
			})),
			...inventory.desired.map((row) => ({
				variantId: row.variantId,
				from: row.date,
				to: row.date,
			})),
		]
		if (params.revision.status === "cancelled") {
			await tx
				.update(Booking)
				.set({
					status: "cancelled",
					externalRevisionId: params.revision.id,
					externalRevisionAt: revisionAt,
					lifecycleAuditJson: {
						mode: "channel_manager_revision",
						revisionId: params.revision.id,
						status: "cancelled",
						otaName: params.revision.otaName,
						otaReservationCode: params.revision.otaReservationCode,
					},
				})
				.where(eq(Booking.id, bookingId))
			return { bookingId, idempotent: false, affected }
		}
		const firstRoom = params.rooms[0]
		if (!firstRoom)
			throw new BookingRevisionError("BOOKING_ROOM_REQUIRED", "data_quality", "Falta habitación.")
		const variantIds = [...new Set(params.rooms.map((room) => room.variantId))]
		const variants = await tx
			.select({
				id: Variant.id,
				name: Variant.name,
				productId: Variant.productId,
				productName: Product.name,
				providerId: Product.providerId,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(inArray(Variant.id, variantIds))
		if (
			variants.length !== variantIds.length ||
			variants.some((variant) => variant.providerId !== params.providerId)
		) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_PROVIDER_OWNERSHIP_INVALID",
				"mapping",
				"Una habitación mapeada no pertenece al proveedor."
			)
		}
		const plans = await tx
			.select({ id: RatePlan.id, name: RatePlan.name })
			.from(RatePlan)
			.where(inArray(RatePlan.id, [...new Set(params.rooms.map((room) => room.ratePlanId))]))
		const variantById = new Map(variants.map((row) => [row.id, row]))
		const planById = new Map(plans.map((row) => [row.id, row]))
		const total = nonNegativeAmount(
			params.revision.amount,
			params.rooms.reduce((sum, room) => sum + room.amount, 0)
		)
		const currency = String(params.revision.currency ?? "")
			.trim()
			.toUpperCase()
		if (!/^[A-Z]{3}$/.test(currency)) {
			throw new BookingRevisionError(
				"BOOKING_REVISION_CURRENCY_INVALID",
				"data_quality",
				"La reserva no contiene una moneda válida."
			)
		}
		const checkIn = params.rooms.map((room) => room.checkIn).sort()[0]
		const checkOut =
			params.rooms
				.map((room) => room.checkOut)
				.sort()
				.at(-1) ?? firstRoom.checkOut
		const adults = Math.max(
			1,
			Number(
				params.revision.occupancy?.adults ??
					params.rooms.reduce((sum, room) => sum + room.adults, 0)
			)
		)
		const children = Math.max(
			0,
			Number(
				params.revision.occupancy?.children ??
					params.rooms.reduce((sum, room) => sum + room.children, 0)
			)
		)
		const lifecycle = {
			mode: "channel_manager_revision",
			revisionId: params.revision.id,
			status: params.revision.status,
			otaName: params.revision.otaName,
			otaReservationCode: params.revision.otaReservationCode,
			paymentCollect: params.revision.paymentCollect,
			paymentType: params.revision.paymentType,
			pciDataStored: false,
		}
		const bookingValues = {
			providerId: params.providerId,
			ratePlanId: firstRoom.ratePlanId,
			checkInDate: checkIn,
			checkOutDate: checkOut,
			numAdults: adults,
			numChildren: children,
			totalAmount: total,
			status: "confirmed",
			operationalStatus: "pending_arrival",
			notes: params.revision.notes,
			currency,
			source: "channel_manager",
			confirmedAt: existing?.confirmedAt ?? new Date(),
			guestEmailSnapshot: params.revision.customer?.email ?? null,
			guestNameSnapshot: compactName(params.revision),
			guestContactSnapshotJson: {
				email: params.revision.customer?.email ?? null,
				name: compactName(params.revision),
				phone: params.revision.customer?.phone ?? null,
			},
			lifecycleAuditJson: lifecycle,
			contractSnapshotVersion: "channel_manager_booking_revision_v1",
			integrationConnectionId: params.connectionId,
			externalBookingId,
			externalRevisionId: params.revision.id,
			externalRevisionAt: revisionAt,
		}
		if (existing) {
			await tx.update(Booking).set(bookingValues).where(eq(Booking.id, bookingId))
			await tx.delete(BookingRoomDetail).where(eq(BookingRoomDetail.bookingId, bookingId))
		} else {
			await tx.insert(Booking).values({
				id: bookingId,
				bookingDate: revisionAt,
				...bookingValues,
			})
		}
		await tx.insert(BookingRoomDetail).values(
			params.rooms.map((room) => {
				const variant = variantById.get(room.variantId)
				return {
					id: crypto.randomUUID(),
					bookingId,
					variantId: room.variantId,
					ratePlanId: room.ratePlanId,
					checkIn: room.checkIn,
					checkOut: room.checkOut,
					adults: room.adults,
					children: room.children,
					subtotalAmount: room.amount,
					taxAmount: 0,
					totalAmount: room.amount,
					pricingBreakdownJson: {
						source: "channel_manager",
						externalRevisionId: params.revision.id,
						amountIncludesUnknownTaxes: true,
					},
					providerIdSnapshot: params.providerId,
					productIdSnapshot: variant?.productId ?? null,
					productNameSnapshot: variant?.productName ?? null,
					variantNameSnapshot: variant?.name ?? null,
					ratePlanNameSnapshot: planById.get(room.ratePlanId)?.name ?? null,
					occupancySnapshotJson: {
						adults: room.adults,
						children: room.children,
						infants: room.infants,
					},
					createdAt: new Date(),
				}
			})
		)
		if (inventory.desired.length) {
			await tx.insert(InventoryLock).values(
				inventory.desired.map((row) => ({
					id: crypto.randomUUID(),
					holdId: null,
					...row,
					expiresAt: new Date("2099-12-31T23:59:59.999Z"),
					bookingId,
					createdAt: new Date(),
				}))
			)
		}
		return { bookingId, idempotent: false, affected }
	})
}

async function recomputeAffectedAvailability(affected: PersistResult["affected"]) {
	const ranges = new Map<string, { from: string; to: string }>()
	for (const row of affected) {
		const current = ranges.get(row.variantId)
		ranges.set(row.variantId, {
			from: current ? (current.from < row.from ? current.from : row.from) : row.from,
			to: current ? (current.to > row.to ? current.to : row.to) : row.to,
		})
	}
	for (const [variantId, range] of ranges) {
		const end = new Date(`${range.to}T00:00:00.000Z`)
		end.setUTCDate(end.getUTCDate() + 1)
		await recomputeEffectiveAvailabilityRange({
			variantId,
			from: range.from,
			to: end.toISOString().slice(0, 10),
			reason: "booking_revision_received",
		})
	}
}

async function recordRevisionIncident(params: {
	providerId: string
	connectionId: string
	runId: string
	revision: ChannelManagerBookingRevision
	error: unknown
}) {
	const typed = params.error instanceof BookingRevisionError ? params.error : null
	const code = typed?.code ?? "BOOKING_REVISION_PERSIST_FAILED"
	await recordProviderIntegrationIncident({
		providerId: params.providerId,
		connectionId: params.connectionId,
		syncRunId: params.runId,
		input: {
			dedupeKey: `booking_revision:${params.revision.id}:${code}`,
			code,
			category:
				typed?.category === "mapping"
					? "mapping"
					: typed?.category === "data_quality"
						? "data_quality"
						: "system",
			severity: "error",
			title: "Una reserva entrante necesita atención",
			description: typed?.message ?? "Fastt no pudo guardar la revisión recibida de Channex.",
			actionLabel: "Revisar incidencias",
			actionHref: "/provider/settings/integrations/incidents",
			entityType: "booking_revision",
			entityId: params.revision.id,
			metadataJson: {
				externalBookingId: params.revision.bookingId,
				status: params.revision.status,
				propertyId: params.revision.propertyId,
				failureKind: typed?.category ?? "persistence",
				// Deliberately excludes guarantee/card fields.
				pciDataStored: false,
			},
		},
	})
}

export async function runProviderBookingRevisionFeed(params: {
	providerId: string
	connectionId: string
	idempotencyKey: string
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	adapter?: ChannelManagerAdapter
}) {
	const startedAt = Date.now()
	const runtime = params.adapter
		? null
		: await getProviderChannelManagerRuntime({
				providerId: params.providerId,
				connectionId: params.connectionId,
			})
	const adapter = params.adapter ?? runtime?.adapter
	if (!adapter) throw new Error("CHANNEL_MANAGER_ADAPTER_UNAVAILABLE")
	const connection =
		runtime?.connection ??
		(await db
			.select()
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.id, params.connectionId),
					eq(ProviderIntegrationConnection.providerId, params.providerId)
				)
			)
			.then(first))
	const propertyId = String(connection?.externalPropertyId ?? "").trim()
	if (!propertyId) throw new Error("BOOKING_REVISION_PROPERTY_REQUIRED")
	const run = await startProviderIntegrationSyncRun({
		providerId: params.providerId,
		connectionId: params.connectionId,
		operation: BOOKING_REVISION_FEED_OPERATION,
		trigger: params.trigger ?? "scheduled",
		idempotencyKey: params.idempotencyKey,
	})
	let saved = 0
	let deduped = 0
	let failed = 0
	let acknowledged = 0
	try {
		const feed = await adapter.fetchBookingRevisions({ propertyId })
		for (const revision of feed.items) {
			if (revision.propertyId !== propertyId) {
				failed += 1
				await recordRevisionIncident({
					providerId: params.providerId,
					connectionId: params.connectionId,
					runId: String(run.id),
					revision,
					error: new BookingRevisionError(
						"BOOKING_REVISION_PROPERTY_MISMATCH",
						"mapping",
						"La revisión pertenece a otra propiedad."
					),
				})
				continue
			}
			try {
				const rooms = await resolveRevisionRooms({ ...params, revision })
				const persisted = await persistBookingRevision({ ...params, revision, rooms })
				await recomputeAffectedAvailability(persisted.affected)
				const ack = await adapter.acknowledgeBookingRevision({ revisionId: revision.id })
				if (!ack.ok || ack.accepted !== 1 || ack.rejected > 0) {
					throw new ChannelManagerAdapterError({
						kind: "upstream",
						message: "BOOKING_REVISION_ACK_FAILED",
						retryable: true,
						details: ack,
					})
				}
				acknowledged += 1
				const outcome = persisted.idempotent ? "deduped" : "saved"
				if (persisted.idempotent) deduped += 1
				else saved += 1
				incrementCounter("provider_booking_revision_items_total", {
					revision_status: revision.status,
					outcome,
				})
			} catch (error) {
				if (error instanceof ChannelManagerAdapterError && error.retryable) throw error
				failed += 1
				incrementCounter("provider_booking_revision_items_total", {
					revision_status: revision.status,
					outcome: "failed",
				})
				await recordRevisionIncident({
					providerId: params.providerId,
					connectionId: params.connectionId,
					runId: String(run.id),
					revision,
					error,
				})
			}
		}
		const status = failed > 0 ? "partial" : "succeeded"
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status,
			readCount: feed.items.length,
			changedCount: saved,
			skippedCount: deduped,
			failedCount: failed,
			summaryJson: {
				version: 1,
				kind: "booking_revision_feed",
				propertyId,
				fetched: feed.items.length,
				saved,
				deduped,
				acknowledged,
				failed,
				pciDataStored: false,
			},
		})
		incrementCounter("provider_booking_revisions_total", { status })
		return {
			runId: String(run.id),
			status,
			fetched: feed.items.length,
			saved,
			deduped,
			acknowledged,
			failed,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "BOOKING_REVISION_FEED_FAILED"
		await finishProviderIntegrationSyncRun({
			providerId: params.providerId,
			runId: String(run.id),
			status: "failed",
			readCount: saved + deduped + failed,
			changedCount: saved,
			skippedCount: deduped,
			failedCount: Math.max(1, failed),
			errorCode: message.slice(0, 100),
			errorMessage: message,
		})
		throw error
	} finally {
		observeTiming("provider_booking_revision_feed_ms", Date.now() - startedAt)
	}
}
