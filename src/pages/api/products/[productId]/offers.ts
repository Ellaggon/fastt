import type { APIRoute } from "astro"
import { and, asc, db, eq, Image, inArray } from "astro:db"
import { z, ZodError } from "zod"

import { inventoryHoldRepository, searchOffers, variantManagementRepository } from "@/container"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { ensureObjectKey } from "@/lib/images/objectKey"
import { getAvailabilityAggregate } from "@/modules/catalog/public"
import { releaseExpiredHolds } from "@/modules/inventory/public"

const schema = z.object({
	productId: z.string().min(1),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	adults: z.coerce.number().int().min(0).optional(),
	children: z.coerce.number().int().min(0).optional(),
	rooms: z.coerce.number().int().min(1).optional(),
})

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse({
			...body,
			productId: String(params.productId ?? body.productId ?? "").trim(),
		})

		const offers = await searchOffers({
			productId: parsed.productId,
			checkIn: new Date(parsed.checkIn),
			checkOut: new Date(parsed.checkOut),
			adults: parsed.adults ?? 2,
			children: parsed.children ?? 0,
			rooms: parsed.rooms ?? 1,
		})

		const expired = await releaseExpiredHolds(
			{ repo: inventoryHoldRepository },
			{ now: new Date() }
		)
		if (expired.releasedVariantIds.length > 0) {
			await Promise.all(
				expired.releasedVariantIds.map(async (variantId) => {
					const variant = await variantManagementRepository.getVariantById(variantId)
					if (variant) {
						await invalidateVariant(variantId, variant.productId)
					}
				})
			)
		}

		const occupancy = Math.max(1, (parsed.adults ?? 2) + (parsed.children ?? 0))
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

		const withAvailability = await Promise.all(
			offers.map(async (offer) => {
				const availability = await getAvailabilityAggregate({
					variantId: offer.variantId,
					dateRange: { from: parsed.checkIn, to: parsed.checkOut },
					occupancy,
					currency: "USD",
				})
				if (!availability?.summary?.sellable || availability.summary.totalPrice == null) {
					for (const day of availability?.days ?? []) {
						if (day.price == null) {
							console.error("effective_pricing_missing_blocking", {
								variantId: offer.variantId,
								date: day.date,
								dateRange: { from: parsed.checkIn, to: parsed.checkOut },
							})
						}
					}
					return null
				}

				const effectiveTotal = Number(availability.summary.totalPrice)

				return {
					...offer,
					ratePlans: offer.ratePlans.map((ratePlan) => ({
						...ratePlan,
						totalPrice: effectiveTotal,
					})),
					productImages,
					variantImages: variantImagesByVariantId.get(String((offer as any).variantId ?? "")) ?? [],
					availabilitySummary: availability?.summary ?? null,
				}
			})
		)
		const normalizedOffers = withAvailability.filter((offer): offer is NonNullable<typeof offer> =>
			Boolean(offer)
		)
		console.debug("variant_images_payload", {
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
