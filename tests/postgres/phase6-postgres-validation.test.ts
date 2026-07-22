import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { cacheKeys } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { BookingFromHoldRepository } from "@/modules/booking/infrastructure/repositories/BookingFromHoldRepository"
import { ensureUserForSession } from "@/modules/identity/application/use-cases/ensure-user-for-session"
import { UserRepository } from "@/modules/identity/infrastructure/repositories/UserRepository"
import { closePostgresClients } from "@/shared/infrastructure/db/client"

const connectionUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || ""
const runPostgresTests = connectionUrl.length > 0
const describePostgres = runPostgresTests ? describe : describe.skip

type Sql = postgres.Sql

const prefix = `phase6-${Date.now()}-${randomUUID().slice(0, 8)}`

function id(name: string) {
	return `${prefix}-${name}`
}

function dateOnly(value: unknown) {
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	return String(value).slice(0, 10)
}

async function seedCatalog(sql: Sql, scope = randomUUID().slice(0, 8)) {
	const ids = {
		providerId: id(`${scope}-provider`),
		destinationId: id(`${scope}-destination`),
		productId: id(`${scope}-product`),
		variantId: id(`${scope}-variant`),
		ratePlanId: id(`${scope}-rate-plan`),
	}

	await sql`
		insert into "Provider" ("id", "legalName", "displayName", "status", "createdAt")
		values (${ids.providerId}, 'Phase 6 Provider', 'Phase 6 Provider', 'active', now())
	`
	await sql`
		insert into "Destination" ("id", "name", "type", "country", "slug")
		values (${ids.destinationId}, 'Phase 6 Destination', 'city', 'BO', ${ids.destinationId})
	`
	await sql`
		insert into "Product" ("id", "name", "productType", "providerId", "destinationId")
		values (${ids.productId}, 'Phase 6 Hotel', 'hotel', ${ids.providerId}, ${ids.destinationId})
	`
	await sql`
		insert into "Variant" ("id", "productId", "name", "kind", "status", "isActive")
		values (${ids.variantId}, ${ids.productId}, 'Phase 6 Room', 'room', 'ready', true)
	`
	await sql`
		insert into "RatePlan" ("id", "variantId", "name", "isDefault", "isActive")
		values (${ids.ratePlanId}, ${ids.variantId}, 'Phase 6 Rate', true, true)
	`

	return ids
}

async function cleanup(sql: Sql) {
	await sql`
		delete from "BookingPolicySnapshot"
		where "bookingId" like ${`${prefix}%`}
			or "bookingId" in (select "id" from "Booking" where "providerId" like ${`${prefix}%`})
	`
	await sql`
		delete from "BookingRoomDetail"
		where "bookingId" like ${`${prefix}%`}
			or "bookingId" in (select "id" from "Booking" where "providerId" like ${`${prefix}%`})
	`
	await sql`
		delete from "BookingTaxFee"
		where "bookingId" like ${`${prefix}%`}
			or "bookingId" in (select "id" from "Booking" where "providerId" like ${`${prefix}%`})
	`
	await sql`delete from "InventoryLock" where "holdId" like ${`${prefix}%`} or "bookingId" like ${`${prefix}%`}`
	await sql`delete from "Hold" where "id" like ${`${prefix}%`}`
	await sql`delete from "Booking" where "id" like ${`${prefix}%`} or "providerId" like ${`${prefix}%`}`
	await sql`delete from "SearchUnitView" where "id" like ${`${prefix}%`}`
	await sql`delete from "EffectivePricingV2" where "id" like ${`${prefix}%`}`
	await sql`delete from "DailyInventory" where "id" like ${`${prefix}%`}`
	await sql`delete from "RatePlan" where "id" like ${`${prefix}%`}`
	await sql`delete from "Variant" where "id" like ${`${prefix}%`}`
	await sql`delete from "Product" where "id" like ${`${prefix}%`}`
	await sql`delete from "Destination" where "id" like ${`${prefix}%`}`
	await sql`delete from "Provider" where "id" like ${`${prefix}%`}`
	await sql`delete from "User" where "email" like ${`${prefix}%@phase6.test`}`
}

