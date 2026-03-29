import { z } from "zod"

export const assignPolicySchema = z.object({
	policyId: z.string().min(1),
	scope: z.enum(["product", "variant", "rate_plan"]),
	scopeId: z.string().min(1),
	channel: z.string().min(1).optional().nullable(),
})

export type AssignPolicyInput = z.infer<typeof assignPolicySchema>
