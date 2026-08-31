import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	requireProvider: vi.fn(),
	finalizeAddRoom: vi.fn(),
}))

vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider: mocks.requireProvider }))
vi.mock("@/lib/playbook/finalize-add-room", () => ({ finalizeAddRoom: mocks.finalizeAddRoom }))

import { POST } from "@/pages/api/rateplans/activate-guided"

function request(overrides: Record<string, unknown> = {}) {
	return new Request("http://localhost/api/rateplans/activate-guided", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			productId: "product-1",
			variantId: "room-1",
			ratePlanId: "rate-1",
			...overrides,
		}),
	})
}

describe("integration/api guided rate activation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.requireProvider.mockResolvedValue({ providerId: "provider-1", user: { id: "user-1" } })
		mocks.finalizeAddRoom.mockResolvedValue({
			ok: true,
			ratePlanId: "rate-1",
			terminalHref:
				"/product/product-1/rooms?variantId=room-1&ratePlanId=rate-1&playbook=add-room&step=confirmation&flow=add-room",
		})
	})

	it("passes the complete guided context to the finalization service", async () => {
		const response = await POST({ request: request() } as never)
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(mocks.finalizeAddRoom).toHaveBeenCalledWith({
			providerId: "provider-1",
			userId: "user-1",
			productId: "product-1",
			variantId: "room-1",
			ratePlanId: "rate-1",
		})
		expect(payload.terminalHref).toContain("ratePlanId=rate-1")
	})

	it("returns finalization blockers without navigating away", async () => {
		mocks.finalizeAddRoom.mockResolvedValue({
			ok: false,
			status: 409,
			error: "Aún falta información para finalizar la habitación.",
			blockers: ["Define cuántas unidades físicas existen para esta habitación."],
		})

		const response = await POST({ request: request() } as never)
		const payload = await response.json()

		expect(response.status).toBe(409)
		expect(payload.blockers).toEqual([
			"Define cuántas unidades físicas existen para esta habitación.",
		])
	})

	it("does not disclose another provider's rate plan", async () => {
		mocks.finalizeAddRoom.mockResolvedValue({
			ok: false,
			status: 404,
			error: "Tarifa, habitación o alojamiento no encontrado.",
		})

		const response = await POST({ request: request() } as never)

		expect(response.status).toBe(404)
	})
})