describePostgres("phase 6 Postgres double validation", () => {
	let sql: Sql

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 8, prepare: false })
		await cleanup(sql)
	})

	afterAll(async () => {
		if (sql) {
			await cleanup(sql)
			await sql.end()
		}
		await closePostgresClients()
	})

	it("prevents inventory over-reservation under concurrent Postgres writes", async () => {
		const fixture = await seedCatalog(sql)
		const inventoryId = id("daily-inventory")
		const date = "2027-03-01"
		await sql`
			insert into "DailyInventory" ("id", "variantId", "date", "totalInventory", "reservedCount")
			values (${inventoryId}, ${fixture.variantId}, ${date}, 1, 0)
		`

		const reserve = () => sql`
			update "DailyInventory"
			set "reservedCount" = "reservedCount" + 1
			where
				"variantId" = ${fixture.variantId}
				and "date" = ${date}
				and "reservedCount" + 1 <= "totalInventory"
			returning "reservedCount"
		`

		const attempts = await Promise.all([reserve(), reserve()])
		const successfulAttempts = attempts.filter((rows) => rows.length === 1)
		const [row] = await sql`
			select "totalInventory", "reservedCount"
			from "DailyInventory"
			where "id" = ${inventoryId}
		`

		expect(successfulAttempts).toHaveLength(1)
		expect(Number(row.totalInventory)).toBe(1)
		expect(Number(row.reservedCount)).toBe(1)
	})

	it("confirms a booking from a held inventory snapshot and links the hold idempotently", async () => {
		const scope = randomUUID().slice(0, 8)
		const fixture = await seedCatalog(sql, scope)
		const holdId = id(`${scope}-hold-confirm`)
		const date = "2027-03-02"
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
		const pricingSnapshot = {
			ratePlanId: fixture.ratePlanId,
			currency: "USD",
			occupancy: 2,
			occupancyDetail: { adults: 2, children: 0, infants: 0 },
			from: date,
			to: "2027-03-03",
			nights: 1,
			totalPrice: 120,
			days: [{ date, price: 120, pricingSource: "v2" }],
			pricingSource: "v2",
		}
		const policySnapshot = {
			cancellation: null,
			payment: null,
			no_show: null,
			check_in: null,
		}

		await sql`
			insert into "Hold" (
				"id", "variantId", "ratePlanId", "checkIn", "checkOut", "expiresAt",
				"policySnapshotJson", "guestExpectationsSnapshotJson"
			)
			values (
				${holdId}, ${fixture.variantId}, ${fixture.ratePlanId}, ${date}, '2027-03-03',
				${expiresAt}, ${sql.json(policySnapshot)}, ${sql.json({})}
			)
		`
		await sql`
			insert into "InventoryLock" ("id", "holdId", "variantId", "date", "quantity", "expiresAt")
			values (${id(`${scope}-lock-confirm`)}, ${holdId}, ${fixture.variantId}, ${date}, 1, ${expiresAt})
		`
		await persistentCache.set(cacheKeys.holdPricingSnapshot(holdId), pricingSnapshot, 600)
		await persistentCache.set(cacheKeys.holdPolicySnapshot(holdId), policySnapshot, 600)

		const repository = new BookingFromHoldRepository()
		const first = await repository.createBookingFromHold({
			input: { holdId, userId: null, source: "web" },
			resolveEffectiveTaxFees: async () => ({ definitions: [], assignments: [] }),
		})
		const second = await repository.createBookingFromHold({
			input: { holdId, userId: null, source: "web" },
			resolveEffectiveTaxFees: async () => ({ definitions: [], assignments: [] }),
		})

		const [booking] = await sql`
			select "id", "status", "confirmedAt", "totalAmount"
			from "Booking"
			where "id" = ${first.bookingId}
		`
		const [lock] = await sql`
			select "bookingId"
			from "InventoryLock"
			where "holdId" = ${holdId}
		`
		const [roomDetailCount] = await sql`
			select count(*)::int as count from "BookingRoomDetail" where "bookingId" = ${first.bookingId}
		`
		const [taxSnapshotCount] = await sql`
			select count(*)::int as count from "BookingTaxFee" where "bookingId" = ${first.bookingId}
		`

		expect(first.status).toBe("confirmed")
		expect(second.bookingId).toBe(first.bookingId)
		expect(second.idempotent).toBe(true)
		expect(booking.status).toBe("confirmed")
		expect(booking.confirmedAt).toBeTruthy()
		expect(Number(booking.totalAmount)).toBe(120)
		expect(lock.bookingId).toBe(first.bookingId)
		expect(Number(roomDetailCount.count)).toBe(1)
		expect(Number(taxSnapshotCount.count)).toBe(1)
	}, 20_000)

	it("keeps search and pricing materializations aligned on Postgres read models", async () => {
		const fixture = await seedCatalog(sql)
		const date = "2027-03-04"
		const occupancyKey = "adults:2|children:0|infants:0"

		await sql`
			insert into "EffectivePricingV2" (
				"id", "variantId", "ratePlanId", "date", "occupancyKey",
				"baseComponent", "occupancyAdjustment", "ruleAdjustment", "finalBasePrice",
				"currency", "computedAt", "sourceVersion"
			)
			values (
				${id("pricing-v2")}, ${fixture.variantId}, ${fixture.ratePlanId}, ${date}, ${occupancyKey},
				100, 20, -10, 110, 'USD', now(), 'phase6'
			)
		`
		await sql`
			insert into "SearchUnitView" (
				"id", "variantId", "productId", "ratePlanId", "date", "occupancyKey", "totalGuests",
				"hasAvailability", "hasPrice", "isAvailable", "availableUnits", "pricePerNight",
				"currency", "primaryBlocker", "cta", "ctd", "computedAt", "sourceVersion"
			)
			values (
				${id("search-unit")}, ${fixture.variantId}, ${fixture.productId}, ${fixture.ratePlanId},
				${date}, ${occupancyKey}, 2, true, true, true, 3, 110, 'USD', null, false, false,
				now(), 'phase6'
			)
		`

		const [row] = await sql`
			select
				s."variantId",
				s."ratePlanId",
				s."date",
				s."occupancyKey",
				s."isAvailable",
				s."pricePerNight",
				p."finalBasePrice"
			from "SearchUnitView" s
			join "EffectivePricingV2" p
				on p."variantId" = s."variantId"
				and p."ratePlanId" = s."ratePlanId"
				and p."date" = s."date"
				and p."occupancyKey" = s."occupancyKey"
			where s."id" = ${id("search-unit")}
		`

		expect(row.variantId).toBe(fixture.variantId)
		expect(row.ratePlanId).toBe(fixture.ratePlanId)
		expect(dateOnly(row.date)).toBe(date)
		expect(row.occupancyKey).toBe(occupancyKey)
		expect(row.isAvailable).toBe(true)
		expect(Number(row.pricePerNight)).toBe(110)
		expect(Number(row.finalBasePrice)).toBe(110)
	})

	it("syncs concurrent auth sessions to one canonical User row", async () => {
		const email = `${prefix}-auth@phase6.test`
		const repo = new UserRepository()

		const results = await Promise.all([
			ensureUserForSession({ repo }, { email }),
			ensureUserForSession({ repo }, { email }),
		])
		const rows = await sql`select "id", "email" from "User" where "email" = ${email}`

		expect(rows).toHaveLength(1)
		expect(results[0].userId).toBe(rows[0].id)
		expect(results[1].userId).toBe(rows[0].id)
		expect(results.filter((result) => result.created)).toHaveLength(1)
	})
})
