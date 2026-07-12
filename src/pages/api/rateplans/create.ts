import type { APIRoute } from "astro"
import { ZodError } from "zod"
import {
	baseRateRepository,
	productRepository,
	ratePlanCommandRepository,
	variantManagementRepository,
	variantRepository,
} from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { createRatePlanContract } from "@/lib/rates/createRatePlanContract"
import { resolveCommercialIntentSpec } from "@/lib/rates/ratePlanCommercialIntent"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import {
	createCommercialRatePlanSchema,
	createRatePlan,
	setRatePlanPricingBaseline,
} from "@/modules/pricing/public"

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProvider(request)
	let createdRatePlanId = ""

	try {
		const body = createCommercialRatePlanSchema.parse(await request.json())
		const variant = await variantManagementRepository.getVariantById(body.variantId)
		if (!variant) return json(404, { error: "Habitación no encontrada." })
		const ownedProduct = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!ownedProduct) return json(404, { error: "Habitación no encontrada." })

		const intent = resolveCommercialIntentSpec(body.intent)
		const result = await createRatePlan(
			{ repo: ratePlanCommandRepository },
			{
				variantId: body.variantId,
				name: body.name,
				description: body.description ?? null,
				type: intent.type,
				value: intent.value,
				minNights: intent.minNights,
				minAdvanceDays: intent.minAdvanceDays,
				isActive: false,
				isDefault: false,
			}
		)
		if (!result.ok) return json(result.status, { error: result.error })
		createdRatePlanId = result.ratePlanId

		await setRatePlanPricingBaseline(
			{ pricingBaselineRepo: baseRateRepository, variantRepo: variantRepository },
			{
				ratePlanId: createdRatePlanId,
				variantId: body.variantId,
				currency: body.currency,
				basePrice: body.basePrice,
			}
		)
		await createRatePlanContract({
			providerId,
			actorUserId: String(user.id ?? "") || undefined,
			ratePlanId: createdRatePlanId,
			ratePlanName: body.name,
			presets: intent.contract,
		})

		const invalidateCreatedRatePlan = async () => {
			invalidateAggregateCache({
				providerId,
				productId: variant.productId,
				variantId: body.variantId,
			})
			await invalidateVariant(body.variantId, variant.productId)
		}

		if (body.publicationMode === "publish") {
			const publication = await validateRatePlanPublication({
				ratePlanId: createdRatePlanId,
				variantId: body.variantId,
				productId: variant.productId,
			})
			if (!publication.canPublish) {
				await invalidateCreatedRatePlan()
				return json(201, {
					error: `La tarifa quedó en borrador. Falta: ${publication.blockers.join(", ")}.`,
					ratePlanId: createdRatePlanId,
					status: "draft",
				})
			}
			await ratePlanCommandRepository.updateRatePlan({
				ratePlanId: createdRatePlanId,
				isActive: true,
				isDefault: body.isDefault,
				name: body.name,
				description: body.description ?? null,
			})
		}

		await invalidateCreatedRatePlan()

		return json(201, {
			ratePlanId: createdRatePlanId,
			status: body.publicationMode === "publish" ? "active" : "draft",
		})
	} catch (error) {
		if (createdRatePlanId) {
			await ratePlanCommandRepository.deleteRatePlan(createdRatePlanId).catch(() => undefined)
		}
		if (error instanceof ZodError) {
			return json(400, {
				error: "Revisa los datos de la tarifa.",
				issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
			})
		}
		console.error("rateplans:create", error)
		return json(500, { error: "No se pudo crear la tarifa completa." })
	}
}
