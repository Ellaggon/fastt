import { describe, expect, it } from "vitest"
import {
	AmenityRoom,
	db,
	eq,
	RoomType,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
	VariantRoomAmenity,
	VariantRoomBed,
	VariantRoomProfile,
} from "astro:db"

import { POST as saveRoomProfilePost } from "@/pages/api/variant/room-profile"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function makeAuthedFormRequest(params: { path: string; token?: string; form: FormData }): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedRoomMasterData(suffix: string) {
	await db
		.insert(RoomType)
		.values({
			id: `suite_${suffix}`,
			name: "Suite",
			maxOccupancy: 4,
			description: "Suite test",
		})
		.onConflictDoUpdate({
			target: [RoomType.id],
			set: { name: "Suite", maxOccupancy: 4, description: "Suite test" },
		})
	await db
		.insert(AmenityRoom)
		.values({
			id: `wifi_${suffix}`,
			name: "Wi-Fi en la habitación",
			category: "Conectividad",
		})
		.onConflictDoUpdate({
			target: [AmenityRoom.id],
			set: { name: "Wi-Fi en la habitación", category: "Conectividad" },
		})
	return { roomTypeId: `suite_${suffix}`, amenityId: `wifi_${suffix}` }
}

function buildProfileForm(params: {
	productId: string
	variantId?: string
	roomTypeId: string
	amenityId: string
	roomCode?: string
}) {
	const fd = new FormData()
	fd.set("productId", params.productId)
	if (params.variantId) fd.set("variantId", params.variantId)
	fd.set("name", "Suite vista jardín")
	fd.set("description", "Habitación luminosa con escritorio.")
	if (params.roomCode) fd.set("roomCode", params.roomCode)
	fd.set("roomTypeId", params.roomTypeId)
	fd.set("minOccupancy", "1")
	fd.set("maxOccupancy", "3")
	fd.set("maxAdults", "2")
	fd.set("maxChildren", "1")
	fd.set("totalRooms", "5")
	fd.set("sizeM2", "32")
	fd.set("viewType", "Jardín")
	fd.set("bathroomCount", "1")
	fd.set("bathroomType", "private")
	fd.set("hasBalcony", "true")
	fd.set("guestFacingNotes", "Acceso por segundo piso.")
	fd.append("bedType", "queen")
	fd.append("bedCount", "1")
	fd.append("bedRoomLabel", "Dormitorio")
	fd.append("bedType", "sofa_bed")
	fd.append("bedCount", "1")
	fd.append("bedRoomLabel", "Sala")
	fd.append("amenityId", params.amenityId)
	return fd
}

