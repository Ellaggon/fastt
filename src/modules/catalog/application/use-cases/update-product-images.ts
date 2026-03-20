import { r2 } from "@/lib/upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { ProductImageRepositoryPort } from "../ports/ProductImageRepositoryPort"

export async function updateProductImages(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	repo: ProductImageRepositoryPort
	providerId: string
	productId: string
	images: { id?: string; url: string; isPrimary?: boolean }[]
}): Promise<Response> {
	const { ensureOwned, repo, providerId, productId, images } = params

	// ownership
	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Not found or not owned" }), { status: 403 })
	}

	// fetch existing images
	const existing = await repo.listByProduct(productId)

	// determine deletion (existing rows that are not present in incoming images by id)
	const incomingIds = new Set(images.filter((i) => i.id).map((i) => i.id!))
	const toDelete = existing.filter((e) => !incomingIds.has((e as any).id))

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
			const match = existing.find((e) => (e as any).id === img.id) as any
			if (match && match.url !== img.url) {
				updates.url = img.url
			}
			try {
				await repo.updateImage(img.id, updates)
			} catch (e) {
				console.error("Failed to update Image row", e)
			}
		} else {
			// insert new row
			try {
				await repo.insertImage({
					productId,
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
	for (const row of toDelete as any[]) {
		try {
			await repo.deleteImage(row.id)
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
	const updated = await repo.listOrderedByProduct(productId)
	return new Response(JSON.stringify({ ok: true, images: updated }), { status: 200 })
}
