import { describe, expect, it } from "vitest"

import { normalizedPricingRuleCommandFromPayload } from "@/lib/pricing/rules-v2"
import { PricingRuleCommandError } from "@/modules/pricing/public"

describe("pricing rule idempotency payload", () => {
	it("preserves a client or worker idempotency key in the normalized command", () => {
		const command = normalizedPricingRuleCommandFromPayload({
			type: "percentage",
			value: 10,
			idempotencyKey: "pricing-bulk:job-42:rate-plan-7",
		})

		expect(command.idempotencyKey).toBe("pricing-bulk:job-42:rate-plan-7")
	})

	it("rejects an oversized idempotency key before the command reaches persistence", () => {
		expect(() =>
			normalizedPricingRuleCommandFromPayload({
				type: "percentage",
				value: 10,
				idempotencyKey: "x".repeat(201),
			})
		).toThrow(new PricingRuleCommandError("invalid_idempotency_key"))
	})
})
