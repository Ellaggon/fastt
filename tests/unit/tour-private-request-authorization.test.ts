import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	owner: vi.fn(),
	commercial: vi.fn(),
	line: vi.fn(),
	create: vi.fn(),
	CommercialError: class extends Error {},
	LineError: class extends Error {},
}))
vi.mock("@/container", () => ({ tourTrustRepository: { findPrivateTourSlot: mocks.owner } }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "traveler" }),
}))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	assertProductCommercialCapability: mocks.commercial,
	CommercialPolicyBlockedError: mocks.CommercialError,
}))
vi.mock("@/lib/verification/line-gate", () => ({
	assertProductLineGate: mocks.line,
	ProductLineGateBlockedError: mocks.LineError,
}))
vi.mock("@/modules/catalog/public", () => ({ createTourPrivateRequest: mocks.create }))
import { POST } from "@/pages/api/tours/private-request"
const payload = {
	productId: "tour",
	variantId: "option",
	departureDate: "2026-10-08",
	contactName: "Viajero",
	contactEmail: "traveler@example.test",
}
function invoke() {
	return POST({
		request: new Request("http://localhost/api/tours/private-request", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		}),
	} as Parameters<typeof POST>[0]) as Promise<Response>
}
beforeEach(() => {
	vi.resetAllMocks()
	mocks.owner.mockResolvedValue({
		providerId: "provider",
		salesEnabled: true,
		bookingMode: "private",
	})
	mocks.create.mockResolvedValue({
		ok: true,
		requestId: "request",
		slaDueAt: "2026-10-01T00:00:00Z",
	})
})
describe("private request cannot bypass experience authorization", () => {
	it("forces the product policy and evaluates evidence on the requested date before persisting", async () => {
		expect((await invoke()).status).toBe(200)
		expect(mocks.commercial).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "provider",
				productId: "tour",
				capability: "publish",
				forceForTour: true,
			})
		)
		expect(mocks.line).toHaveBeenCalledWith(
			expect.objectContaining({ evaluatedAt: new Date("2026-10-08T00:00:00Z") })
		)
		expect(mocks.create).toHaveBeenCalledOnce()
	})
	it.each(["commercial", "line"] as const)(
		"rejects a %s blocker before creating a request",
		async (gate) => {
			mocks[gate].mockRejectedValue(
				new (gate === "commercial" ? mocks.CommercialError : mocks.LineError)(
					"Evidencia pendiente o vencida"
				)
			)
			const response = await invoke()
			expect(response.status).toBe(409)
			expect((await response.json()).error).toBe("experience_authorization_required")
			expect(mocks.create).not.toHaveBeenCalled()
		}
	)
	it("does not infer an owner for a foreign option", async () => {
		mocks.owner.mockResolvedValue(null)
		expect((await invoke()).status).toBe(404)
		expect(mocks.commercial).not.toHaveBeenCalled()
		expect(mocks.create).not.toHaveBeenCalled()
	})
})
