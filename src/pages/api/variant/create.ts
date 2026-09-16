import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider, invalidateVariant } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { createVariant } from "@/modules/catalog/public"
import {
	variantManagementRepository,
	productRepository,
	inventoryBootstrapper,
	variantInventoryConfigRepository,
} from "@/container"
import {
	db,
	eq,
	InventoryResource,
	VariantCapacity,
	WholeHome,
	WholeHomeUnit,
} from "@/shared/infrastructure/db/compat"

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
		const productId = String(form.get("productId") ?? "").trim()
		const name = String(form.get("name") ?? "").trim()
		const kind = String(form.get("kind") ?? "").trim() as any
		const description = form.get("description") ? String(form.get("description")) : null
		const physicalKey = String(form.get("physicalKey") ?? "").trim()
		const maxGuests = Math.max(1, Math.floor(Number(form.get("maxGuests") ?? 1) || 1))

		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (kind === "whole_home" && !physicalKey) {
			return new Response(JSON.stringify({ error: "physicalKey is required for a whole home" }), {
				status: 400,
			})
		}
		if (kind === "whole_home") {
			const [home, existingUnit] = await Promise.all([
				db
					.select({ productId: WholeHome.productId })
					.from(WholeHome)
					.where(eq(WholeHome.productId, productId))
					.then((rows) => rows[0]),
				db
					.select({ variantId: WholeHomeUnit.variantId })
					.from(WholeHomeUnit)
					.where(eq(WholeHomeUnit.productId, productId))
					.then((rows) => rows[0]),
			])
			if (!home)
				return new Response(JSON.stringify({ error: "WHOLE_HOME_PROFILE_REQUIRED" }), {
					status: 409,
				})
			if (existingUnit)
				return new Response(JSON.stringify({ error: "WHOLE_HOME_UNIT_ALREADY_EXISTS" }), {
					status: 409,
				})
		}
		const result = await createVariant(
			{
				repo: variantManagementRepository,
				inventoryConfigRepo: variantInventoryConfigRepository,
				inventoryBootstrap: inventoryBootstrapper,
			},
			{
				productId,
				name,
				kind,
				description,
				defaultTotalUnits: kind === "whole_home" ? 1 : undefined,
			}
		)
		if (kind === "whole_home") {
			const resourceId = crypto.randomUUID()
			await db.transaction(async (tx) => {
				await tx.insert(InventoryResource).values({
					id: resourceId,
					providerId,
					variantId: result.variantId,
					label: name,
					metadataJson: { type: "whole_home", physicalKey },
				})
				await tx.insert(WholeHomeUnit).values({
					variantId: result.variantId,
					productId,
					providerId,
					resourceId,
					physicalKey,
					unitCount: 1,
				})
				await tx.insert(VariantCapacity).values({
					variantId: result.variantId,
					minOccupancy: 1,
					maxOccupancy: maxGuests,
					maxAdults: maxGuests,
					maxChildren: maxGuests,
				})
				await tx
					.update(WholeHome)
					.set({ maxGuests, updatedAt: new Date() })
					.where(eq(WholeHome.productId, productId))
			})
		}
		await invalidateVariant(result.variantId, productId)
		await invalidateProvider(providerId)
		await refreshProductOperationalSurfaceAfterMutation({
			productId,
			providerId,
			request,
			source: "variant.create",
		})

		return new Response(JSON.stringify(result), {
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
		const status = msg.includes("not match product type") ? 400 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
