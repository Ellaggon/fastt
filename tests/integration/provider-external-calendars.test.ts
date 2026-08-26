import { afterEach, describe, expect, it } from "vitest"
import {
	Booking,
	BookingRoomDetail,
	DailyInventory,
	db,
	GeoPlace,
	ProductGeoPlace,
	EffectiveAvailability,
	eq,
	InventoryResource,
	Product,
	Provider,
	ProviderExternalCalendar,
	ProviderExternalCalendarConflict,
	ProviderExternalCalendarEvent,
	ProviderExternalCalendarExport,
	ProviderIntegrationConnection,
	ProviderIntegrationIncident,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"
import {
	createProviderExternalCalendar,
	createProviderExternalCalendarExport,
	listProviderExternalCalendars,
	parseExternalCalendarEvents,
	renderProviderExternalCalendarExport,
	revokeProviderExternalCalendar,
} from "@/lib/provider-external-calendars"
import { runScheduledExternalCalendarSync } from "@/lib/provider-external-calendar-scheduler"

const ids = {
	providerId: "",
	geoPlaceId: "",
	productId: "",
	variantId: "",
	ratePlanId: "",
	bookingId: "",
	resourceAId: "",
	resourceBId: "",
}

function feed(uid: string, start: string, end: string) {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Fastt Integration Test//EN",
		"BEGIN:VEVENT",
		`UID:${uid}`,
		"DTSTAMP:20260701T000000Z",
		`DTSTART;VALUE=DATE:${start}`,
		`DTEND;VALUE=DATE:${end}`,
		"SUMMARY:Reserved",
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\r\n")
}

function feedResponse(source: string) {
	return (async () =>
		new Response(source, {
			status: 200,
			headers: {
				"Content-Type": "text/calendar",
				"ETag": `"${crypto.randomUUID()}"`,
			},
		})) as typeof fetch
}

afterEach(async () => {
	if (!ids.providerId) return
	const connections = await db
		.select({ id: ProviderIntegrationConnection.id })
		.from(ProviderIntegrationConnection)
		.where(eq(ProviderIntegrationConnection.providerId, ids.providerId))
	const connectionIds = connections.map((row) => row.id)
	await db
		.delete(ProviderExternalCalendarConflict)
		.where(eq(ProviderExternalCalendarConflict.providerId, ids.providerId))
	await db
		.delete(ProviderIntegrationSyncJob)
		.where(eq(ProviderIntegrationSyncJob.providerId, ids.providerId))
	await db
		.delete(ProviderExternalCalendarExport)
		.where(eq(ProviderExternalCalendarExport.providerId, ids.providerId))
	await db
		.delete(ProviderExternalCalendarEvent)
		.where(eq(ProviderExternalCalendarEvent.providerId, ids.providerId))
	await db
		.delete(ProviderExternalCalendar)
		.where(eq(ProviderExternalCalendar.providerId, ids.providerId))
	await db
		.delete(ProviderIntegrationIncident)
		.where(eq(ProviderIntegrationIncident.providerId, ids.providerId))
	await db
		.delete(ProviderIntegrationSyncRun)
		.where(eq(ProviderIntegrationSyncRun.providerId, ids.providerId))
	for (const connectionId of connectionIds) {
		await db
			.delete(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.id, connectionId))
	}
	await db.delete(EffectiveAvailability).where(eq(EffectiveAvailability.variantId, ids.variantId))
	await db.delete(DailyInventory).where(eq(DailyInventory.variantId, ids.variantId))
	await db.delete(InventoryResource).where(eq(InventoryResource.providerId, ids.providerId))
	await db.delete(BookingRoomDetail).where(eq(BookingRoomDetail.bookingId, ids.bookingId))
	await db.delete(Booking).where(eq(Booking.id, ids.bookingId))
	await db.delete(RatePlan).where(eq(RatePlan.id, ids.ratePlanId))
	await db.delete(Variant).where(eq(Variant.id, ids.variantId))
	await db.delete(Product).where(eq(Product.id, ids.productId))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, ids.geoPlaceId))
	await db.delete(Provider).where(eq(Provider.id, ids.providerId))
	ids.providerId = ""
})

