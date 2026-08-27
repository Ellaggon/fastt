import type { APIRoute } from "astro"
import {
	and,
	db,
	eq,
	Image,
	ImageUpload,
	ProductImage,
	VariantImage,
} from "@/shared/infrastructure/db/compat"
import { HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

import {
	r2,
	productImageRepository,
	productRepository,
	imageUploadRepository,
	variantManagementRepository,
} from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { ensureObjectKey } from "@/lib/images/objectKey"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"

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

		if (!process.env.R2_BUCKET_NAME) {
			return new Response(JSON.stringify({ error: "R2_BUCKET_NAME is not defined" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const productId = String(form.get("productId") ?? "").trim()
		const target = String(form.get("target") ?? "product").trim()
		const targetId = String(form.get("targetId") ?? "").trim()
		const imageId = String(form.get("imageId") ?? "").trim()
		const objectKeyRaw = String(form.get("objectKey") ?? "").trim()
		if (!imageId || !objectKeyRaw) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ message: "imageId and objectKey are required" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		if (target !== "product" && target !== "variant") {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["target"], message: "target must be product or variant" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		let owningProductId = productId

		if (target === "variant") {
			if (!targetId) {
				return new Response(
					JSON.stringify({
						error: "validation_error",
						details: [{ path: ["targetId"], message: "targetId is required for variant images" }],
					}),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				)
			}
			const variant = await variantManagementRepository.getVariantById(targetId)
			if (!variant) {
				return new Response(JSON.stringify({ error: "Not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				})
			}
			owningProductId = String(variant.productId)
		} else {
			if (!owningProductId) {
				return new Response(
					JSON.stringify({
						error: "validation_error",
						details: [{ path: ["productId"], message: "productId is required for product images" }],
					}),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				)
			}
		}

		const owned = await productRepository.ensureProductOwnedByProvider(owningProductId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (!objectKeyRaw.startsWith(`products/${owningProductId}/`)) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["objectKey"], message: "Invalid objectKey scope" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const upload = await imageUploadRepository.getById(imageId)
		if (!upload) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["imageId"], message: "Unknown imageId" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		// Linking is imageId-driven. product/provider metadata is not used for linkage.
		if (String(upload.objectKey) !== objectKeyRaw) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ message: "Upload record mismatch by imageId/objectKey" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		if (String(upload.imageId ?? "") !== imageId) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ message: "Upload record mismatch by imageId" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		let head: any
		try {
			head = await r2.send(
				new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: objectKeyRaw })
			)
		} catch {
			console.log(
				JSON.stringify({
					action: "upload_complete",
					productId,
					imageId,
					objectKey: objectKeyRaw,
					ok: false,
					reason: "missing_object",
				})
			)
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["objectKey"], message: "Object not found in storage" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const ct = typeof head?.ContentType === "string" ? head.ContentType : null
		if (!ct || !ct.startsWith("image/")) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["ContentType"], message: "Invalid stored content-type" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const base = (
			process.env.R2_PUBLIC_BASE_URL || "https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev"
		).replace(/\/+$/, "")
		const publicUrl = `${base}/${objectKeyRaw}`
		const normalizedObjectKey = ensureObjectKey({
			objectKey: objectKeyRaw,
			url: publicUrl,
			context: "uploads.complete",
			imageId,
		})
		if (!normalizedObjectKey) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["objectKey"], message: "Missing objectKey for image" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const existingProductImages =
			target === "product" ? await productImageRepository.listByProduct(owningProductId) : []
		const order = existingProductImages.length
		const variantHasImages =
			target === "variant"
				? await db
						.select({ imageId: VariantImage.imageId })
						.from(VariantImage)
						.where(eq(VariantImage.variantId, targetId))
						.limit(1)
						.then((rows) => rows.length > 0)
				: false
		const isPrimary = target === "product" ? order === 0 : !variantHasImages
		try {
			await db.transaction(async (tx) => {
				await tx
					.update(Image)
					.set({ objectKey: normalizedObjectKey, url: publicUrl })
					.where(eq(Image.id, imageId))
				if (target === "product") {
					await tx
						.insert(ProductImage)
						.values({
							productId: owningProductId,
							imageId,
							sortOrder: order,
							isPrimary,
						})
						.onConflictDoNothing()
				} else {
					await tx
						.insert(VariantImage)
						.values({
							variantId: targetId,
							imageId,
							sortOrder: 0,
							isPrimary,
						})
						.onConflictDoNothing()
				}
				await tx
					.update(ImageUpload)
					.set({ status: "completed", completedAt: new Date(), objectKey: normalizedObjectKey })
					.where(eq(ImageUpload.id, imageId))
			})
		} catch (err) {
			// Compensation: if DB write fails after upload, clean the storage object.
			try {
				await r2.send(
					new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: objectKeyRaw })
				)
			} catch {}
			throw err
		}

		console.log(
			JSON.stringify({
				action: "upload_complete",
				productId: owningProductId,
				target,
				targetId: target === "product" ? owningProductId : targetId,
				imageId,
				objectKey: normalizedObjectKey,
				ok: true,
			})
		)
		await refreshProductOperationalSurfaceAfterMutation({
			productId: owningProductId,
			providerId,
			request,
			source: "uploads.complete",
		})
		return new Response(
			JSON.stringify({
				ok: true,
				imageId,
				objectKey: normalizedObjectKey,
				verified: true,
				etag: (head as any)?.ETag ?? null,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (e) {
		console.log(JSON.stringify({ action: "upload_complete", ok: false, error: String(e) }))
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
