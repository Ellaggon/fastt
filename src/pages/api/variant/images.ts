import type { APIRoute } from "astro"
import { and, asc, db, eq, Image, inArray } from "astro:db"

import { productRepository, variantManagementRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ensureObjectKey } from "@/lib/images/objectKey"

function normalizeUrls(values: FormDataEntryValue[]): string[] {
	const seen = new Set<string>()
	const ordered: string[] = []
	for (const value of values) {
		const url = String(value ?? "").trim()
		if (!url) continue
		if (seen.has(url)) continue
		seen.add(url)
		ordered.push(url)
	}
	return ordered
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
		const variantId = String(form.get("variantId") ?? "").trim()
		if (!variantId) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["variantId"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		const incomingUrls = normalizeUrls(form.getAll("imageUrl"))
		const incomingObjectKeys = form
			.getAll("imageObjectKey")
			.map((value) => String(value ?? "").trim())

		const variant = await variantManagementRepository.getVariantById(variantId)
		if (!variant) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const existing = await db
			.select({
				id: Image.id,
				url: Image.url,
			})
			.from(Image)
			.where(and(inArray(Image.entityType, ["variant", "Variant"]), eq(Image.entityId, variantId)))
			.all()
		const existingByUrl = new Map(existing.map((row) => [String(row.url), String(row.id)]))
		const incomingSet = new Set(incomingUrls)

		for (const row of existing) {
			const url = String(row.url)
			if (!incomingSet.has(url)) {
				await db.delete(Image).where(eq(Image.id, String(row.id)))
			}
		}

		for (const [index, url] of incomingUrls.entries()) {
			const maybeObjectKey = incomingObjectKeys[index] ?? null
			const normalizedObjectKey = ensureObjectKey({
				objectKey: maybeObjectKey,
				url,
				context: "variant.images",
				imageId: existingByUrl.get(url) ?? `new-${index}`,
			})
			if (!normalizedObjectKey) {
				return new Response(
					JSON.stringify({
						error: "validation_error",
						details: [
							{ path: ["imageObjectKey"], message: `Missing objectKey for url index ${index}` },
						],
					}),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				)
			}
			const imageId = existingByUrl.get(url)
			if (imageId) {
				await db
					.update(Image)
					.set({
						order: index,
						isPrimary: index === 0,
						entityType: "variant",
						entityId: variantId,
						objectKey: normalizedObjectKey,
						url,
					})
					.where(eq(Image.id, imageId))
				continue
			}

			await db.insert(Image).values({
				id: crypto.randomUUID(),
				entityType: "variant",
				entityId: variantId,
				objectKey: normalizedObjectKey,
				url,
				altText: null,
				order: index,
				isPrimary: index === 0,
			})
		}

		const images = await db
			.select({
				id: Image.id,
				url: Image.url,
				objectKey: Image.objectKey,
				order: Image.order,
				isPrimary: Image.isPrimary,
			})
			.from(Image)
			.where(and(inArray(Image.entityType, ["variant", "Variant"]), eq(Image.entityId, variantId)))
			.orderBy(asc(Image.order), asc(Image.id))
			.all()

		return new Response(JSON.stringify({ ok: true, images }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
