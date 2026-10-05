import type { APIRoute } from "astro"
import { v5 as uuidv5 } from "uuid"
import { ZodError, z } from "zod"
import {
	db,
	eq,
	TourSlotProfile,
	Variant,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"

import {
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
	creationKey: z.string().uuid().optional(),
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
	updateDefaultCapacity: z.boolean().default(false),
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
			creationKey: form.get("creationKey") || undefined,
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
			updateDefaultCapacity: ["true", "on"].includes(
				String(form.get("updateDefaultCapacity") ?? "")
			),
		})

		const owned = await productRepository.ensureProductOwnedByProvider(parsed.productId, providerId)
		if (!owned || !isTourProductType(owned.productType)) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		// A creation intent maps to one server-derived ID even if the response is lost.
		// Ownership stays authoritative; client keys never grant access to a variant.
		let variantId = String(parsed.variantId ?? "").trim()
		const recoveringCreation = !variantId && Boolean(parsed.creationKey)
		if (recoveringCreation)
			variantId = uuidv5(
				JSON.stringify([providerId, parsed.productId, parsed.creationKey]),
				uuidv5.URL
			)
		let existing = variantId ? await variantManagementRepository.getVariantById(variantId) : null
		if (parsed.variantId && !existing)
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		if (!existing) {
			try {
				const result = await createVariant(
					{
						repo: variantManagementRepository,
						inventoryConfigRepo: variantInventoryConfigRepository,
					},
					{
						variantId: variantId || undefined,
						productId: parsed.productId,
						name: parsed.name,
						kind: "tour_slot",
						description: parsed.description ?? null,
						defaultTotalUnits: parsed.maxPax,
						bootstrapInventory: false,
					}
				)
				variantId = result.variantId
			} catch (error) {
				// Another same-intent request may have inserted the row, or initialization
				// may have failed after insertion. Finish that same row on the retry.
				existing = recoveringCreation
					? await variantManagementRepository.getVariantById(variantId)
					: null
				if (!existing) throw error
			}
		}
		if (existing) {
			if (
				existing.productId !== parsed.productId ||
				String(existing.kind ?? "").toLowerCase() !== "tour_slot"
			) {
				return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
			}
			await db
				.update(Variant)
				.set({ name: parsed.name, description: parsed.description ?? null })
				.where(eq(Variant.id, variantId))
		}

		const overrideRaw = String(parsed.meetingPointOverride ?? "").trim()
		const meetingPointOverrideJson = overrideRaw ? { instructions: overrideRaw } : null

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

		await db
			.insert(TourSlotProfile)
			.values({ variantId, ...profileValues, createdAt: new Date() })
			.onConflictDoUpdate({ target: TourSlotProfile.variantId, set: profileValues })

		const inventoryConfig = await variantInventoryConfigRepository.getByVariantId(variantId)
		// Initial setup needs a default; subsequent profile edits do not change it.
		// An explicit default change never rewrites scheduled dates or reservations.
		const defaultCapacityUpdated = !inventoryConfig || parsed.updateDefaultCapacity
		if (!inventoryConfig) {
			await variantInventoryConfigRepository.upsert({
				variantId,
				defaultTotalUnits: parsed.maxPax,
				horizonDays: 365,
			})
		} else if (parsed.updateDefaultCapacity) {
			await db
				.update(VariantInventoryConfig)
				.set({ defaultTotalUnits: parsed.maxPax })
				.where(eq(VariantInventoryConfig.variantId, variantId))
		}
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

		return new Response(JSON.stringify({ ok: true, variantId, defaultCapacityUpdated }), {
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
