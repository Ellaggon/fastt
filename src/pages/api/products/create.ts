import type { APIRoute } from "astro"
import { z } from "zod"
import { getSession } from "auth-astro/server"
import { createProductUseCase } from "@/container"
import { createProductWithR2Rollback } from "@/modules/catalog/public"

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
		return createProductWithR2Rollback({
			createProduct: createProductUseCase,
			id,
			providerId: parsed.data.providerId,
			name: parsed.data.name,
			productType: parsed.data.productType,
			description: parsed.data.description,
			destinationId: parsed.data.destinationId,
			images: parsed.data.images,
		})
	} catch (e) {
		console.error("Error creando producto:", e)

		return new Response(JSON.stringify({ error: "Server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
