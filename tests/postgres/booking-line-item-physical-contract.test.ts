import "dotenv/config"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated =
	process.env.FASTT_DATA_ENV === "test"
		? prepareIsolatedTestDatabase()
		: { configured: false as const }
const connectionUrl = isolated.configured ? (isolated.directUrl ?? isolated.runtimeUrl) : ""
const describePostgres = connectionUrl ? describe : describe.skip

describePostgres("BookingLineItem physical contract", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
	})

	afterAll(async () => {
		if (sql) await sql.end()
	})

	it("uses the cross-vertical table name across table, constraints, indexes and trigger", async () => {
		const [tables, constraints, indexes, triggers] = await Promise.all([
			sql`
				select relname
				from pg_class
				where relkind = 'r'
					and relname in ('BookingRoomDetail', 'BookingLineItem')
				order by relname
			`,
			sql`
				select conname
				from pg_constraint
				where conrelid = '"BookingLineItem"'::regclass
				order by conname
			`,
			sql`
				select indexname
				from pg_indexes
				where tablename = 'BookingLineItem'
				order by indexname
			`,
			sql`
				select tgname
				from pg_trigger
				where tgrelid = '"BookingLineItem"'::regclass
					and not tgisinternal
				order by tgname
			`,
		])

		expect(tables).toEqual([{ relname: "BookingLineItem" }])
		expect(constraints.map((row) => row.conname)).toEqual(
			expect.arrayContaining([
				"BookingLineItem_pkey",
				"BookingLineItem_bookingId_fk",
				"BookingLineItem_variantId_fk",
				"BookingLineItem_ratePlanId_fk",
				"BookingLineItem_guest_counts_check",
				"BookingLineItem_amounts_nonnegative_check",
			])
		)
		expect(indexes.map((row) => row.indexname)).toEqual(
			expect.arrayContaining([
				"BookingLineItem_bookingId_idx",
				"BookingLineItem_variantId_idx",
				"BookingLineItem_ratePlanId_idx",
			])
		)
		expect(triggers).toEqual([{ tgname: "trg_BookingLineItem_positive_range" }])
	})
})
