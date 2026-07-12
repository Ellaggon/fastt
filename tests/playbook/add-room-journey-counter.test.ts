import { describe, expect, it } from "vitest"
import {
	getAddRoomJourneySteps,
	getAddRoomStepPosition,
	getApplicableAddRoomSteps,
	getNextAddRoomStep,
} from "@/lib/playbook/add-room"

describe("add-room playbook stable journey counter", () => {
	it("shows Paso 1 de 6 on create-room with productId and no variantId", () => {
		const ctx = { productId: "hotel-1" }
		const position = getAddRoomStepPosition("create-room", ctx)
		expect(position).toEqual({ stepNumber: 1, totalSteps: 6 })
		expect(getAddRoomJourneySteps(ctx).map((step) => step.id)).toEqual([
			"create-room",
			"room-photos",
			"create-rate",
			"conditions",
			"availability",
			"confirmation",
		])
	})

	it("keeps denominator at 6 after variantId appears (photos = 2 de 6)", () => {
		const withoutVariant = getAddRoomStepPosition("create-room", { productId: "hotel-1" })
		const withVariant = getAddRoomStepPosition("room-photos", {
			productId: "hotel-1",
			variantId: "room-1",
		})
		expect(withoutVariant.totalSteps).toBe(6)
		expect(withVariant).toEqual({ stepNumber: 2, totalSteps: 6 })
		expect(withVariant.totalSteps).toBe(withoutVariant.totalSteps)
	})

	it("keeps denominator at 6 when ratePlanId unlocks conditions (4 de 6)", () => {
		const position = getAddRoomStepPosition("conditions", {
			productId: "hotel-1",
			variantId: "room-1",
			ratePlanId: "rate-1",
		})
		expect(position).toEqual({ stepNumber: 4, totalSteps: 6 })
	})

	it("shows Paso 1 de 7 when entering from catalog without productId", () => {
		const ctx = { productId: "" }
		const position = getAddRoomStepPosition("choose-accommodation", ctx)
		expect(position).toEqual({ stepNumber: 1, totalSteps: 7 })
		expect(getAddRoomJourneySteps(ctx)[0]?.id).toBe("choose-accommodation")
	})

	it("does not use applicable-only subset for the visible total", () => {
		const ctx = { productId: "hotel-1" }
		expect(getApplicableAddRoomSteps(ctx).length).toBe(2)
		expect(getAddRoomJourneySteps(ctx).length).toBe(6)
		expect(getAddRoomStepPosition("create-room", ctx).totalSteps).toBe(6)
	})

	it("does not skip ahead to confirmation when next step is not linkable yet", () => {
		const next = getNextAddRoomStep("create-room", { productId: "hotel-1" })
		expect(next).toBeNull()
	})

	it("returns room-photos as next once variantId exists", () => {
		const next = getNextAddRoomStep("create-room", {
			productId: "hotel-1",
			variantId: "room-1",
		})
		expect(next?.id).toBe("room-photos")
	})
})
