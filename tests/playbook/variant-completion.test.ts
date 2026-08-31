import { describe, expect, it } from "vitest"
import {
	deriveVariantCompletion,
	getAddRoomStepCompletion,
	isRoomProfileComplete,
	type VariantCompletionInput,
} from "@/lib/playbook/evaluate-add-room-progress"

function configuredRoom(overrides: Partial<VariantCompletionInput> = {}): VariantCompletionInput {
	return {
		profileComplete: true,
		photosComplete: true,
		rateConfigured: true,
		rateActive: false,
		rateDefault: false,
		pricingComplete: true,
		conditionsComplete: true,
		inventoryConfigComplete: true,
		availabilityComplete: true,
		selectedRatePlanId: "rate-1",
		...overrides,
	}
}

describe("variant completion", () => {
	it("lets a draft rate complete the rate and conditions forms without making the room sellable", () => {
		const completion = deriveVariantCompletion(configuredRoom())
		const steps = getAddRoomStepCompletion(completion)

		expect(completion.setupComplete).toBe(true)
		expect(completion.sellable).toBe(false)
		expect(steps["create-rate"]).toBe(true)
		expect(steps.conditions).toBe(true)
		expect(steps.confirmation).toBe(false)
	})

	it("requires physical units before the room profile step can be complete", () => {
		const completion = deriveVariantCompletion(
			configuredRoom({ profileComplete: false, inventoryConfigComplete: false })
		)

		expect(completion.profileComplete).toBe(false)
		expect(completion.setupComplete).toBe(false)
		expect(getAddRoomStepCompletion(completion)["create-room"]).toBe(false)
	})

	it("counts only the profile after a new room saves its physical configuration", () => {
		const completion = deriveVariantCompletion(
			configuredRoom({
				photosComplete: false,
				rateConfigured: false,
				pricingComplete: false,
				conditionsComplete: false,
				availabilityComplete: false,
			})
		)
		const steps = getAddRoomStepCompletion(completion)
		const completedWorkSteps = [
			"create-room",
			"room-photos",
			"create-rate",
			"conditions",
			"availability",
		].filter((key) => steps[key as keyof typeof steps])

		expect(steps["create-room"]).toBe(true)
		expect(steps["room-photos"]).toBe(false)
		expect(steps.availability).toBe(false)
		expect(completedWorkSteps).toEqual(["create-room"])
	})

	it("requires capacity, a physical profile, a bed and physical units for the profile", () => {
		const complete = {
			hasCapacity: true,
			hasPhysicalProfile: true,
			hasBed: true,
			hasPhysicalUnits: true,
		}

		expect(isRoomProfileComplete(complete)).toBe(true)
		expect(isRoomProfileComplete({ ...complete, hasPhysicalUnits: false })).toBe(false)
		expect(isRoomProfileComplete({ ...complete, hasBed: false })).toBe(false)
		expect(isRoomProfileComplete({ ...complete, hasPhysicalProfile: false })).toBe(false)
	})

	it("requires an active primary rate before the configured room becomes sellable", () => {
		const inactive = deriveVariantCompletion(configuredRoom())
		const activeButSecondary = deriveVariantCompletion(configuredRoom({ rateActive: true }))
		const sellable = deriveVariantCompletion(
			configuredRoom({ rateActive: true, rateDefault: true })
		)

		expect(inactive.sellable).toBe(false)
		expect(activeButSecondary.sellable).toBe(false)
		expect(sellable.sellable).toBe(true)
	})
})
