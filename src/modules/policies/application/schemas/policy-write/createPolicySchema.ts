import { z } from "zod"
import { POLICY_CATEGORIES } from "../../../domain/policy.category"

const categoryEnum = z.enum(POLICY_CATEGORIES)

export const createPolicySchema = z.object({
	previousPolicyId: z.string().min(1).optional(),
	category: categoryEnum,
	description: z.string().optional().default(""),
	// Minimal rule model for CAPA 6 write path: a JSON object keyed by ruleKey.
	// We store keys as PolicyRule.ruleKey and values as PolicyRule.ruleValue.
	rules: z.record(z.unknown()).optional(),
	cancellationTiers: z
		.array(
			z.object({
				daysBeforeArrival: z.number().int().min(0),
				penaltyType: z.enum(["percentage", "nights"]),
				penaltyAmount: z.number().min(0),
			})
		)
		.optional(),
	effectiveFrom: z.string().min(1).optional(),
	effectiveTo: z.string().min(1).optional(),
})

export type CreatePolicyInput = z.infer<typeof createPolicySchema>
