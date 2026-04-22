import { describe, expect, it } from "vitest"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/policies effective date filtering", () => {
	it("resolves active policy when effectiveFrom/effectiveTo are stored as ISO timestamps", async () => {
		const destinationId = `dest_pol_iso_${crypto.randomUUID()}`
		const productId = `prod_pol_iso_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Policy ISO Destination",
			type: "city",
			country: "CL",
			slug: `policy-iso-destination-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "Policy ISO Product",
			productType: "Hotel",
			destinationId,
		})

		const created = await createPolicyCapa6({
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
			effectiveFrom: "2030-01-01T00:00:00.000Z",
			effectiveTo: "2030-01-31T23:59:59.000Z",
		})

		await assignPolicyCapa6({
			policyId: created.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		const outOfRange = await resolveEffectivePolicies({
			productId,
			checkIn: "2029-12-31",
			checkOut: "2030-01-01",
		})
		expect(outOfRange.policies).toHaveLength(0)

		const inRange = await resolveEffectivePolicies({
			productId,
			checkIn: "2030-01-15",
			checkOut: "2030-01-16",
		})
		expect(inRange.policies.some((policy) => policy.category === "Payment")).toBe(true)
	})
})