describe("integration/provider external calendars", () => {
	it("imports multiple feeds, applies availability, reports conflicts and removes revoked blocks", async () => {
		const suffix = crypto.randomUUID()
		ids.providerId = `provider_ical_${suffix}`
		ids.geoPlaceId = `destination_ical_${suffix}`
		ids.productId = `product_ical_${suffix}`
		ids.variantId = `variant_ical_${suffix}`
		ids.ratePlanId = `rate_plan_ical_${suffix}`
		ids.bookingId = `booking_ical_${suffix}`
		ids.resourceAId = `resource_a_${suffix}`
		ids.resourceBId = `resource_b_${suffix}`

		await db.insert(Provider).values({ id: ids.providerId, displayName: "Provider iCal" })
		await db.insert(GeoPlace).values({
			id: ids.geoPlaceId,
			canonicalName: "Lugar iCal",
			normalizedName: "lugar ical",
			placeType: "locality",
			countryCode: "CL",
			centroidLat: 0,
			centroidLng: 0,
			slug: `destino-ical-${suffix}`,
			canonicalPath: `destino-ical-${suffix}`,
		})
		await db.insert(Product).values({
			id: ids.productId,
			name: "Hotel iCal",
			productType: "Hotel",
			providerId: ids.providerId,
		})
		await db
			.insert(ProductGeoPlace)
			.values({
				id: `geo:product-place:${ids.productId}`,
				productId: ids.productId,
				placeId: ids.geoPlaceId,
				role: "primary_discovery",
				isPrimary: true,
				source: "test_fixture",
			})
		await db.insert(Variant).values({
			id: ids.variantId,
			productId: ids.productId,
			name: "Suite iCal",
			kind: "hotel_room",
			lifecycleState: "ready",
			salesEnabled: true,
		})
		await db.insert(RatePlan).values({
			id: ids.ratePlanId,
			variantId: ids.variantId,
			name: "Tarifa iCal",
			isDefault: true,
			isActive: true,
		})
		await db.insert(InventoryResource).values({
			id: ids.resourceAId,
			providerId: ids.providerId,
			variantId: ids.variantId,
			label: "Habitación 201",
			status: "active",
		})
		await db.insert(InventoryResource).values({
			id: ids.resourceBId,
			providerId: ids.providerId,
			variantId: ids.variantId,
			label: "Habitación 202",
			status: "active",
		})
		for (const date of ["2026-08-10", "2026-08-11"]) {
			await db.insert(DailyInventory).values({
				id: `daily_${suffix}_${date}`,
				variantId: ids.variantId,
				date,
				totalInventory: 3,
				reservedCount: 0,
			})
		}

		const firstId = await createProviderExternalCalendar({
			providerId: ids.providerId,
			name: "Airbnb",
			variantId: ids.variantId,
			resourceId: ids.resourceAId,
			feedUrl: "https://calendar-one.example.test/feed.ics",
			fetchImpl: feedResponse(feed("airbnb@example.test", "20260810", "20260812")),
		})
		const protectedCalendar = await db
			.select()
			.from(ProviderExternalCalendar)
			.where(eq(ProviderExternalCalendar.id, firstId))
			.then((rows) => rows[0])
		expect(protectedCalendar?.feedUrlHost).toBe("calendar-one.example.test")
		expect(protectedCalendar?.feedUrlFingerprint).toMatch(/^[a-f0-9]{64}$/)
		expect(protectedCalendar?.feedUrlEncrypted).toMatchObject({
			v: 1,
			alg: "aes-256-gcm",
		})
		expect(JSON.stringify(protectedCalendar?.feedUrlEncrypted)).not.toContain(
			"calendar-one.example.test"
		)
		await createProviderExternalCalendar({
			providerId: ids.providerId,
			name: "Booking.com",
			variantId: ids.variantId,
			resourceId: ids.resourceBId,
			feedUrl: "https://calendar-two.example.test/feed.ics",
			fetchImpl: feedResponse(feed("booking@example.test", "20260811", "20260812")),
		})
		await db.insert(Booking).values({
			id: ids.bookingId,
			providerId: ids.providerId,
			ratePlanId: ids.ratePlanId,
			checkInDate: "2026-08-10",
			checkOutDate: "2026-08-11",
			numAdults: 2,
			numChildren: 0,
			totalAmount: 100,
			status: "confirmed",
			currency: "USD",
		})
		await db.insert(BookingRoomDetail).values({
			id: `booking_room_ical_${suffix}`,
			bookingId: ids.bookingId,
			variantId: ids.variantId,
			ratePlanId: ids.ratePlanId,
			checkIn: "2026-08-10",
			checkOut: "2026-08-11",
			adults: 2,
			children: 0,
			subtotalAmount: 100,
			taxAmount: 0,
			totalAmount: 100,
		})

		const exportLink = await createProviderExternalCalendarExport({
			providerId: ids.providerId,
			variantId: ids.variantId,
			label: "Fastt export",
			baseUrl: "https://fastt.example.test/provider/settings/integrations",
		})
		const exportUrl = new URL(exportLink.url)
		const exportedIcs = await renderProviderExternalCalendarExport({
			exportId: exportLink.id,
			token: exportUrl.searchParams.get("token") ?? "",
			now: new Date("2026-08-01T00:00:00.000Z"),
		})
		expect(exportedIcs).toContain("X-FASTT-SOURCE:fastt")
		expect(exportedIcs).toContain(`X-FASTT-VARIANT-ID:${ids.variantId}`)
		expect(exportedIcs).not.toContain("X-FASTT-RESOURCE-ID")
		expect(exportedIcs.replace(/\r\n /g, "")).toContain(
			`UID:fastt-booking_room_ical_${suffix}@calendar.fastt.local`
		)
		await expect(parseExternalCalendarEvents(exportedIcs)).resolves.toHaveLength(0)
		const exportedRow = await db
			.select()
			.from(ProviderExternalCalendarExport)
			.where(eq(ProviderExternalCalendarExport.id, exportLink.id))
			.then((rows) => rows[0])
		expect(exportedRow?.downloadCount).toBe(1)

		const august10 = await db
			.select()
			.from(EffectiveAvailability)
			.where(eq(EffectiveAvailability.date, "2026-08-10"))
			.then((rows) => rows.find((row) => row.variantId === ids.variantId))
		const august11 = await db
			.select()
			.from(EffectiveAvailability)
			.where(eq(EffectiveAvailability.date, "2026-08-11"))
			.then((rows) => rows.find((row) => row.variantId === ids.variantId))
		expect(august10?.externalBlockedUnits).toBe(1)
		expect(august10?.availableUnits).toBe(2)
		expect(august11?.externalBlockedUnits).toBe(2)
		expect(august11?.availableUnits).toBe(1)

		const listed = await listProviderExternalCalendars(ids.providerId)
		expect(listed.calendars).toHaveLength(2)
		expect(listed.calendars.every((calendar) => calendar.status === "active")).toBe(true)
		expect(listed.calendars.some((calendar) => calendar.resourceLabel === "Habitación 201")).toBe(
			true
		)
		expect(
			listed.calendars.every(
				(calendar) => !calendar.conflicts.some((conflict) => conflict.kind === "external_calendar")
			)
		).toBe(true)
		expect(
			listed.calendars
				.find((calendar) => calendar.id === firstId)
				?.conflicts.some((conflict) => conflict.kind === "fastt_booking")
		).toBe(true)
		const bookingConflict = listed.calendars
			.find((calendar) => calendar.id === firstId)
			?.conflicts.find((conflict) => conflict.kind === "fastt_booking")
		expect(bookingConflict?.status).toBe("open")
		if (!bookingConflict?.id) throw new Error("missing persisted booking conflict")
		const { resolveProviderExternalCalendarConflict } =
			await import("@/lib/provider-external-calendars")
		await resolveProviderExternalCalendarConflict({
			providerId: ids.providerId,
			conflictId: bookingConflict.id,
			action: "ignore",
			currentUserId: null,
		})
		const ignored = await listProviderExternalCalendars(ids.providerId)
		expect(
			ignored.calendars
				.find((calendar) => calendar.id === firstId)
				?.conflicts.some((conflict) => conflict.id === bookingConflict.id)
		).toBe(false)
		const ignoredRow = await db
			.select()
			.from(ProviderExternalCalendarConflict)
			.where(eq(ProviderExternalCalendarConflict.id, bookingConflict.id))
			.then((rows) => rows[0])
		expect(ignoredRow?.status).toBe("ignored")
		expect(ignoredRow?.resolutionNote).toMatch(/no cambia/i)

		const scheduledAt = new Date("2026-07-26T20:00:00.000Z")
		await db
			.update(ProviderExternalCalendar)
			.set({ nextSyncAt: new Date(scheduledAt.getTime() + 86_400_000) })
			.where(eq(ProviderExternalCalendar.providerId, ids.providerId))
		await db
			.update(ProviderExternalCalendar)
			.set({
				nextSyncAt: new Date(scheduledAt.getTime() - 60_000),
				etag: null,
				lastModified: null,
			})
			.where(eq(ProviderExternalCalendar.id, firstId))

		const scheduledAttempts = await Promise.all(
			[0, 1].map(() =>
				runScheduledExternalCalendarSync({
					now: scheduledAt,
					providerId: ids.providerId,
					batchSize: 5,
					concurrency: 2,
					fetchImpl: feedResponse(feed("airbnb@example.test", "20260810", "20260812")),
				})
			)
		)
		expect(scheduledAttempts.reduce((total, result) => total + result.claimed, 0)).toBe(1)
		expect(scheduledAttempts.reduce((total, result) => total + result.succeeded, 0)).toBe(1)
		expect(scheduledAttempts.reduce((total, result) => total + result.failed, 0)).toBe(0)
		const scheduledCalendar = await db
			.select()
			.from(ProviderExternalCalendar)
			.where(eq(ProviderExternalCalendar.id, firstId))
			.then((rows) => rows[0])
		expect(scheduledCalendar?.lastAutomaticSyncAt).not.toBeNull()
		expect(scheduledCalendar?.consecutiveFailures).toBe(0)
		expect(scheduledCalendar?.nextSyncAt.getTime()).toBeGreaterThan(scheduledAt.getTime())
		const scheduledRuns = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, ids.providerId))
		expect(
			scheduledRuns.some((run) => run.trigger === "scheduled" && run.status === "succeeded")
		).toBe(true)
		const succeededJobs = await db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, ids.providerId))
		expect(
			succeededJobs.some(
				(job) =>
					job.targetType === "external_calendar" &&
					job.targetId === firstId &&
					job.operation === "calendar_import" &&
					job.status === "succeeded"
			)
		).toBe(true)

		const failureAt = new Date(scheduledAt.getTime() + 3_600_000)
		await db
			.update(ProviderExternalCalendar)
			.set({ nextSyncAt: new Date(failureAt.getTime() - 60_000) })
			.where(eq(ProviderExternalCalendar.id, firstId))
		const failedScheduled = await runScheduledExternalCalendarSync({
			now: failureAt,
			providerId: ids.providerId,
			batchSize: 1,
			fetchImpl: (async () => {
				throw new Error("network unavailable")
			}) as typeof fetch,
		})
		expect(failedScheduled).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 })
		const failedCalendar = await db
			.select()
			.from(ProviderExternalCalendar)
			.where(eq(ProviderExternalCalendar.id, firstId))
			.then((rows) => rows[0])
		expect(failedCalendar?.consecutiveFailures).toBe(1)
		expect(failedCalendar?.nextSyncAt.getTime()).toBeGreaterThan(failureAt.getTime())
		const openIncidents = await db
			.select()
			.from(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.providerId, ids.providerId))
		expect(
			openIncidents.some(
				(incident) =>
					incident.entityId === firstId && incident.status === "open" && incident.syncRunId
			)
		).toBe(true)

		await revokeProviderExternalCalendar({
			providerId: ids.providerId,
			calendarId: firstId,
		})
		const afterRevoke = await db
			.select()
			.from(EffectiveAvailability)
			.where(eq(EffectiveAvailability.date, "2026-08-11"))
			.then((rows) => rows.find((row) => row.variantId === ids.variantId))
		expect(afterRevoke?.externalBlockedUnits).toBe(1)
		expect(afterRevoke?.availableUnits).toBe(2)
	}, 90_000)
})
