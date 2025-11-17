import type { APIRoute } from "astro"
import { z } from "zod"
import { db, Product, Image, NOW } from "astro:db"
import { getSession } from "auth-astro/server"
import { r2 } from "@/lib/upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

const serverSchema = z.object({
	providerId: z.string().min(1),
	name: z.string().min(3).max(120),
	productType: z.enum(["Hotel", "Tour", "Package"]),
	description: z.string().optional().or(z.literal("")),
	destinationId: z.string().min(1),
	basePriceUSD: z.coerce.number().min(0).optional(),
	basePriceBOB: z.coerce.number().min(0).optional(),
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
			basePriceUSD: formData.get("basePriceUSD") ? Number(formData.get("basePriceUSD")) : undefined,
			basePriceBOB: formData.get("basePriceBOB") ? Number(formData.get("basePriceBOB")) : undefined,
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
			// 1 Insertar producto
			await db.insert(Product).values({
				id,
				name: parsed.data.name,
				description: parsed.data.description || null,
				productType: parsed.data.productType,
				creationDate: NOW,
				lastUpdated: NOW,
				providerId: parsed.data.providerId || null,
				destinationId: parsed.data.destinationId,
				isActive: true,
				basePriceUSD: parsed.data.basePriceUSD ?? null,
				basePriceBOB: parsed.data.basePriceBOB ?? null,
			})

			// 2 Guardar imágenes en la tabla Image
			for (let i = 0; i < parsed.data.images.length; i++) {
				const url = parsed.data.images[i]
				await db.insert(Image).values({
					id: crypto.randomUUID(),
					entityId: id,
					entityType: "Product",
					url,
					order: i,
					isPrimary: i === 0,
				})
			}
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
