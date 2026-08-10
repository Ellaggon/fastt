import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { refreshProductPreparationSnapshotAfterMutation } from "@/lib/playbook/summarize-product-preparation"
import { createProduct } from "@/modules/catalog/public"
import { productRepository } from "@/container"
import { db, Destination, eq, first } from "@/shared/infrastructure/db/compat"

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
		const raw = {
			name: String(form.get("name") ?? ""),
			productType: String(form.get("productType") ?? ""),
			destinationId: String(form.get("destinationId") ?? ""),
		}
		const playbook = String(form.get("playbook") ?? "").trim()
		const wantsJson = String(form.get("_response") ?? "").trim() !== "redirect"
		const destination = raw.destinationId
			? await db
					.select({ id: Destination.id })
					.from(Destination)
					.where(eq(Destination.id, raw.destinationId))
					.then(first)
			: null
		if (!destination) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: { fieldErrors: { destinationId: ["Selecciona un destino válido."] } },
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const id = crypto.randomUUID()
		const result = await createProduct(
			{ repo: productRepository },
			{
				id,
				providerId,
				name: raw.name,
				productType: raw.productType,
				destinationId: raw.destinationId,
			}
		)
		await refreshProductPreparationSnapshotAfterMutation({
			productId: id,
			providerId,
			request,
			source: "product.create",
		})
		await invalidateProvider(providerId)

		if (!wantsJson) {
			const params = new URLSearchParams({ step: "content", flow: "create" })
			if (playbook === "launch-tour") params.set("playbook", "launch-tour")
			else if (playbook === "launch" || playbook === "launch-accommodation") {
				params.set("playbook", "launch")
			}
			const nextPath = playbook
				? `/product/${encodeURIComponent(id)}/content?${params.toString()}`
				: `/product/${encodeURIComponent(id)}`
			return new Response(null, {
				status: 303,
				headers: { Location: nextPath },
			})
		}

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
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
