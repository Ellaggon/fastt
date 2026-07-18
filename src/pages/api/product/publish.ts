import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { refreshProductPreparationSnapshotAfterMutation } from "@/lib/playbook/summarize-product-preparation"
import { publishProduct } from "@/modules/catalog/public"

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

		const form = await request.formData()
		const productId = String(form.get("productId") ?? "").trim()
		if (!productId) {
			return new Response(JSON.stringify({ error: "productId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await publishProduct({ repo: productRepository }, { productId })

		if (!result.ok) {
			return new Response(JSON.stringify(result), {
				status: 422,
				headers: { "Content-Type": "application/json" },
			})
		}
		await refreshProductPreparationSnapshotAfterMutation({
			productId,
			providerId,
			request,
			source: "product.publish",
		})

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof Error && e.message.includes("Product not found")) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
