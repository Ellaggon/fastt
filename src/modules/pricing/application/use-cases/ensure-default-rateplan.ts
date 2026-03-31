import { randomUUID } from "node:crypto"

import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"

/**
 * CAPA 4D: Minimal default rate plan bootstrap.
 *
 * Ensures there is an explicit default rate plan for the given variant.
 * If none exists, creates:
 * - RatePlanTemplate(name="Default", paymentType="prepaid", refundable=false)
 * - RatePlan(isDefault=true, isActive=true)
 *
 * No restrictions and no rules are created here.
 */
export async function ensureDefaultRatePlan(
	deps: {
		ratePlanRepo: RatePlanRepositoryPort
		ratePlanCmdRepo: RatePlanCommandRepositoryPort
	},
	params: { variantId: string }
): Promise<{ created: boolean; ratePlanId: string }> {
	const existing = await deps.ratePlanRepo.getDefaultByVariant(params.variantId)
	if (existing) return { created: false, ratePlanId: existing.id }

	const templateId = randomUUID()
	const ratePlanId = randomUUID()
	const now = new Date()

	await deps.ratePlanCmdRepo.createRatePlan({
		template: {
			id: templateId,
			name: "Default",
			description: null,
			paymentType: "prepaid",
			refundable: false,
			cancellationPolicyId: null,
			createdAt: now,
		},
		ratePlan: {
			id: ratePlanId,
			variantId: params.variantId,
			templateId,
			isDefault: true,
			isActive: true,
			createdAt: now,
		},
		restrictions: [],
	})

	return { created: true, ratePlanId }
}
