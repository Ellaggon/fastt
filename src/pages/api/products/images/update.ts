// src/pages/api/products/images/update.ts
import type { APIRoute } from "astro"
import { z } from "zod"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { ensureProductOwnedByProvider } from "@/lib/db/product"
import { db, Image, eq, asc } from "astro:db"
import { r2 } from "@/lib/upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

const schema = z.object({
	productId: z.string().min(1),
	images: z
		.array(
			z.object({
				id: z.string().optional(),
				url: z.string().url(),
				isPrimary: z.boolean().optional(),
			})
		)
		.min(0),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}

		const body = await request.json()
		const parsed = schema.safeParse(body)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}

		const { productId, images } = parsed.data

		// ownership
		const product = await ensureProductOwnedByProvider(productId, providerId)
		if (!product) {
			return new Response(JSON.stringify({ error: "Not found or not owned" }), { status: 403 })
		}

		// fetch existing images
		const existing = await db.select().from(Image).where(eq(Image.entityId, productId)).all()

		// determine deletion (existing rows that are not present in incoming images by id)
		const incomingIds = new Set(images.filter((i) => i.id).map((i) => i.id!))
		const toDelete = existing.filter((e) => !incomingIds.has(e.id))

		// enforce single primary: if none incoming flagged, set first as primary
		if (!images.some((i) => i.isPrimary) && images.length > 0) {
			images[0].isPrimary = true
		}

		// update existing ones (order, isPrimary, maybe url) and insert new ones
		for (let i = 0; i < images.length; i++) {
			const img = images[i]
			if (img.id) {
				// update order + isPrimary (and url if changed)
				const updates: Record<string, any> = { order: i, isPrimary: !!img.isPrimary }
				const match = existing.find((e) => e.id === img.id)
				if (match && match.url !== img.url) {
					updates.url = img.url
				}
				try {
					await db.update(Image).set(updates).where(eq(Image.id, img.id))
				} catch (e) {
					console.error("Failed to update Image row", e)
				}
			} else {
				// insert new row
				try {
					await db.insert(Image).values({
						id: crypto.randomUUID(),
						entityId: productId,
						entityType: "Product",
						url: img.url,
						order: i,
						isPrimary: !!img.isPrimary,
					})
				} catch (e) {
					console.error("Failed to insert Image row", e)
				}
			}
		}

		// delete rows for removed images (and schedule R2 deletion)
		const r2KeysToDelete: string[] = []
		for (const row of toDelete) {
			try {
				await db.delete(Image).where(eq(Image.id, row.id))
				if (row.url) {
					try {
						const key = new URL(row.url).pathname.replace(/^\/+/, "")
						r2KeysToDelete.push(key)
					} catch (err) {
						console.warn("Could not parse r2 key from url:", row.url)
					}
				}
			} catch (e) {
				console.error("Failed to delete image row:", e)
			}
		}

		// Best-effort delete R2 objects
		for (const key of r2KeysToDelete) {
			try {
				await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }))
				console.log("R2 deleted:", key)
			} catch (e) {
				console.error("R2 deletion failed for key:", key, e)
			}
		}

		// return updated list
		const updated = await db
			.select()
			.from(Image)
			.where(eq(Image.entityId, productId))
			.orderBy(asc(Image.order))
			.all()
		return new Response(JSON.stringify({ ok: true, images: updated }), { status: 200 })
	} catch (err) {
		console.error("images update error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
