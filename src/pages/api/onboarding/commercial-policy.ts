import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import { diagnoseCommercialPolicy } from "@/lib/commercial-policy/read"
import {
	and,
	db,
	eq,
	first,
	GeoPlace,
	Product,
	ProductGeoPlace,
	ProviderDocument,
} from "@/shared/infrastructure/db/compat"

function json(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** Read-only shadow diagnosis. Live authorization remains in provider-governance. */
export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const providerId = user ? await getProviderIdFromRequest(request, user) : null
	if (!user?.id || !providerId) return json({ error: "Unauthorized" }, 401)
	const url = new URL(request.url)
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId) return json({ error: "productId_required" }, 400)
	const product = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
		.then(first)
	if (!product) return json({ error: "Not found" }, 404)
	const vertical = String(product.productType).toLowerCase()
	if (vertical !== "hotel" && vertical !== "tour" && vertical !== "whole_home") {
		return json({ error: "vertical_unsupported" }, 422)
	}
	const holder = await readProviderHolderProfile(providerId)
	if (!holder)
		return json({ error: "holder_declaration_missing", action: "/provider/settings/profile" }, 422)
	const place = await db
		.select({ countryCode: GeoPlace.countryCode })
		.from(ProductGeoPlace)
		.innerJoin(GeoPlace, eq(ProductGeoPlace.placeId, GeoPlace.id))
		.where(and(eq(ProductGeoPlace.productId, productId), eq(ProductGeoPlace.isPrimary, true)))
		.then(first)
	if (!place) return json({ error: "product_location_missing" }, 422)
	const verifiedDocuments = await db
		.select({ type: ProviderDocument.type })
		.from(ProviderDocument)
		.where(
			and(eq(ProviderDocument.providerId, providerId), eq(ProviderDocument.status, "verified"))
		)
	try {
		const diagnosis = await diagnoseCommercialPolicy({
			context: {
				holderType: holder.holderType as "persona_natural" | "entidad",
				holderCountry: holder.holderCountry,
				taxCountry: holder.taxResidenceCountry,
				payoutCountry: holder.payoutCountry,
				productCountry: place.countryCode,
				vertical: vertical as "hotel" | "tour" | "whole_home",
				collectionModel: holder.collectionModel as
					| "undecided"
					| "property_collect"
					| "platform_collect",
			},
			verifiedEvidence: verifiedDocuments.map((row) => row.type),
		})
		return json({ ...diagnosis, mode: "shadow", productId })
	} catch (error) {
		console.error("commercial_policy_diagnosis_failed", {
			productId,
			error: error instanceof Error ? error.message : String(error),
		})
		return json({ error: "policy_storage_unavailable" }, 503)
	}
}
