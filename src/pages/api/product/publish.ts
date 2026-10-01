import {
	loadTourCommercialContext,
	tourContextValidationResponse,
} from "@/lib/tours/loadTourCommercialContext"
import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { resolveCanonicalProductPublicationValidationErrors } from "@/lib/product/canonical-product-publication"
import { assertProviderCapability } from "@/lib/provider-governance"
import {
	assertProductCommercialCapability,
	CommercialPolicyBlockedError,
} from "@/lib/commercial-policy/enforcement"
import { assertProductLineGate, ProductLineGateBlockedError } from "@/lib/verification/line-gate"
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

		const selection = {
			variantId: String(form.get("variantId") ?? "").trim(),
			ratePlanId: String(form.get("ratePlanId") ?? "").trim(),
		}
		if (String(owned.productType).toLowerCase() === "tour") {
			const context = await loadTourCommercialContext({
				productId: productId,
				providerId,
				request,
				selection: selection.variantId || selection.ratePlanId ? selection : undefined,
			})
			const contextError = tourContextValidationResponse(context)
			if (contextError) return contextError
			if (context.status === "resolved") {
				selection.variantId = context.variantId!
				selection.ratePlanId = context.ratePlanId!
			}
		}
		// Project the same reasons/actions as preview before the independent enforcement guards.
		const tourErrors =
			String(owned.productType).toLowerCase() === "tour"
				? await resolveCanonicalProductPublicationValidationErrors({
						productId,
						providerId,
						request,
						selection,
					})
				: null
		if (tourErrors?.length)
			return new Response(
				JSON.stringify({
					ok: false,
					error: "tour_publication_blocked",
					validationErrors: tourErrors,
				}),
				{ status: 422, headers: { "Content-Type": "application/json" } }
			)
		await assertProviderCapability({
			providerId,
			currentUserId: user.id,
			capability: "publish",
		})
		await assertProductCommercialCapability({
			providerId,
			productId,
			capability: "publish",
			forceForTour: true,
		})
		await assertProductLineGate({
			providerId,
			productId,
			capability: "publish",
		})
		const result = await publishProduct(
			{
				repo: productRepository,
				resolvePublicationValidationErrors: ({ productId: targetProductId }) =>
					tourErrors
						? Promise.resolve(tourErrors)
						: resolveCanonicalProductPublicationValidationErrors({
								productId: targetProductId,
								providerId,
								request,
								selection: selection.variantId || selection.ratePlanId ? selection : undefined,
							}),
			},
			{ productId }
		)

		if (!result.ok) {
			return new Response(JSON.stringify(result), {
				status: 422,
				headers: { "Content-Type": "application/json" },
			})
		}
		await refreshProductOperationalSurfaceAfterMutation({
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
		if (e instanceof Error && e.message.startsWith("PROVIDER_CONFIGURATION_BLOCKED")) {
			return new Response(
				JSON.stringify({
					error: "provider_configuration_blocked",
					...(e as any).details,
				}),
				{
					status: 423,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof CommercialPolicyBlockedError) {
			return new Response(JSON.stringify({ error: "commercial_policy_blocked", ...e.details }), {
				status: 423,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof ProductLineGateBlockedError) {
			return new Response(JSON.stringify({ error: "product_line_gate_blocked", ...e.details }), {
				status: 423,
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
