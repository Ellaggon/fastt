import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProduct } from "@/lib/cache/invalidation"
import { refreshProductPreparationSnapshotAfterMutation } from "@/lib/playbook/summarize-product-preparation"
import { geoPlaceCompatibilityError, upsertProductLocation } from "@/modules/catalog/public"
import { productRepository } from "@/container"
import { and, db, eq, first, GeoPlace } from "@/shared/infrastructure/db/compat"

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
		const raw = {
			productId: String(form.get("productId") ?? ""),
			geoPlaceId: String(form.get("geoPlaceId") ?? "").trim(),
			address: String(form.get("address") ?? ""),
			lat: form.get("lat"),
			lng: form.get("lng"),
		}

		const owned = await productRepository.ensureProductOwnedByProvider(raw.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const geoPlace = raw.geoPlaceId
			? await db
					.select({ id: GeoPlace.id, placeType: GeoPlace.placeType })
					.from(GeoPlace)
					.where(and(eq(GeoPlace.id, raw.geoPlaceId), eq(GeoPlace.status, "active")))
					.then(first)
			: null
		if (!geoPlace) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: { fieldErrors: { geoPlaceId: ["Selecciona un lugar activo."] } },
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		const compatibilityError = geoPlaceCompatibilityError({
			productType: owned.productType,
			placeType: geoPlace.placeType,
		})
		if (compatibilityError) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: { fieldErrors: { geoPlaceId: [compatibilityError] } },
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		await productRepository.setProductGeoPlace({
			productId: raw.productId,
			geoPlaceId: raw.geoPlaceId,
			actorId: user.id ?? null,
			source: "product.location.update",
		})

		const result = await upsertProductLocation(
			{ repo: productRepository },
			{
				productId: raw.productId,
				address: raw.address || null,
				lat: raw.lat,
				lng: raw.lng,
			}
		)
		await invalidateProduct(raw.productId)
		await refreshProductPreparationSnapshotAfterMutation({
			productId: raw.productId,
			providerId,
			request,
			source: "product.location",
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
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
