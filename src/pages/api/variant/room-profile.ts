import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import {
	AmenityRoom,
	db,
	eq,
	inArray,
	Variant,
	VariantRoomAmenity,
	VariantRoomBed,
	VariantRoomProfile,
} from "astro:db"

import {
	inventoryBootstrapper,
	productRepository,
	variantInventoryConfigRepository,
	variantManagementRepository,
} from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { refreshProductPreparationSnapshotAfterMutation } from "@/lib/playbook/summarize-product-preparation"
import { isHotelProductType } from "@/lib/productVerticalRegistry"
import { createVariant } from "@/modules/catalog/public"

const nullableNumber = z.preprocess((value) => {
	if (value === null || value === undefined || value === "") return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : value
}, z.number().int().min(0).nullable())

const requiredPositiveNumber = z.preprocess((value) => Number(value), z.number().int().min(1))

const roomProfileSchema = z.object({
	productId: z.string().trim().min(1),
	variantId: z.string().trim().optional(),
	name: z.string().trim().min(1),
	description: z.string().trim().optional(),
	roomCode: z.string().trim().optional(),
	roomTypeId: z.string().trim().optional(),
	minOccupancy: requiredPositiveNumber,
	maxOccupancy: requiredPositiveNumber,
	maxAdults: nullableNumber,
	maxChildren: nullableNumber,
	totalRooms: requiredPositiveNumber,
	sizeM2: nullableNumber,
	viewType: z.string().trim().optional(),
	bathroomCount: nullableNumber,
	bathroomType: z.string().trim().optional(),
	hasBalcony: z.enum(["true", "false", "unknown", ""]).optional(),
	guestFacingNotes: z.string().trim().optional(),
	bedTypes: z.array(z.string().trim().min(1)).min(1),
	bedCounts: z.array(requiredPositiveNumber).min(1),
	bedRoomLabels: z.array(z.string()).optional(),
	amenityIds: z.array(z.string().trim().min(1)).optional(),
})

