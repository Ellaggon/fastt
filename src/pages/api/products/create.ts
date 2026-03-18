import type { APIRoute } from "astro"
import { z } from "zod"
import { getSession } from "auth-astro/server"
import { r2 } from "@/lib/upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { createProductUseCase } from "@/container"

const serverSchema = z.object({
	providerId: z.string().min(1),
	name: z.string().min(3).max(120),
	productType: z.enum(["Hotel", "Tour", "Package"]),
	description: z.string().optional().or(z.literal("")),
	destinationId: z.string().min(1),
	images: z.array(z.string().url()).min(1), // publicUrls
})

export const POST: APIRoute = async ({ request }) => {
	const session = await getSession(request)
	const email = session?.user?.email

	if (!email) {
		return new Response(JSON.stringify({ error: "User not authenticated" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	try {
		const formData = await request.formData()
		const payload = {
			providerId: String(formData.get("providerId") || ""),
			name: String(formData.get("name") || ""),
			productType: String(formData.get("productType") || ""),
			description: String(formData.get("description") || ""),
			destinationId: String(formData.get("destinationId") || ""),
			images: JSON.parse(String(formData.get("images") || "[]")) as string[],
		}

		const parsed = serverSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const id = crypto.randomUUID()

		try {
			await createProductUseCase({
				id,
				name: parsed.data.name,
				description: parsed.data.description || null,
				productType: parsed.data.productType,
				providerId: parsed.data.providerId || null,
				destinationId: parsed.data.destinationId,
				images: parsed.data.images,
			})
			return new Response(JSON.stringify({ id }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		} catch (e) {
			// ROLLBACK: borrar las imágenes en R2 si DB falla
			console.error("DB insert failed, cleaning up R2…", e)

			for (const publicUrl of parsed.data.images) {
				try {
					const key = new URL(publicUrl).pathname.replace(/^\//, "")
					await r2.send(
						new DeleteObjectCommand({
							Bucket: process.env.R2_BUCKET_NAME!,
							Key: key,
						})
					)
					console.log("Rollback: deleted", key)
				} catch (e) {
					console.error("Rollback failed to delete key:", e)
				}
			}
			return new Response(JSON.stringify({ error: "DB error, rollback executed" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	} catch (e) {
		console.error("Error creando producto:", e)

		return new Response(JSON.stringify({ error: "Server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
