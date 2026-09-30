import { afterEach, describe, expect, it, vi } from "vitest"

import {
	DailyInventory,
	db,
	eq,
	GeoPlace,
	Product,
	ProductGeoPlace,
	Provider,
	ProviderUser,
	TourSlotProfile,
	User,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"
import {
	upsertProduct,
	upsertGeoPlace,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

vi.mock("@/lib/cache/invalidation", () => ({
	invalidateVariant: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: vi.fn().mockResolvedValue(undefined),
}))

import { POST as saveTourSlotProfile } from "@/pages/api/variant/tour-slot-profile"

type SupabaseTestUser = { id: string; email: string }

const priorEnvironment = new Map<string, string | undefined>()
const priorFetch = globalThis.fetch

function installSupabaseAuthStub(usersByToken: Record<string, SupabaseTestUser>) {
	priorEnvironment.set("SUPABASE_URL", process.env.SUPABASE_URL)
	priorEnvironment.set("SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY)
	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		if (url !== `${process.env.SUPABASE_URL}/auth/v1/user`) {
			return new Response("unexpected external request", { status: 500 })
		}
		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })
		return new Response(JSON.stringify(user), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as typeof fetch
}

function makeRequest(token: string, form: FormData) {
	return new Request("http://localhost:4321/api/variant/tour-slot-profile", {
		method: "POST",
		body: form,
		headers: { cookie: `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r` },
	})
}

async function cleanupFixture(fixture: {
	providerId: string
	productId: string
	variantId: string
	geoPlaceId: string
	email: string
}) {
	await db.delete(DailyInventory).where(eq(DailyInventory.variantId, fixture.variantId))
	await db.delete(TourSlotProfile).where(eq(TourSlotProfile.variantId, fixture.variantId))
	await db.delete(VariantCapacity).where(eq(VariantCapacity.variantId, fixture.variantId))
	await db
		.delete(VariantInventoryConfig)
		.where(eq(VariantInventoryConfig.variantId, fixture.variantId))
	await db.delete(Variant).where(eq(Variant.id, fixture.variantId))
	await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, fixture.productId))
	await db.delete(Product).where(eq(Product.id, fixture.productId))
	await db.delete(ProviderUser).where(eq(ProviderUser.providerId, fixture.providerId))
	await db.delete(User).where(eq(User.email, fixture.email))
	await db.delete(Provider).where(eq(Provider.id, fixture.providerId))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, fixture.geoPlaceId))
}

afterEach(() => {
	globalThis.fetch = priorFetch
	for (const [key, value] of priorEnvironment) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
	priorEnvironment.clear()
})

