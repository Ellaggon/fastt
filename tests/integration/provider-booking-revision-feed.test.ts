import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type {
	ChannelManagerAdapter,
	ChannelManagerBookingRevision,
} from "@/lib/channel-manager/channel-manager-adapter"
import { ChannelManagerAdapterError } from "@/lib/channel-manager/channel-manager-adapter"
import { runProviderBookingRevisionFeed } from "@/lib/channel-manager/channel-manager-booking-revisions"
import {
	and,
	Booking,
	BookingRoomDetail,
	DailyInventory,
	db,
	GeoPlace,
	ProductGeoPlace,
	EffectiveAvailability,
	eq,
	InventoryLock,
	Product,
	Provider,
	ProviderIntegrationConnection,
	ProviderIntegrationIncident,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

describe.sequential("provider booking revision feed", () => {
	const providerId = "provider_booking_revision_feed"
	const connectionId = "connection_booking_revision_feed"
	const geoPlaceId = "destination_booking_revision_feed"
	const productId = "product_booking_revision_feed"
	const variantId = "variant_booking_revision_feed"
	const ratePlanId = "rate_booking_revision_feed"
	const dates = ["2026-09-10", "2026-09-11", "2026-09-12"]
	let feedItems: ChannelManagerBookingRevision[] = []
	const acknowledged: string[] = []
	let failNextAck = false

	function revision(input: {
		id: string
		status: ChannelManagerBookingRevision["status"]
		bookingId?: string
		roomTypeId?: string
		checkout?: string
		amount?: string
	}): ChannelManagerBookingRevision {
		return {
			id: input.id,
			propertyId: "remote-property",
			bookingId: input.bookingId ?? "remote-booking-1",
			uniqueId: `unique-${input.bookingId ?? "remote-booking-1"}`,
			status: input.status,
			arrivalDate: "2026-09-10",
			departureDate: input.checkout ?? "2026-09-12",
			insertedAt:
				input.id === "revision-1"
					? "2026-08-03T10:00:00.000Z"
					: input.id === "revision-2"
						? "2026-08-03T11:00:00.000Z"
						: "2026-08-03T12:00:00.000Z",
			otaName: "Booking.com",
			otaReservationCode: "OTA-123",
			amount: input.amount ?? "240.00",
			currency: "USD",
			notes: "Llegada después de las 20:00",
			paymentCollect: "ota",
			paymentType: "credit_card",
			customer: {
				name: "Ada",
				surname: "Lovelace",
				email: "ada@example.test",
				phone: "+56000000000",
			},
			occupancy: { adults: 2, children: 0, infants: 0 },
			rooms:
				input.status === "cancelled"
					? []
					: [
							{
								roomTypeId: input.roomTypeId ?? "remote-room",
								ratePlanId: "remote-rate",
								parentRatePlanId: null,
								checkinDate: "2026-09-10",
								checkoutDate: input.checkout ?? "2026-09-12",
								amount: input.amount ?? "240.00",
								occupancy: { adults: 2, children: 0, infants: 0 },
							},
						],
		}
	}

	const adapter: ChannelManagerAdapter = {
		listProperties: async () => ({
			items: [],
			fetchedAt: new Date(),
			requestIds: [],
			warnings: [],
			partial: false,
			pageCount: 1,
		}),
		listRoomTypes: async () => ({
			items: [],
			fetchedAt: new Date(),
			requestIds: [],
			warnings: [],
			partial: false,
			pageCount: 1,
		}),
		listRatePlans: async () => ({
			items: [],
			fetchedAt: new Date(),
			requestIds: [],
			warnings: [],
			partial: false,
			pageCount: 1,
		}),
		pushAvailability: async () => {
			throw new Error("not used")
		},
		pushRatesAndRestrictions: async () => {
			throw new Error("not used")
		},
		fetchBookingRevisions: async () => ({
			items: feedItems,
			fetchedAt: new Date(),
			requestIds: ["feed-request"],
			warnings: [],
			partial: false,
			pageCount: 1,
		}),
		acknowledgeBookingRevision: async ({ revisionId }) => {
			const persisted = await db
				.select({ id: Booking.id })
				.from(Booking)
				.where(
					and(
						eq(Booking.integrationConnectionId, connectionId),
						eq(Booking.externalRevisionId, revisionId)
					)
				)
			if (persisted.length !== 1) throw new Error("ACK_BEFORE_COMMIT")
			if (failNextAck) {
				failNextAck = false
				throw new ChannelManagerAdapterError({
					kind: "network",
					message: "ACK_NETWORK_RETRY",
					retryable: true,
				})
			}
			acknowledged.push(revisionId)
			return {
				ok: true,
				submitted: 1,
				accepted: 1,
				rejected: 0,
				taskIds: [],
				requestIds: ["ack-request"],
				warnings: [],
				partial: false,
				pageCount: 1,
			}
		},
		testAccess: async () => ({
			ok: true,
			latencyMs: 1,
			message: "ok",
			requestIds: [],
			warnings: [],
			partial: false,
			pageCount: 1,
		}),
	}

	async function cleanup() {
		const bookings = await db
			.select({ id: Booking.id })
			.from(Booking)
			.where(eq(Booking.providerId, providerId))
		for (const booking of bookings) {
			await db.delete(InventoryLock).where(eq(InventoryLock.bookingId, booking.id))
			await db.delete(BookingRoomDetail).where(eq(BookingRoomDetail.bookingId, booking.id))
		}
		await db.delete(Booking).where(eq(Booking.providerId, providerId))
		await db.delete(EffectiveAvailability).where(eq(EffectiveAvailability.variantId, variantId))
		await db.delete(DailyInventory).where(eq(DailyInventory.variantId, variantId))
		await db
			.delete(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.providerId, providerId))
		await db
			.delete(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
		await db
			.delete(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
		await db
			.delete(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.providerId, providerId))
		await db
			.delete(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
		await db.delete(RatePlan).where(eq(RatePlan.id, ratePlanId))
		await db.delete(Variant).where(eq(Variant.id, variantId))
		await db.delete(Product).where(eq(Product.id, productId))
		await db.delete(GeoPlace).where(eq(GeoPlace.id, geoPlaceId))
		await db.delete(Provider).where(eq(Provider.id, providerId))
	}

	beforeAll(async () => {
		await cleanup()
		await db.insert(Provider).values({
			id: providerId,
			legalName: "Booking Revision QA",
			displayName: "Booking Revision QA",
			status: "active",
		})
		await db.insert(GeoPlace).values({
			id: geoPlaceId,
			canonicalName: "Santiago",
			normalizedName: "santiago",
			placeType: "city",
			countryCode: "CL",
			slug: geoPlaceId,
		} as any)
		await db.insert(Product).values({
			id: productId,
			name: "Hotel Revision QA",
			productType: "Hotel",
			providerId,
		} as any)
		await db.insert(ProductGeoPlace).values({
			id: `test-primary-${productId}`,
			productId,
			placeId: geoPlaceId,
			role: "primary_discovery",
			isPrimary: true,
			source: "test_fixture",
		} as any)
		expect(
			await db.select({ id: Product.id }).from(Product).where(eq(Product.id, productId))
		).toEqual([{ id: productId }])
		await db.insert(Variant).values({
			id: variantId,
			productId,
			name: "Habitación doble",
			kind: "hotel_room",
			status: "ready",
			isActive: true,
			createdAt: new Date(),
		})
		await db.insert(RatePlan).values({
			id: ratePlanId,
			variantId,
			name: "Flexible",
			isDefault: true,
			isActive: true,
			createdAt: new Date(),
		})
		await db.insert(DailyInventory).values(
			dates.map((date) => ({
				id: `inventory-${date}`,
				variantId,
				date,
				totalInventory: 2,
				reservedCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			}))
		)
		await db.insert(ProviderIntegrationConnection).values({
			id: connectionId,
			providerId,
			connectorKey: "channel_manager",
			vendorKey: "channex",
			status: "connected",
			mode: "sandbox",
			externalPropertyId: "remote-property",
			syncEnabled: true,
			lastSyncStatus: "initial_ari_succeeded",
		})
		await db.insert(ProviderIntegrationMapping).values([
			{
				id: "mapping-booking-room",
				providerId,
				connectionId,
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: variantId,
				externalEntityType: "room_type",
				externalEntityId: "remote-room",
				status: "active",
			},
			{
				id: "mapping-booking-rate",
				providerId,
				connectionId,
				mappingType: "rate_plan",
				localEntityType: "rate_plan",
				localEntityId: ratePlanId,
				externalEntityType: "rate_plan",
				externalEntityId: "remote-rate",
				status: "active",
			},
		])
	})

	afterAll(cleanup)

	it("persists, deduplicates, modifies and cancels before acknowledging", async () => {
		feedItems = [revision({ id: "revision-1", status: "new" })]
		const created = await runProviderBookingRevisionFeed({
			providerId,
			connectionId,
			idempotencyKey: "booking-feed-new",
			adapter,
		})
		expect(created).toMatchObject({ status: "succeeded", saved: 1, acknowledged: 1 })

		let bookings = await db.select().from(Booking).where(eq(Booking.providerId, providerId))
		expect(bookings).toHaveLength(1)
		expect(bookings[0]).toMatchObject({
			externalBookingId: "remote-booking-1",
			externalRevisionId: "revision-1",
			source: "channel_manager",
			guestNameSnapshot: "Ada Lovelace",
			status: "confirmed",
		})
		expect(JSON.stringify(bookings[0]?.lifecycleAuditJson)).toContain('"pciDataStored":false')
		expect(
			await db.select().from(InventoryLock).where(eq(InventoryLock.bookingId, bookings[0]!.id))
		).toHaveLength(2)

		const retried = await runProviderBookingRevisionFeed({
			providerId,
			connectionId,
			idempotencyKey: "booking-feed-retry",
			trigger: "retry",
			adapter,
		})
		expect(retried).toMatchObject({ saved: 0, deduped: 1, acknowledged: 1 })
		expect(await db.select().from(Booking).where(eq(Booking.providerId, providerId))).toHaveLength(
			1
		)

		feedItems = [
			revision({
				id: "revision-2",
				status: "modified",
				checkout: "2026-09-13",
				amount: "360.00",
			}),
		]
		failNextAck = true
		await expect(
			runProviderBookingRevisionFeed({
				providerId,
				connectionId,
				idempotencyKey: "booking-feed-modified",
				adapter,
			})
		).rejects.toMatchObject({ message: "ACK_NETWORK_RETRY", retryable: true })
		bookings = await db.select().from(Booking).where(eq(Booking.providerId, providerId))
		expect(bookings[0]).toMatchObject({
			externalRevisionId: "revision-2",
			checkOutDate: "2026-09-13",
			totalAmount: 360,
		})
		expect(
			await db.select().from(InventoryLock).where(eq(InventoryLock.bookingId, bookings[0]!.id))
		).toHaveLength(3)
		const modifiedRetry = await runProviderBookingRevisionFeed({
			providerId,
			connectionId,
			idempotencyKey: "booking-feed-modified-retry",
			trigger: "retry",
			adapter,
		})
		expect(modifiedRetry).toMatchObject({ saved: 0, deduped: 1, acknowledged: 1 })
		const acknowledgementIncident = await db
			.select()
			.from(ProviderIntegrationIncident)
			.where(
				and(
					eq(ProviderIntegrationIncident.providerId, providerId),
					eq(ProviderIntegrationIncident.entityId, "revision-2")
				)
			)
			.then((rows) => rows[0])
		expect(acknowledgementIncident).toMatchObject({
			code: "ACK_NETWORK_RETRY",
			status: "resolved",
		})

		feedItems = [revision({ id: "revision-3", status: "cancelled" })]
		const cancelled = await runProviderBookingRevisionFeed({
			providerId,
			connectionId,
			idempotencyKey: "booking-feed-cancelled",
			adapter,
		})
		expect(cancelled).toMatchObject({ saved: 1, acknowledged: 1 })
		bookings = await db.select().from(Booking).where(eq(Booking.providerId, providerId))
		expect(bookings[0]).toMatchObject({ status: "cancelled", externalRevisionId: "revision-3" })
		expect(
			await db.select().from(InventoryLock).where(eq(InventoryLock.bookingId, bookings[0]!.id))
		).toHaveLength(0)
		expect(
			await db
				.select()
				.from(BookingRoomDetail)
				.where(eq(BookingRoomDetail.bookingId, bookings[0]!.id))
		).toHaveLength(1)
		const inventory = await db
			.select({ reservedCount: DailyInventory.reservedCount })
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, variantId))
		expect(inventory.every((row) => row.reservedCount === 0)).toBe(true)
		expect(acknowledged).toEqual(["revision-1", "revision-1", "revision-2", "revision-3"])
	}, 60_000)

	it("keeps an unmapped revision pending and creates an actionable incident", async () => {
		feedItems = [
			revision({
				id: "revision-unmapped",
				status: "new",
				bookingId: "remote-booking-unmapped",
				roomTypeId: "remote-room-missing",
			}),
		]
		const beforeAcks = acknowledged.length
		const result = await runProviderBookingRevisionFeed({
			providerId,
			connectionId,
			idempotencyKey: "booking-feed-unmapped",
			adapter,
		})
		expect(result).toMatchObject({ status: "partial", saved: 0, failed: 1, acknowledged: 0 })
		expect(acknowledged).toHaveLength(beforeAcks)
		const incidents = await db
			.select()
			.from(ProviderIntegrationIncident)
			.where(
				and(
					eq(ProviderIntegrationIncident.providerId, providerId),
					eq(ProviderIntegrationIncident.status, "open")
				)
			)
		expect(incidents).toHaveLength(1)
		expect(incidents[0]).toMatchObject({
			code: "BOOKING_REVISION_MAPPING_REQUIRED",
			category: "mapping",
			entityType: "booking_revision",
			entityId: "revision-unmapped",
			status: "open",
		})
	}, 20_000)
})