const uniqueStrings = (values: string[]) => [
	...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

function parseRepeated(form: FormData, key: string) {
	return form.getAll(key).map((value) => String(value ?? ""))
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = roomProfileSchema.parse({
			productId: form.get("productId"),
			variantId: form.get("variantId") ? String(form.get("variantId")) : undefined,
			name: form.get("name"),
			description: form.get("description") ? String(form.get("description")) : undefined,
			roomCode: form.get("roomCode") ? String(form.get("roomCode")) : undefined,
			roomTypeId: form.get("roomTypeId") ? String(form.get("roomTypeId")) : undefined,
			minOccupancy: form.get("minOccupancy"),
			maxOccupancy: form.get("maxOccupancy"),
			maxAdults: form.get("maxAdults"),
			maxChildren: form.get("maxChildren"),
			totalRooms: form.get("totalRooms"),
			sizeM2: form.get("sizeM2"),
			viewType: form.get("viewType") ? String(form.get("viewType")) : undefined,
			bathroomCount: form.get("bathroomCount"),
			bathroomType: form.get("bathroomType") ? String(form.get("bathroomType")) : undefined,
			hasBalcony: form.get("hasBalcony") ? String(form.get("hasBalcony")) : undefined,
			guestFacingNotes: form.get("guestFacingNotes")
				? String(form.get("guestFacingNotes"))
				: undefined,
			bedTypes: parseRepeated(form, "bedType"),
			bedCounts: parseRepeated(form, "bedCount"),
			bedRoomLabels: parseRepeated(form, "bedRoomLabel"),
			amenityIds: parseRepeated(form, "amenityId"),
		})

		if (parsed.maxOccupancy < parsed.minOccupancy) {
			return new Response(
				JSON.stringify({ error: "La ocupación máxima debe ser mayor o igual a la mínima." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		if (parsed.maxAdults != null && parsed.maxAdults > parsed.maxOccupancy) {
			return new Response(
				JSON.stringify({ error: "El máximo de adultos no puede superar el máximo de huéspedes." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		if (parsed.maxChildren != null && parsed.maxChildren > parsed.maxOccupancy) {
			return new Response(
				JSON.stringify({ error: "El máximo de niños no puede superar el máximo de huéspedes." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		if (parsed.bedTypes.length !== parsed.bedCounts.length) {
			return new Response(JSON.stringify({ error: "Cada cama debe tener tipo y cantidad." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(parsed.productId, providerId)
		if (!owned || !isHotelProductType(owned.productType)) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		let variantId = String(parsed.variantId ?? "").trim()
		const roomCodeRaw = String(parsed.roomCode ?? "").trim()
		const roomCode = roomCodeRaw ? roomCodeRaw.toUpperCase() : null
		if (roomCode) {
			const roomCodeMatches = await db
				.select({ id: Variant.id, externalCode: Variant.externalCode })
				.from(Variant)
				.where(eq(Variant.productId, parsed.productId))
				.all()
			const duplicateRoomCode = roomCodeMatches.find((row) => {
				const rowId = String(row.id ?? "").trim()
				const existingCode = String(row.externalCode ?? "")
					.trim()
					.toUpperCase()
				return rowId !== variantId && existingCode === roomCode
			})
			if (duplicateRoomCode) {
				return new Response(
					JSON.stringify({
						error: "Ya existe una habitación con ese código interno en este alojamiento.",
					}),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				)
			}
		}
		if (variantId) {
			const existing = await variantManagementRepository.getVariantById(variantId)
			if (!existing || existing.productId !== parsed.productId) {
				return new Response(JSON.stringify({ error: "Not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				})
			}
			if (
				String(existing.kind ?? "")
					.trim()
					.toLowerCase() !== "hotel_room"
			) {
				return new Response(JSON.stringify({ error: "La ficha solo aplica a habitaciones." }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				})
			}
			await db
				.update(Variant)
				.set({
					name: parsed.name,
					description: parsed.description ?? null,
					externalCode: roomCode,
				})
				.where(eq(Variant.id, variantId))
		} else {
			const result = await createVariant(
				{
					repo: variantManagementRepository,
					inventoryConfigRepo: variantInventoryConfigRepository,
					inventoryBootstrap: inventoryBootstrapper,
				},
				{
					productId: parsed.productId,
					name: parsed.name,
					kind: "hotel_room",
					description: parsed.description ?? null,
				}
			)
			variantId = result.variantId
			if (roomCode) {
				await db.update(Variant).set({ externalCode: roomCode }).where(eq(Variant.id, variantId))
			}
		}

		const profileExists = await db
			.select({ variantId: VariantRoomProfile.variantId })
			.from(VariantRoomProfile)
			.where(eq(VariantRoomProfile.variantId, variantId))
			.get()
		const roomTypeId = parsed.roomTypeId || null
		const hasBalcony =
			parsed.hasBalcony === "true" ? true : parsed.hasBalcony === "false" ? false : null
		const profileValues = {
			roomTypeId,
			sizeM2: parsed.sizeM2,
			viewType: parsed.viewType || null,
			bathroomCount: parsed.bathroomCount,
			bathroomType: parsed.bathroomType || null,
			hasBalcony,
			guestFacingNotes: parsed.guestFacingNotes || null,
			updatedAt: new Date(),
		}

		if (profileExists) {
			await db
				.update(VariantRoomProfile)
				.set(profileValues)
				.where(eq(VariantRoomProfile.variantId, variantId))
		} else {
			await db.insert(VariantRoomProfile).values({
				variantId,
				...profileValues,
				createdAt: new Date(),
			})
		}

		await variantInventoryConfigRepository.upsert({
			variantId,
			defaultTotalUnits: parsed.totalRooms,
			horizonDays: 365,
		})
		await inventoryBootstrapper.bootstrapVariantInventory({
			variantId,
			totalInventory: parsed.totalRooms,
			days: 365,
		})

		await variantManagementRepository.upsertCapacity({
			variantId,
			minOccupancy: parsed.minOccupancy,
			maxOccupancy: parsed.maxOccupancy,
			maxAdults: parsed.maxAdults,
			maxChildren: parsed.maxChildren,
		})

		await db.delete(VariantRoomBed).where(eq(VariantRoomBed.variantId, variantId))
		for (let index = 0; index < parsed.bedTypes.length; index += 1) {
			await db.insert(VariantRoomBed).values({
				id: `${variantId}:bed:${index}:${crypto.randomUUID()}`,
				variantId,
				bedType: parsed.bedTypes[index],
				count: parsed.bedCounts[index],
				roomLabel: parsed.bedRoomLabels?.[index]?.trim() || null,
				sortOrder: index,
			})
		}

		await db.delete(VariantRoomAmenity).where(eq(VariantRoomAmenity.variantId, variantId))
		const amenityIds = uniqueStrings(parsed.amenityIds ?? [])
		if (amenityIds.length > 0) {
			const validAmenityRows = await db
				.select({ id: AmenityRoom.id })
				.from(AmenityRoom)
				.where(inArray(AmenityRoom.id, amenityIds))
				.all()
			const validAmenityIds = new Set(validAmenityRows.map((row) => String(row.id)))
			for (const amenityId of amenityIds) {
				if (!validAmenityIds.has(amenityId)) continue
				await db.insert(VariantRoomAmenity).values({
					id: `${variantId}:amenity:${amenityId}`,
					variantId,
					amenityId,
					isAvailable: true,
				})
			}
		}

		await invalidateVariant(variantId, parsed.productId)
		await refreshProductPreparationSnapshotAfterMutation({
			productId: parsed.productId,
			providerId,
			request,
			source: "variant.room-profile",
		})

		return new Response(JSON.stringify({ ok: true, variantId }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
