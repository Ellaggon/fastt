import type { APIRoute } from "astro"
import { r2 } from "@/container"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { PutObjectCommand } from "@aws-sdk/client-s3"

function getExtFromName(name: string) {
	const dot = name.lastIndexOf(".")
	return dot >= 0 ? name.slice(dot + 1).toLocaleLowerCase() : ""
}

export const POST: APIRoute = async ({ request }) => {
	try {
		if (!process.env.R2_BUCKET_NAME) {
			return new Response(JSON.stringify({ error: "R2_BUCKET_NAME is not defined" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}

		const formData = await request.formData()
		const files = (formData.getAll("file") as File[]) || null
		const prefix = String(formData.get("prefix") || "uploads")

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

				const publicUrl = `https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev/${key}`
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
