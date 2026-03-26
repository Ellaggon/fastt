import type { APIRoute } from "astro"
import { HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

import { r2, productImageRepository, productRepository, imageUploadRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"

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
		const imageId = String(form.get("imageId") ?? "").trim()
		const objectKey = String(form.get("objectKey") ?? "").trim()

		if (!productId || !imageId || !objectKey) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ message: "productId, imageId and objectKey are required" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		// Ownership
		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		// Key must be scoped to this product.
		if (!objectKey.startsWith(`products/${productId}/`)) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["objectKey"], message: "Invalid objectKey scope" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		// Validate against pending upload record (prevents tampering).
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
		if (upload.status === "completed") {
			return new Response(
				JSON.stringify({ ok: true, imageId, objectKey: upload.objectKey, verified: true }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (
			String(upload.productId) !== String(productId) ||
			String(upload.objectKey) !== String(objectKey)
		) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ message: "Upload record mismatch" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		// Verify object exists (HEAD) before writing DB.
		let head: any
		try {
			head = await r2.send(
				new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: objectKey })
			)
		} catch {
			console.log(
				JSON.stringify({
					action: "upload_complete",
					productId,
					imageId,
					objectKey,
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

		// Integrity: validate content-type and size if available.
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
		if (upload.expectedContentType && ct !== upload.expectedContentType) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["ContentType"], message: "ContentType mismatch" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		const len = typeof head?.ContentLength === "number" ? head.ContentLength : null
		if (
			typeof upload.expectedBytes === "number" &&
			typeof len === "number" &&
			len !== upload.expectedBytes
		) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["ContentLength"], message: "ContentLength mismatch" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		// Idempotency: if already inserted, just return OK.
		const existing = await productImageRepository.listByProduct(productId)
		const found = existing.find((r: any) => String(r.id) === imageId)
		if (found) {
			await imageUploadRepository.markCompleted(imageId)
			return new Response(JSON.stringify({ ok: true, imageId, objectKey, verified: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}

		const base = (
			process.env.R2_PUBLIC_BASE_URL || "https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev"
		).replace(/\/+$/, "")
		const publicUrl = `${base}/${objectKey}`

		// Append at end by default; ordering will be finalized by the image-set endpoint.
		const order = existing.length

		try {
			await productImageRepository.insertImage({
				id: imageId,
				productId,
				objectKey,
				url: publicUrl,
				order,
				isPrimary: false,
			})
			await imageUploadRepository.markCompleted(imageId)
		} catch (err) {
			// Compensation: if DB insert fails after successful upload, delete the object to avoid orphans.
			try {
				await r2.send(
					new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: objectKey })
				)
			} catch {
				// swallow; caller sees DB error below
			}
			try {
				await imageUploadRepository.deleteById(imageId)
			} catch {}
			throw err
		}

		console.log(
			JSON.stringify({ action: "upload_complete", productId, imageId, objectKey, ok: true })
		)
		return new Response(
			JSON.stringify({
				ok: true,
				imageId,
				objectKey,
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
