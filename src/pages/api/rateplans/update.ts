import type { APIRoute } from "astro"
import { ratePlanCommandRepository, variantManagementRepository } from "@/container"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { buildCreateRatePlanSpec } from "@/modules/pricing/public"
import { randomUUID } from "node:crypto"

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = (await request.json()) as {
			id?: string
			variantId?: string
			isActive?: boolean
			name?: string
			description?: string | null
			paymentType?: string
			refundable?: boolean
			cancellationPolicyId?: string | null
			type?: string
			value?: number
			minNights?: number
			maxNights?: number
			minAdvanceDays?: number
			maxAdvanceDays?: number
		}
		if (!body?.id) {
			return new Response(JSON.stringify({ error: "Missing ratePlanId" }), { status: 400 })
		}
		const type = String(body.type ?? "")
		const allowedTypes = new Set([
			"percentage_discount",
			"percentage_markup",
			"fixed_adjustment",
			"override",
			"package",
		])
		if (!allowedTypes.has(type)) {
			return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 })
		}
		const specResult = buildCreateRatePlanSpec({
			minNights: body.minNights,
			maxNights: body.maxNights,
			minAdvanceDays: body.minAdvanceDays,
			maxAdvanceDays: body.maxAdvanceDays,
			type,
			value: body.value,
		})
		if (!specResult.ok) {
			return new Response(JSON.stringify({ error: specResult.error.message }), { status: 400 })
		}
		const priceRule =
			type === "package"
				? null
				: {
						id: randomUUID(),
						ratePlanId: body.id,
						name: body.name ?? null,
						type,
						value: Number(body.value),
						priority: 10,
						isActive: true,
						createdAt: new Date(),
					}
		const result = await ratePlanCommandRepository.updateRatePlan({
			ratePlanId: body.id,
			isActive: Boolean(body.isActive),
			template: {
				name: String(body.name ?? ""),
				description: body.description ?? null,
				paymentType: String(body.paymentType ?? ""),
				refundable: Boolean(body.refundable),
				cancellationPolicyId: body.cancellationPolicyId ?? null,
			},
			priceRule,
			restrictions: specResult.spec.restrictions.items.map((item) => ({
				type: String(item.type),
				value: Number(item.value),
			})),
		})
		if (result === "not_found") {
			return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
		}

		if (body.variantId) {
			invalidateAggregateCache({ variantId: body.variantId })
			const variant = await variantManagementRepository.getVariantById(body.variantId)
			if (variant) {
				await invalidateVariant(body.variantId, variant.productId)
			}
		}
		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (err) {
		console.error("rateplans:update", err)
		return new Response(JSON.stringify({ error: "Update failed" }), { status: 500 })
	}
}