describe("tour slot profile persistence in PostgreSQL", () => {
	it.each([
		{ action: "inserts", seedExistingProfile: false, updateDefaultCapacity: false },
		{ action: "updates", seedExistingProfile: true, updateDefaultCapacity: false },
		{
			action: "explicitly changes the future default and updates",
			seedExistingProfile: true,
			updateDefaultCapacity: true,
		},
	])(
		"$action the slot profile without changing scheduled inventory rows",
		async ({ seedExistingProfile, updateDefaultCapacity }) => {
			const suffix = crypto.randomUUID().replaceAll("-", "")
			const fixture = {
				providerId: `tour-profile-provider-${suffix}`,
				productId: `tour-profile-product-${suffix}`,
				variantId: `tour-profile-slot-${suffix}`,
				geoPlaceId: `tour-profile-place-${suffix}`,
				email: `tour-profile-${suffix}@example.test`,
				token: `tour-profile-token-${suffix}`,
				userId: `user_tour-profile-${suffix}@example.test`,
			}

			installSupabaseAuthStub({
				[fixture.token]: { id: fixture.userId, email: fixture.email },
			})

			try {
				await upsertGeoPlace({
					id: fixture.geoPlaceId,
					name: "Tour profile test city",
					type: "city",
					country: "BO",
					slug: `tour-profile-${suffix}`,
				})
				await upsertProvider({
					id: fixture.providerId,
					displayName: "Tour profile persistence fixture",
					ownerEmail: fixture.email,
					accountPurpose: "integration_certification",
				})
				await upsertProduct({
					id: fixture.productId,
					name: "Tour profile persistence fixture",
					productType: "tour",
					geoPlaceId: fixture.geoPlaceId,
					providerId: fixture.providerId,
					dataClass: "fixture",
				})
				await upsertVariant({
					id: fixture.variantId,
					productId: fixture.productId,
					kind: "tour_slot",
					name: "Salida original",
					description: "Perfil antes del cambio",
					lifecycleState: "ready",
					salesEnabled: false,
					maxOccupancy: 6,
				})
				let seededInventoryConfig: typeof VariantInventoryConfig.$inferSelect | undefined
				let seededProfileCreatedAt: Date | undefined
				if (seedExistingProfile) {
					await db.insert(VariantInventoryConfig).values({
						variantId: fixture.variantId,
						defaultTotalUnits: 6,
						horizonDays: 180,
						createdAt: new Date("2020-01-01T00:00:00Z"),
					})
					seededInventoryConfig = await db
						.select()
						.from(VariantInventoryConfig)
						.where(eq(VariantInventoryConfig.variantId, fixture.variantId))
						.then((rows) => rows[0])
					await db.insert(TourSlotProfile).values({
						variantId: fixture.variantId,
						departureTime: "08:00",
						durationMinutes: 120,
						maxPax: 6,
						languageCode: "en",
						bookingMode: "shared",
						meetingPointOverrideJson: { instructions: "Punto de encuentro anterior" },
						isActive: true,
						createdAt: new Date("2020-01-01T00:00:00.000Z"),
						updatedAt: new Date("2020-01-01T00:00:00.000Z"),
					})
					const seededProfile = await db
						.select()
						.from(TourSlotProfile)
						.where(eq(TourSlotProfile.variantId, fixture.variantId))
						.then((rows) => rows[0])
					seededProfileCreatedAt = seededProfile?.createdAt ?? undefined
				}

				const scheduledRows = [
					{ date: "2030-03-10", totalInventory: 8, reservedCount: 2 },
					{ date: "2030-03-17", totalInventory: 6, reservedCount: 1 },
				]
				await db.insert(DailyInventory).values(
					scheduledRows.map((row) => ({
						id: crypto.randomUUID(),
						variantId: fixture.variantId,
						...row,
					}))
				)
				const before = await db
					.select()
					.from(DailyInventory)
					.where(eq(DailyInventory.variantId, fixture.variantId))

				const form = new FormData()
				form.set("productId", fixture.productId)
				form.set("variantId", fixture.variantId)
				form.set("name", "Salida actualizada")
				form.set("description", "Perfil actualizado sin alterar fechas")
				form.set("departureTime", "09:30")
				form.set("durationMinutes", "180")
				form.set("maxPax", "9")
				form.set("languageCode", "ES")
				form.set("bookingMode", "private")
				form.set("meetingPointOverride", "Entrada principal")
				form.set("isActive", "true")
				if (updateDefaultCapacity) form.set("updateDefaultCapacity", "true")

				const response = await saveTourSlotProfile({
					request: makeRequest(fixture.token, form),
				} as never)
				expect(response.status).toBe(200)
				expect(await response.json()).toMatchObject({
					ok: true,
					variantId: fixture.variantId,
					defaultCapacityUpdated: !seedExistingProfile || updateDefaultCapacity,
				})

				const [profile, capacity, inventoryConfig, after] = await Promise.all([
					db
						.select()
						.from(TourSlotProfile)
						.where(eq(TourSlotProfile.variantId, fixture.variantId))
						.then((rows) => rows[0]),
					db
						.select()
						.from(VariantCapacity)
						.where(eq(VariantCapacity.variantId, fixture.variantId))
						.then((rows) => rows[0]),
					db
						.select()
						.from(VariantInventoryConfig)
						.where(eq(VariantInventoryConfig.variantId, fixture.variantId))
						.then((rows) => rows[0]),
					db.select().from(DailyInventory).where(eq(DailyInventory.variantId, fixture.variantId)),
				])

				expect(profile).toMatchObject({
					departureTime: "09:30",
					durationMinutes: 180,
					maxPax: 9,
					languageCode: "es",
					bookingMode: "private",
					meetingPointOverrideJson: { instructions: "Entrada principal" },
				})
				expect(capacity).toMatchObject({ maxOccupancy: 9, maxAdults: 9 })
				if (seededInventoryConfig) {
					expect(inventoryConfig).toEqual({
						...seededInventoryConfig,
						defaultTotalUnits: updateDefaultCapacity ? 9 : 6,
					})
				} else {
					expect(inventoryConfig).toMatchObject({ defaultTotalUnits: 9, horizonDays: 365 })
				}
				expect(after).toEqual(before)
				expect(after).toHaveLength(scheduledRows.length)
				if (seededProfileCreatedAt) {
					expect(profile?.createdAt).toEqual(seededProfileCreatedAt)
				}
			} finally {
				await cleanupFixture(fixture)
			}
		}
	)
})
