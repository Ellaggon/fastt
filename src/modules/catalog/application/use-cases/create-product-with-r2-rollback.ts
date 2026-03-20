import { r2 } from "@/lib/upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

export async function createProductWithR2Rollback(params: {
	createProduct: (params: {
		id: string
		name: string
		description: string | null
		productType: string
		providerId: string | null
		destinationId: string
		images: string[]
	}) => Promise<{ id: string }>
	id: string
	providerId: string
	name: string
	productType: "Hotel" | "Tour" | "Package"
	description?: string
	destinationId: string
	images: string[]
}): Promise<Response> {
	const { createProduct, id, providerId, name, productType, description, destinationId, images } =
		params

	try {
		await createProduct({
			id,
			name,
			description: description || null,
			productType,
			providerId: providerId || null,
			destinationId,
			images,
		})

		return new Response(JSON.stringify({ id }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		// ROLLBACK: borrar las imágenes en R2 si DB falla
		console.error("DB insert failed, cleaning up R2…", e)

		for (const publicUrl of images) {
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
}
