import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { first, db, eq, TourSlotProfile, Variant } from "@/shared/infrastructure/db/compat"

import {
	inventoryBootstrapper,
	productRepository,
	variantInventoryConfigRepository,
	variantManagementRepository,
} from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import { createVariant } from "@/modules/catalog/public"

const requiredPositiveNumber = z.preprocess((value) => Number(value), z.number().int().min(1))

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const tourSlotSchema = z.object({
	productId: z.string().trim().min(1),
	variantId: z.string().trim().optional(),
	name: z.string().trim().min(1),
	description: z.string().trim().optional(),
	departureTime: z.string().trim().regex(TIME_RE, "Usa hora HH:MM (24h)"),
	durationMinutes: z.preprocess((value) => {
		if (value === null || value === undefined || value === "") return null
		const n = Number(value)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(1).nullable().optional()),
	maxPax: requiredPositiveNumber,
	languageCode: z.string().trim().min(2).max(16),
	bookingMode: z.enum(["shared", "private"]).default("shared"),
	meetingPointOverride: z.string().trim().optional(),
	isActive: z.boolean().default(true),
})

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
		const parsed = tourSlotSchema.parse({
			productId: form.get("productId"),
			variantId: form.get("variantId") ? String(form.get("variantId")) : undefined,
			name: form.get("name"),
			description: form.get("description") ? String(form.get("description")) : undefined,
			departureTime: form.get("departureTime"),
			durationMinutes: form.get("durationMinutes"),
			maxPax: form.get("maxPax"),
			languageCode: form.get("languageCode"),
			bookingMode: form.get("bookingMode") || "shared",
			meetingPointOverride: form.get("meetingPointOverride")
				? String(form.get("meetingPointOverride"))
				: undefined,
			isActive: form.has("isActive"),
		})

		const owned = await productRepository.ensureProductOwnedByProvider(parsed.productId, providerId)
		if (!owned || !isTourProductType(owned.productType)) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		let variantId = String(parsed.variantId ?? "").trim()
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
					.toLowerCase() !== "tour_slot"
			) {
				return new Response(JSON.stringify({ error: "La ficha solo aplica a salidas." }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				})
			}
			await db
				.update(Variant)
				.set({
					name: parsed.name,
					description: parsed.description ?? null,
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
					kind: "tour_slot",
					description: parsed.description ?? null,
					defaultTotalUnits: parsed.maxPax,
				}
			)
			variantId = result.variantId
		}

		const overrideRaw = String(parsed.meetingPointOverride ?? "").trim()
		const meetingPointOverrideJson = overrideRaw ? { instructions: overrideRaw } : null

		const profileExists = await db
			.select({ variantId: TourSlotProfile.variantId })
			.from(TourSlotProfile)
			.where(eq(TourSlotProfile.variantId, variantId))
			.then(first)

		const profileValues = {
			departureTime: parsed.departureTime,
			durationMinutes: parsed.durationMinutes ?? null,
			maxPax: parsed.maxPax,
			languageCode: parsed.languageCode.toLowerCase(),
			bookingMode: parsed.bookingMode,
			meetingPointOverrideJson,
			isActive: parsed.isActive,
			updatedAt: new Date(),
		}

		if (profileExists) {
			await db
				.update(TourSlotProfile)
				.set(profileValues)
				.where(eq(TourSlotProfile.variantId, variantId))
		} else {
			await db.insert(TourSlotProfile).values({
				variantId,
				...profileValues,
				createdAt: new Date(),
			})
		}

		await variantInventoryConfigRepository.upsert({
			variantId,
			defaultTotalUnits: parsed.maxPax,
			horizonDays: 365,
		})
		await inventoryBootstrapper.bootstrapVariantInventory({
			variantId,
			totalInventory: parsed.maxPax,
			days: 365,
		})

		await variantManagementRepository.upsertCapacity({
			variantId,
			minOccupancy: 1,
			maxOccupancy: parsed.maxPax,
			maxAdults: parsed.maxPax,
			maxChildren: null,
		})

		await invalidateVariant(variantId, parsed.productId)
		await refreshProductOperationalSurfaceAfterMutation({
			productId: parsed.productId,
			providerId,
			request,
			source: "variant.tour-slot-profile",
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
		console.error("tour-slot-profile error", e)
		return new Response(JSON.stringify({ error: "internal_error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
