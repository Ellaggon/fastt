import { z } from "zod"
import { POLICY_CATEGORIES } from "../../../domain/policy.category"
import { cancellationTierSchema } from "./policyContentSchema"

const categoryEnum = z.enum(POLICY_CATEGORIES)
export const policyLibraryStatusSchema = z.enum(["draft", "active", "archived"])
export const policyStayLengthTypeSchema = z.enum(["any", "short_stay", "long_stay", "monthly"])
export const policyRefundBasisSchema = z.enum([
	"total_booking",
	"room_rate",
	"first_night",
	"deposit",
	"provider_policy",
	"none",
])
export const policyPayoutBasisSchema = z.enum(["gross", "net", "collected", "provider_policy"])
export const policyVersionContentSchema = z.object({
	description: z.string().optional().default(""),
	status: policyLibraryStatusSchema.optional().default("active"),
	policyPresetKey: z.string().min(1).optional(),
	stayLengthType: policyStayLengthTypeSchema.optional().default("any"),
	gracePeriod: z.number().int().min(0).optional(),
	refundBasis: policyRefundBasisSchema.optional(),
	payoutBasis: policyPayoutBasisSchema.optional(),
	localTimezone: z.string().min(1).optional(),
	// Minimal rule model for CAPA 6 write path: a JSON object keyed by ruleKey.
	// We store keys as PolicyRule.ruleKey and values as PolicyRule.ruleValue.
	rules: z.record(z.string(), z.unknown()).optional(),
	cancellationTiers: z.array(cancellationTierSchema).optional(),
	effectiveFrom: z.string().min(1).optional(),
	effectiveTo: z.string().min(1).optional(),
})

export const createPolicySchema = policyVersionContentSchema.extend({
	ownerProviderId: z.string().min(1),
	category: categoryEnum,
})

export const createPolicyVersionSchema = policyVersionContentSchema.extend({
	previousPolicyId: z.string().min(1),
})

export type PolicyVersionContentInput = z.input<typeof policyVersionContentSchema>
export type CreatePolicyInput = z.input<typeof createPolicySchema>
export type CreatePolicyVersionSchemaInput = z.input<typeof createPolicyVersionSchema>