describe("integration/room profile editor", () => {
	it("creates a hotel room and persists variant, capacity, profile, beds and amenities", async () => {
		const suffix = crypto.randomUUID()
		const token = `token_${suffix}`
		const email = `room-profile-${suffix}@example.com`
		const providerId = `provider_${suffix}`
		const destinationId = `destination_${suffix}`
		const productId = `product_${suffix}`
		const { roomTypeId, amenityId } = await seedRoomMasterData(suffix)

		await upsertDestination({
			id: destinationId,
			name: "Room Profile City",
			type: "city",
			country: "CL",
			slug: `room-profile-${suffix}`,
		})
		await upsertProvider({
			id: providerId,
			displayName: "Room Profile Provider",
			ownerEmail: email,
		})
		await upsertProduct({
			id: productId,
			name: "Room Profile Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: `user_${suffix}`, email } }, async () => {
			const res = await saveRoomProfilePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/room-profile",
					token,
					form: buildProfileForm({ productId, roomTypeId, amenityId, roomCode: "jr-101" }),
				}),
			} as any)
			expect(res.status).toBe(200)
			const json = (await readJson(res)) as any
			expect(typeof json?.variantId).toBe("string")

			const variantId = json.variantId as string
			const [variant, capacity, profile, inventoryConfig, beds, amenities] = await Promise.all([
				db.select().from(Variant).where(eq(Variant.id, variantId)).get(),
				db.select().from(VariantCapacity).where(eq(VariantCapacity.variantId, variantId)).get(),
				db
					.select()
					.from(VariantRoomProfile)
					.where(eq(VariantRoomProfile.variantId, variantId))
					.get(),
				db
					.select()
					.from(VariantInventoryConfig)
					.where(eq(VariantInventoryConfig.variantId, variantId))
					.get(),
				db.select().from(VariantRoomBed).where(eq(VariantRoomBed.variantId, variantId)).all(),
				db
					.select()
					.from(VariantRoomAmenity)
					.where(eq(VariantRoomAmenity.variantId, variantId))
					.all(),
			])

			expect(variant).toMatchObject({
				productId,
				kind: "hotel_room",
				name: "Suite vista jardín",
				externalCode: "JR-101",
			})
			expect(capacity).toMatchObject({
				minOccupancy: 1,
				maxOccupancy: 3,
				maxAdults: 2,
				maxChildren: 1,
			})
			expect(profile).toMatchObject({
				roomTypeId,
				sizeM2: 32,
				viewType: "Jardín",
				bathroomCount: 1,
				bathroomType: "private",
				hasBalcony: true,
				guestFacingNotes: "Acceso por segundo piso.",
			})
			expect(inventoryConfig).toMatchObject({
				defaultTotalUnits: 5,
				horizonDays: 365,
			})
			expect(beds.map((bed) => bed.bedType).sort()).toEqual(["queen", "sofa_bed"])
			expect(amenities).toHaveLength(1)
			expect(amenities[0].amenityId).toBe(amenityId)
		})
	})

	it("rejects duplicate room codes within the same hotel while allowing reusable room types", async () => {
		const suffix = crypto.randomUUID()
		const token = `token_dup_code_${suffix}`
		const email = `room-code-${suffix}@example.com`
		const providerId = `provider_code_${suffix}`
		const destinationId = `destination_code_${suffix}`
		const productId = `product_code_${suffix}`
		const { roomTypeId, amenityId } = await seedRoomMasterData(`code_${suffix}`)

		await upsertDestination({
			id: destinationId,
			name: "Room Code City",
			type: "city",
			country: "CL",
			slug: `room-code-${suffix}`,
		})
		await upsertProvider({ id: providerId, displayName: "Room Code Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Room Code Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: `user_code_${suffix}`, email } }, async () => {
			const first = await saveRoomProfilePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/room-profile",
					token,
					form: buildProfileForm({ productId, roomTypeId, amenityId, roomCode: "dlx-01" }),
				}),
			} as any)
			expect(first.status).toBe(200)

			const duplicate = await saveRoomProfilePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/room-profile",
					token,
					form: buildProfileForm({ productId, roomTypeId, amenityId, roomCode: "DLX-01" }),
				}),
			} as any)
			expect(duplicate.status).toBe(400)
			const duplicateBody = (await readJson(duplicate)) as any
			expect(String(duplicateBody?.error ?? "")).toContain("código interno")

			const secondSameRoomType = await saveRoomProfilePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/room-profile",
					token,
					form: buildProfileForm({ productId, roomTypeId, amenityId, roomCode: "DLX-02" }),
				}),
			} as any)
			expect(secondSameRoomType.status).toBe(200)
		})
	})

	it("prevents another provider from editing an existing room profile", async () => {
		const suffix = crypto.randomUUID()
		const ownerToken = `owner_${suffix}`
		const intruderToken = `intruder_${suffix}`
		const ownerEmail = `owner-${suffix}@example.com`
		const intruderEmail = `intruder-${suffix}@example.com`
		const providerId = `provider_owner_${suffix}`
		const intruderProviderId = `provider_intruder_${suffix}`
		const destinationId = `destination_owner_${suffix}`
		const productId = `product_owner_${suffix}`
		const { roomTypeId, amenityId } = await seedRoomMasterData(`own_${suffix}`)

		await upsertDestination({
			id: destinationId,
			name: "Ownership City",
			type: "city",
			country: "CL",
			slug: `ownership-${suffix}`,
		})
		await upsertProvider({ id: providerId, displayName: "Owner Provider", ownerEmail })
		await upsertProvider({
			id: intruderProviderId,
			displayName: "Intruder Provider",
			ownerEmail: intruderEmail,
		})
		await upsertProduct({
			id: productId,
			name: "Owner Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		let variantId = ""
		await withSupabaseAuthStub(
			{ [ownerToken]: { id: `owner_user_${suffix}`, email: ownerEmail } },
			async () => {
				const res = await saveRoomProfilePost({
					request: makeAuthedFormRequest({
						path: "/api/variant/room-profile",
						token: ownerToken,
						form: buildProfileForm({ productId, roomTypeId, amenityId }),
					}),
				} as any)
				expect(res.status).toBe(200)
				variantId = ((await readJson(res)) as any).variantId
			}
		)

		await withSupabaseAuthStub(
			{ [intruderToken]: { id: `intruder_user_${suffix}`, email: intruderEmail } },
			async () => {
				const res = await saveRoomProfilePost({
					request: makeAuthedFormRequest({
						path: "/api/variant/room-profile",
						token: intruderToken,
						form: buildProfileForm({ productId, variantId, roomTypeId, amenityId }),
					}),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})
})
