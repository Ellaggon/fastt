import { describe, expect, it } from "vitest"
import { db, eq, Policy } from "astro:db"

import {
	replacePolicyAssignmentCapa6,
	createPolicyCapa6,
	PolicyValidationError,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/policies effective date filtering", () => {
	it("stores date-only ranges and resolves both inclusive boundaries", async () => {
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
			ownerProviderId: "prov_test",
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-31",
		})

		const stored = await db
			.select({ effectiveFrom: Policy.effectiveFrom, effectiveTo: Policy.effectiveTo })
			.from(Policy)
			.where(eq(Policy.id, created.policyId))
			.get()
		expect(stored).toEqual({
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-31",
		})

		await replacePolicyAssignmentCapa6({
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

		const onFirstDay = await resolveEffectivePolicies({
			productId,
			checkIn: "2030-01-01",
			checkOut: "2030-01-02",
		})
		expect(onFirstDay.policies.some((policy) => policy.category === "Payment")).toBe(true)

		const onLastDay = await resolveEffectivePolicies({
			productId,
			checkIn: "2030-01-31",
			checkOut: "2030-02-01",
		})
		expect(onLastDay.policies.some((policy) => policy.category === "Payment")).toBe(true)

		const afterRange = await resolveEffectivePolicies({
			productId,
			checkIn: "2030-02-01",
			checkOut: "2030-02-02",
		})
		expect(afterRange.policies).toHaveLength(0)
	})

	it("rejects timestamps and impossible calendar dates", async () => {
		const baseInput = {
			ownerProviderId: "prov_test",
			category: "Payment" as const,
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
		}

		await expect(
			createPolicyCapa6({
				...baseInput,
				effectiveFrom: "2030-01-01T00:00:00.000Z",
			})
		).rejects.toBeInstanceOf(PolicyValidationError)

		await expect(
			createPolicyCapa6({
				...baseInput,
				effectiveFrom: "2030-02-30",
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})
})
