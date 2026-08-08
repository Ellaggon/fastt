/**
 * Applies 2026-08-20_tour_p2_trust_quality_private.sql twice in one transaction
 * and asserts schema objects remain present without error.
 * Side effects are rolled back via intentional abort.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"

import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"

ensureCleanPostgresEnv()

const MIGRATION = path.resolve("db/migrations/2026-08-20_tour_p2_trust_quality_private.sql")

function connectionUrl(): string {
	const url =
		process.env.DIRECT_URL?.trim() ||
		process.env.SUPABASE_DB_POOLER_URL?.trim() ||
		process.env.DATABASE_URL?.trim() ||
		""
	if (!url) throw new Error("Missing DIRECT_URL / SUPABASE_DB_POOLER_URL / DATABASE_URL")
	return url
}

async function main() {
	const source = await readFile(MIGRATION, "utf8")
	const sql = postgres(connectionUrl(), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 20,
	})

	try {
		await sql.begin(async (tx) => {
			await tx.unsafe(source)
			await tx.unsafe(source)

			const objects = await tx<{ name: string; kind: string }[]>`
				select c.relname as name, c.relkind::text as kind
				from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public'
					and c.relname in (
						'MarketplaceEvent',
						'TourPrivateRequest',
						'ProductReview_bookingId_unique',
						'ProductReview_bookingId_idx',
						'MarketplaceEvent_surface_created_idx',
						'MarketplaceEvent_target_created_idx',
						'TourPrivateRequest_provider_status_idx',
						'TourPrivateRequest_product_idx'
					)
				order by c.relname
			`

			const bookingCol = await tx<{ exists: boolean }[]>`
				select exists (
					select 1
					from information_schema.columns
					where table_schema = 'public'
						and table_name = 'ProductReview'
						and column_name = 'bookingId'
				) as exists
			`

			const names = new Set(objects.map((row) => row.name))
			const required = [
				"MarketplaceEvent",
				"TourPrivateRequest",
				"ProductReview_bookingId_unique",
				"ProductReview_bookingId_idx",
				"MarketplaceEvent_surface_created_idx",
				"MarketplaceEvent_target_created_idx",
				"TourPrivateRequest_provider_status_idx",
				"TourPrivateRequest_product_idx",
			]
			const missing = required.filter((name) => !names.has(name))
			if (missing.length > 0) {
				throw new Error(`Missing schema objects after double apply: ${missing.join(", ")}`)
			}
			if (!bookingCol[0]?.exists) {
				throw new Error("ProductReview.bookingId missing after double apply")
			}

			console.log(
				JSON.stringify(
					{
						action: "validated_idempotent",
						ok: true,
						objects: [...names].sort(),
						productReviewBookingId: true,
					},
					null,
					2
				)
			)
			throw new Error("__VALIDATE_ROLLBACK__")
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === "__VALIDATE_ROLLBACK__") return
		throw error
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
