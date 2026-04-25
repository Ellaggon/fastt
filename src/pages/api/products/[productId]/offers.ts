import type { APIRoute } from "astro"
import { and, asc, db, eq, Image, inArray } from "astro:db"
import { z, ZodError } from "zod"

import { searchOffers } from "@/container"
import { ensureObjectKey } from "@/lib/images/objectKey"
import { logger } from "@/lib/observability/logger"

const schema = z.object({
	productId: z.string().min(1),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	currency: z.string().trim().length(3).optional(),
	adults: z.coerce.number().int().min(0).optional(),
	children: z.coerce.number().int().min(0).optional(),
	rooms: z.coerce.number().int().min(1).optional(),
})

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const url = new URL(request.url)
		const featureContext = {
			request,
			query: url.searchParams,
		}

		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse({
			...body,
			productId: String(params.productId ?? body.productId ?? "").trim(),
		})
		const occupancy = {
			adults: parsed.adults ?? 2,
			children: parsed.children ?? 0,
			rooms: parsed.rooms ?? 1,
		}

		const offers = await searchOffers({
			productId: parsed.productId,
			checkIn: new Date(parsed.checkIn),
			checkOut: new Date(parsed.checkOut),
			adults: occupancy.adults,
			children: occupancy.children,
			rooms: occupancy.rooms,
			currency:
				String(parsed.currency ?? url.searchParams.get("currency") ?? "")
					.trim()
					.toUpperCase() || undefined,
			featureContext,
		})

		const nights = Math.max(
			0,
			Math.ceil(
				(new Date(parsed.checkOut).getTime() - new Date(parsed.checkIn).getTime()) / 86400000
			)
		)
		const variantIds = Array.from(
			new Set(
				offers.map((offer) => String((offer as any).variantId ?? "")).filter((id) => id.length > 0)
			)
		)
		const [productImageRows, variantImageRows] = await Promise.all([
			db
				.select({
					id: Image.id,
					url: Image.url,
					objectKey: Image.objectKey,
					isPrimary: Image.isPrimary,
					order: Image.order,
				})
				.from(Image)
				.where(
					and(
						inArray(Image.entityType, ["product", "Product"]),
						eq(Image.entityId, parsed.productId)
					)
				)
				.orderBy(asc(Image.order))
				.all(),
			variantIds.length > 0
				? db
						.select({
							id: Image.id,
							entityId: Image.entityId,
							url: Image.url,
							objectKey: Image.objectKey,
							isPrimary: Image.isPrimary,
							order: Image.order,
						})
						.from(Image)
						.where(
							and(
								inArray(Image.entityType, ["variant", "Variant"]),
								inArray(Image.entityId, variantIds)
							)
						)
						.orderBy(asc(Image.order))
						.all()
				: Promise.resolve([] as any[]),
		])

		const productImages = productImageRows.map((image) => ({
			id: String(image.id),
			url: String(image.url),
			objectKey:
				ensureObjectKey({
					objectKey: image.objectKey ? String(image.objectKey) : null,
					url: String(image.url),
					context: "offers.product",
					imageId: String(image.id),
				}) ?? "",
			isPrimary: Boolean(image.isPrimary),
			order: Number(image.order ?? 0),
		}))
		const variantImagesByVariantId = new Map<
			string,
			Array<{
				id: string
				url: string
				objectKey: string
				isPrimary: boolean
				order: number
			}>
		>()
		for (const image of variantImageRows) {
			const variantId = String(image.entityId ?? "")
			if (!variantId) continue
			const images = variantImagesByVariantId.get(variantId) ?? []
			images.push({
				id: String(image.id),
				url: String(image.url),
				objectKey:
					ensureObjectKey({
						objectKey: image.objectKey ? String(image.objectKey) : null,
						url: String(image.url),
						context: "offers.variant",
						imageId: String(image.id),
					}) ?? "",
				isPrimary: Boolean(image.isPrimary),
				order: Number(image.order ?? 0),
			})
			variantImagesByVariantId.set(variantId, images)
		}

		const normalizedOffers = offers.map((offer) => {
			const effectiveTotal = Number(
				offer?.ratePlans?.[0]?.totalPrice ?? offer?.ratePlans?.[0]?.finalPrice ?? NaN
			)
			const sellable = Number.isFinite(effectiveTotal)
			const availabilitySummary = sellable
				? {
						sellable: true,
						totalPrice: effectiveTotal,
						nights,
					}
				: {
						sellable: false,
						totalPrice: null,
						nights,
					}

			return {
				...offer,
				productImages,
				variantImages: variantImagesByVariantId.get(String((offer as any).variantId ?? "")) ?? [],
				availabilitySummary,
				occupancy,
			}
		})

		logger.debug("offers.variant_images_payload", {
			productId: parsed.productId,
			offers: normalizedOffers.map((offer: any) => ({
				variantId: String(offer?.variantId ?? ""),
				variantImagesCount: Array.isArray(offer?.variantImages) ? offer.variantImages.length : 0,
			})),
		})

		return new Response(JSON.stringify({ offers: normalizedOffers }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e: any) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(JSON.stringify({ error: "internal_error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
