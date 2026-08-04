import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
}

describe("channel manager booking revision guardrails", () => {
	it("keeps polling and dispatch in the integration worker", () => {
		const scheduler = read("src/lib/provider-integration-scheduler.ts")
		expect(scheduler).toContain("enqueueBookingRevisionFeedJobs")
		expect(scheduler).toContain("BOOKING_REVISION_FEED_OPERATION")
		expect(scheduler).toContain("runProviderBookingRevisionFeed")
		expect(scheduler).toContain("'booking-feed:' || \"id\"")
	})

	it("keeps transaction, idempotency and acknowledgement boundaries explicit", () => {
		const service = read("src/lib/channel-manager/channel-manager-booking-revisions.ts")
		const transaction = service.indexOf("return db.transaction")
		const revisionWrite = service.indexOf("externalRevisionId: params.revision.id")
		const acknowledgement = service.indexOf("adapter.acknowledgeBookingRevision")

		expect(transaction).toBeGreaterThan(-1)
		expect(service).toContain("pg_advisory_xact_lock")
		expect(service).toContain("Booking.integrationConnectionId")
		expect(service).toContain("Booking.externalBookingId")
		expect(revisionWrite).toBeGreaterThan(transaction)
		expect(acknowledgement).toBeGreaterThan(revisionWrite)
	})

	it("does not model or persist payment-card fields", () => {
		const contract = read("src/lib/channel-manager/channel-manager-adapter.ts")
		const service = read("src/lib/channel-manager/channel-manager-booking-revisions.ts")
		const forbidden = /card_number|cardholder|cardholder_name|cvv|cvc|expiry_month|expiry_year/i

		expect(contract).not.toMatch(forbidden)
		expect(service).not.toMatch(forbidden)
		expect(service).toContain("pciDataStored: false")
	})

	it("keeps canonical external keys in PostgreSQL and the Drizzle schema", () => {
		const migration = read("db/migrations/2026-08-13_channel_manager_booking_revisions.sql")
		const baseline = read("db/postgres/0001_initial_schema.sql")
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		for (const source of [migration, baseline, schema]) {
			expect(source).toContain("externalBookingId")
			expect(source).toContain("externalRevisionId")
			expect(source).toContain("Booking_connection_external_booking_unique")
			expect(source).toContain("Booking_connection_external_revision_unique")
		}
	})
})
