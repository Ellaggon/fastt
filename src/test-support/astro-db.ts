// Vitest-only runtime for `astro:db`.
//
// Astro provides `astro:db` as a virtual module during app builds. Vitest runs in Node/Vite,
// so we supply a compatible module that:
// - Re-exports query helpers (`eq`, `and`, `column`, etc.)
// - Creates a local test database
// - Applies schema from `db/config.ts`
// - Exports `db` and the tables used by the codebase

export * from "@astrojs/db/dist/runtime/virtual.js"

import path from "node:path"
import { mkdirSync } from "node:fs"

import { pathToFileURL } from "node:url"

import { createLocalDatabaseClient, asDrizzleTable } from "@astrojs/db/runtime"
import { sql } from "@astrojs/db/dist/runtime/virtual.js"

export const dbUrl = `file:${path.resolve(process.cwd(), `.vitest/astro-${process.pid}.db`)}`

export let db: any

// Tables (add as needed when repositories/services import more)
export let Destination: any
export let Product: any
export let Variant: any
export let DailyInventory: any
export let EffectiveInventory: any
export let RatePlanTemplate: any
export let RatePlan: any
export let PriceRule: any
export let EffectivePricing: any
export let Restriction: any

async function init() {
	// Ensure local folder exists
	mkdirSync(path.resolve(process.cwd(), ".vitest"), { recursive: true })

	// Load config after we have re-exported `defineDb`/`defineTable`/`column` from virtual runtime.
	const { default: config } = await import("../../db/config.ts")

	// Normalize config (notably: derive stable, unique index names from array form)
	const schemasUrl = pathToFileURL(
		path.resolve(process.cwd(), "node_modules/@astrojs/db/dist/core/schemas.js")
	).href
	const { dbConfigSchema } = await import(schemasUrl)
	const resolvedConfig = dbConfigSchema.parse(config)

	// Create and migrate local database
	db = createLocalDatabaseClient({ dbUrl })

	// Import internal migration helpers via absolute file URL to avoid package export restrictions.
	const migrationUrl = pathToFileURL(
		path.resolve(process.cwd(), "node_modules/@astrojs/db/dist/core/cli/migration-queries.js")
	).href

	const { createCurrentSnapshot, createEmptySnapshot, getMigrationQueries } = await import(
		migrationUrl
	)

	const oldSnapshot = createEmptySnapshot()
	const newSnapshot = createCurrentSnapshot({ tables: resolvedConfig.tables })
	const { queries } = await getMigrationQueries({ oldSnapshot, newSnapshot, reset: true })

	for (const q of queries) {
		await db.run(sql.raw(q))
	}

	// Build drizzle table objects for the exports expected by the app code.
	const drizzleTables: Record<string, any> = {}
	for (const [name, tableDef] of Object.entries(resolvedConfig.tables)) {
		drizzleTables[name] = asDrizzleTable(name, tableDef as any)
	}

	Destination = drizzleTables.Destination
	Product = drizzleTables.Product
	Variant = drizzleTables.Variant
	DailyInventory = drizzleTables.DailyInventory
	EffectiveInventory = drizzleTables.EffectiveInventory
	RatePlanTemplate = drizzleTables.RatePlanTemplate
	RatePlan = drizzleTables.RatePlan
	PriceRule = drizzleTables.PriceRule
	EffectivePricing = drizzleTables.EffectivePricing
	Restriction = drizzleTables.Restriction
}

// Top-level await so imports are ready before tests execute.
await init()
