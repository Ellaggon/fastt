import type { APIRoute } from "astro"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { r2, productRepository, productImageRepository, imageUploadRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"

function getExtFromName(name: string) {
	const dot = name.lastIndexOf(".")
	return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ""
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const MAX_IMAGES_PER_PRODUCT = 20

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
		const file = form.get("file") as File | null

		if (!productId) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["productId"], message: "productId required" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (!file) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["file"], message: "file required" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (!file.type || !file.type.startsWith("image/")) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["file"], message: "Only image files are allowed" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		// Minimal size guard (10 MiB). Keep server-side to prevent abuse.
		const maxBytes = 10 * 1024 * 1024
		if (typeof (file as any).size === "number" && (file as any).size > maxBytes) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["file"], message: "File too large" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		// Ownership: uploads are scoped to owned products only.
		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const imageId = crypto.randomUUID()
		const ext = getExtFromName(file.name) || "bin"
		const objectKey = `products/${productId}/${imageId}.${ext}`

		// Enforce bounds (existing images + pending uploads)
		const existingImages = await productImageRepository.listByProduct(productId)
		const pendingCount = await imageUploadRepository.countPendingByObjectKeyPrefix(
			`products/${productId}/`
		)
		if (existingImages.length + pendingCount >= MAX_IMAGES_PER_PRODUCT) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [
						{ path: ["images"], message: `Max ${MAX_IMAGES_PER_PRODUCT} images per product` },
					],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		await imageUploadRepository.createPending({
			id: imageId,
			imageId,
			objectKey,
		})

		const base = (
			process.env.R2_PUBLIC_BASE_URL || "https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev"
		).replace(/\/+$/, "")
		const publicUrl = `${base}/${objectKey}`

		const signedUrl = await getSignedUrl(
			r2,
			new PutObjectCommand({
				Bucket: process.env.R2_BUCKET_NAME,
				Key: objectKey,
				ContentType: file.type,
			}),
			{ expiresIn: 60 }
		)

		console.log(JSON.stringify({ action: "upload_init", productId, imageId, objectKey, ok: true }))
		return new Response(JSON.stringify({ imageId, objectKey, signedUrl, publicUrl }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		console.log(JSON.stringify({ action: "upload_init", ok: false, error: String(e) }))
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
