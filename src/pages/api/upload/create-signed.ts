import type { APIRoute } from "astro"
import { r2 } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { PutObjectCommand } from "@aws-sdk/client-s3"

function getExtFromName(name: string) {
	const dot = name.lastIndexOf(".")
	return dot >= 0 ? name.slice(dot + 1).toLocaleLowerCase() : ""
}

export const POST: APIRoute = async ({ request }) => {
	try {
		// Security hardening: require authentication and provider context.
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

		const formData = await request.formData()
		const files = (formData.getAll("file") as File[]) || null
		const prefix = String(formData.get("prefix") || "uploads")

		// Minimal guard: prevent arbitrary prefixes.
		const allowedPrefixes = new Set(["products", "rooms", "uploads"])
		if (!allowedPrefixes.has(prefix)) {
			return new Response(JSON.stringify({ error: "Invalid prefix" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (!files || files.length === 0) {
			return new Response(JSON.stringify({ error: "No file provided" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		// Validación de content-type
		for (const f of files) {
			if (!f.type.startsWith("image/")) {
				return new Response(JSON.stringify({ error: "Only image files are allowed" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				})
			}
		}

		// Creamos una URL firmada por archivo
		const entries = await Promise.all(
			files.map(async (file) => {
				const uuid = crypto.randomUUID()
				const ext = getExtFromName(file.name) || "bin"
				const key = `${prefix}/${uuid}.${ext}`

				const signedUrl = await getSignedUrl(
					r2,
					new PutObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME,
						Key: key,
						ContentType: file.type,
					}),
					{ expiresIn: 60 }
				)

				const base = (
					process.env.R2_PUBLIC_BASE_URL || "https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev"
				).replace(/\/+$/, "")
				const publicUrl = `${base}/${key}`
				return { key, signedUrl, publicUrl }
			})
		)
		return new Response(JSON.stringify({ urls: entries }), {
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		console.error("Error generating signed Urls", e)
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
