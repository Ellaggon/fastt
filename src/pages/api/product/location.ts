import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { invalidateProduct } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import {
	geoPlaceCompatibilityError,
	upsertProductLocation,
	productLocationSchema,
	TourPresentationError,
} from "@/modules/catalog/public"
import { productRepository } from "@/container"
import { and, db, eq, first, GeoPlace } from "@/shared/infrastructure/db/compat"

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await getProviderSessionSurfaceFromRequest(request)
		if (!session?.providerId)
			return Response.json({ error: "Inicia sesión para guardar." }, { status: 401 })
		if (!session.permissions.canEditProfile)
			return Response.json({ error: "No tienes permiso para editar." }, { status: 403 })
		const providerId = session.providerId
		const user = { id: session.userId ?? null }

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
		if (![raw.lat, raw.lng].every((value) => value !== null && String(value).trim()))
			return Response.json({ error: "Selecciona la ubicación en el mapa." }, { status: 400 })
		const parsed = productLocationSchema.parse(raw)
		if (Math.abs(parsed.lat) > 90 || Math.abs(parsed.lng) > 180)
			return Response.json({ error: "La ubicación no es válida." }, { status: 400 })
		const result =
			owned.productType.toLowerCase() === "tour"
				? await productRepository.saveTourLocation({
						productId: raw.productId,
						providerId,
						actorId: user.id,
						geoPlaceId: raw.geoPlaceId,
						address: raw.address || null,
						lat: parsed.lat,
						lng: parsed.lng,
						form,
					})
				: await (async () => {
						await productRepository.setProductGeoPlace({
							productId: raw.productId,
							geoPlaceId: raw.geoPlaceId,
							actorId: user.id,
							source: "product.location.update",
						})
						return upsertProductLocation({ repo: productRepository }, raw)
					})()
		let refreshPending = false
		try {
			await invalidateProduct(raw.productId)
			await refreshProductOperationalSurfaceAfterMutation({
				productId: raw.productId,
				providerId,
				request,
				source: "product.location",
			})
		} catch (error) {
			refreshPending = true
			console.error("product.location.surface_refresh_failed", error)
		}

		return new Response(JSON.stringify({ ...result, saved: true, refreshPending }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof TourPresentationError)
			return Response.json({ error: e.message }, { status: e.status })
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
