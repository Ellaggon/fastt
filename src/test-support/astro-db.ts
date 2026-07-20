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
import { threadId } from "node:worker_threads"

import { pathToFileURL } from "node:url"

import { createLocalDatabaseClient, asDrizzleTable } from "@astrojs/db/runtime"
import { sql } from "@astrojs/db/dist/runtime/virtual.js"

// Vitest runs tests in parallel workers (threads). If they share a sqlite/libsql file,
// we can hit `SQLITE_BUSY` flakiness. Give each worker its own DB file.
const vitestWorkerId =
	process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? String(threadId)
const vitestIsolateId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const dbUrl = `file:${path.resolve(process.cwd(), `.vitest/astro-${process.pid}-${vitestWorkerId}-${vitestIsolateId}.db`)}`

const INIT_CACHE_KEY = "__fastt_astro_db_test_init__"

type InitCache = Map<string, Promise<void>>

function getInitCache(): InitCache {
	const scope = globalThis as typeof globalThis & { [INIT_CACHE_KEY]?: InitCache }
	if (!scope[INIT_CACHE_KEY]) {
		scope[INIT_CACHE_KEY] = new Map<string, Promise<void>>()
	}
	return scope[INIT_CACHE_KEY]!
}

export let db: any

// Tables (add as needed when repositories/services import more)
export let Destination: any
export let Product: any
export let HouseRule: any
export let ProductStatus: any
export let ProductPreparationSnapshot: any
export let ProductContent: any
export let ProductLocation: any
export let Image: any
export let ImageUpload: any
export let Provider: any
export let User: any
export let ProviderProfile: any
export let ProviderDocument: any
export let ProviderTaxConfiguration: any
export let ProviderPaymentAccount: any
export let ProviderIntegrationConnection: any
export let ProviderIntegrationSyncLog: any
export let ProviderAuditLog: any
export let ProviderConfigurationState: any
export let ProviderVerification: any
export let ProviderFinancialProfile: any
export let ProviderUser: any
export let ProviderInvitation: any
export let Hotel: any
export let Tour: any
export let Package: any
export let Limousine: any
export let RoomType: any
export let AmenityRoom: any
export let Variant: any
export let VariantCapacity: any
export let VariantRoomProfile: any
export let VariantRoomBed: any
export let VariantRoomAmenity: any
export let VariantReadiness: any
export let ProductService: any
export let ProductServiceAttribute: any
export let VariantInventoryConfig: any
export let DailyInventory: any
export let EffectiveAvailability: any
export let SearchUnitView: any
export let RatePlan: any
export let RatePlanOccupancyPolicy: any
export let CommercialRuleSet: any
export let CommercialRule: any
export let CommercialRuleApplication: any
export let EffectivePricingV2: any
export let TaxFeeDefinition: any
export let TaxFeeAssignment: any
export let EffectiveRestriction: any
export let InventoryLock: any
export let Hold: any
export let PolicyGroup: any
export let Policy: any
export let PolicyAssignment: any
export let CancellationTier: any
export let PolicyRule: any
export let PolicyExceptionRule: any
export let PolicyAuditLog: any
export let Booking: any
export let BookingRoomDetail: any
export let BookingPolicySnapshot: any
export let BookingTaxFee: any
export let RefundQuote: any
export let RefundLedger: any
export let PaymentTransaction: any

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
	// Make short-lived write contention deterministic in tests.
	await db.run(sql.raw("PRAGMA journal_mode=WAL;"))
	await db.run(sql.raw("PRAGMA busy_timeout=5000;"))

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

	// V2-only test safety: ensure every test-created rate plan has a deterministic default
	// occupancy policy row. This is intentionally independent from V1 tables.
	await db.run(
		sql.raw(`
			CREATE TRIGGER IF NOT EXISTS trg_rateplan_default_policy_insert
			AFTER INSERT ON RatePlan
			BEGIN
				INSERT OR IGNORE INTO RatePlanOccupancyPolicy (
					id,
					ratePlanId,
					baseAmount,
					baseCurrency,
					baseAdults,
					baseChildren,
					extraAdultMode,
					extraAdultValue,
					childMode,
					childValue,
					currency,
					effectiveFrom,
					effectiveTo,
					createdAt
				)
				VALUES (
					'rpop_' || NEW.id,
					NEW.id,
					100,
					'USD',
					2,
					0,
					'fixed',
					0,
					'fixed',
					0,
					'USD',
					'2020-01-01',
					'2100-12-31',
					CURRENT_TIMESTAMP
				);
			END;
		`)
	)

	// Build drizzle table objects for the exports expected by the app code.
	const drizzleTables: Record<string, any> = {}
	for (const [name, tableDef] of Object.entries(resolvedConfig.tables)) {
		drizzleTables[name] = asDrizzleTable(name, tableDef as any)
	}

	Destination = drizzleTables.Destination
	Product = drizzleTables.Product
	HouseRule = drizzleTables.HouseRule
	ProductStatus = drizzleTables.ProductStatus
	ProductPreparationSnapshot = drizzleTables.ProductPreparationSnapshot
	ProductContent = drizzleTables.ProductContent
	ProductLocation = drizzleTables.ProductLocation
	Image = drizzleTables.Image
	ImageUpload = drizzleTables.ImageUpload
	Provider = drizzleTables.Provider
	User = drizzleTables.User
	ProviderProfile = drizzleTables.ProviderProfile
	ProviderDocument = drizzleTables.ProviderDocument
	ProviderTaxConfiguration = drizzleTables.ProviderTaxConfiguration
	ProviderPaymentAccount = drizzleTables.ProviderPaymentAccount
	ProviderIntegrationConnection = drizzleTables.ProviderIntegrationConnection
	ProviderIntegrationSyncLog = drizzleTables.ProviderIntegrationSyncLog
	ProviderAuditLog = drizzleTables.ProviderAuditLog
	ProviderConfigurationState = drizzleTables.ProviderConfigurationState
	ProviderVerification = drizzleTables.ProviderVerification
	ProviderFinancialProfile = drizzleTables.ProviderFinancialProfile
	ProviderUser = drizzleTables.ProviderUser
	ProviderInvitation = drizzleTables.ProviderInvitation
	Hotel = drizzleTables.Hotel
	Tour = drizzleTables.Tour
	Package = drizzleTables.Package
	Limousine = drizzleTables.Limousine
	RoomType = drizzleTables.RoomType
	AmenityRoom = drizzleTables.AmenityRoom
	Variant = drizzleTables.Variant
	VariantCapacity = drizzleTables.VariantCapacity
	VariantRoomProfile = drizzleTables.VariantRoomProfile
	VariantRoomBed = drizzleTables.VariantRoomBed
	VariantRoomAmenity = drizzleTables.VariantRoomAmenity
	VariantReadiness = drizzleTables.VariantReadiness
	ProductService = drizzleTables.ProductService
	ProductServiceAttribute = drizzleTables.ProductServiceAttribute
	VariantInventoryConfig = drizzleTables.VariantInventoryConfig
	DailyInventory = drizzleTables.DailyInventory
	EffectiveAvailability = drizzleTables.EffectiveAvailability
	SearchUnitView = drizzleTables.SearchUnitView
	RatePlan = drizzleTables.RatePlan
	RatePlanOccupancyPolicy = drizzleTables.RatePlanOccupancyPolicy
	CommercialRuleSet = drizzleTables.CommercialRuleSet
	CommercialRule = drizzleTables.CommercialRule
	CommercialRuleApplication = drizzleTables.CommercialRuleApplication
	EffectivePricingV2 = drizzleTables.EffectivePricingV2
	TaxFeeDefinition = drizzleTables.TaxFeeDefinition
	TaxFeeAssignment = drizzleTables.TaxFeeAssignment
	EffectiveRestriction = drizzleTables.EffectiveRestriction
	InventoryLock = drizzleTables.InventoryLock
	Hold = drizzleTables.Hold
	PolicyGroup = drizzleTables.PolicyGroup
	Policy = drizzleTables.Policy
	PolicyAssignment = drizzleTables.PolicyAssignment
	CancellationTier = drizzleTables.CancellationTier
	PolicyRule = drizzleTables.PolicyRule
	PolicyExceptionRule = drizzleTables.PolicyExceptionRule
	PolicyAuditLog = drizzleTables.PolicyAuditLog
	Booking = drizzleTables.Booking
	BookingRoomDetail = drizzleTables.BookingRoomDetail
	BookingPolicySnapshot = drizzleTables.BookingPolicySnapshot
	BookingTaxFee = drizzleTables.BookingTaxFee
	RefundQuote = drizzleTables.RefundQuote
	RefundLedger = drizzleTables.RefundLedger
	PaymentTransaction = drizzleTables.PaymentTransaction
}

// Top-level await so imports are ready before tests execute.
const initCache = getInitCache()
const initPromise = initCache.get(dbUrl) ?? init()
initCache.set(dbUrl, initPromise)
await initPromise
