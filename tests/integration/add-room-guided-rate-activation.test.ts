import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	requireProvider: vi.fn(),
	finalizeAddRoom: vi.fn(),
	finalizeTourRate: vi.fn(),
	resolveRatePlanOwnerContext: vi.fn(),
}))

vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider: mocks.requireProvider }))
vi.mock("@/lib/playbook/finalize-add-room", () => ({ finalizeAddRoom: mocks.finalizeAddRoom }))
vi.mock("@/lib/playbook/finalize-tour-rate", () => ({ finalizeTourRate: mocks.finalizeTourRate }))
vi.mock("@/modules/pricing/public", () => ({
	resolveRatePlanOwnerContext: mocks.resolveRatePlanOwnerContext,
}))

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
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "room-1",
			productType: "hotel",
		})
		mocks.finalizeAddRoom.mockResolvedValue({
			ok: true,
			ratePlanId: "rate-1",
			terminalHref:
				"/product/product-1/rooms?variantId=room-1&ratePlanId=rate-1&playbook=add-room&step=confirmation&flow=add-room",
		})
		mocks.finalizeTourRate.mockResolvedValue({
			ok: true,
			ratePlanId: "rate-1",
			alreadyActive: true,
			cacheRefreshPending: false,
			terminalHref: "/product/product-1/preview?playbook=complete-to-publish",
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

	it("returns provider configuration blockers with safe corrective links", async () => {
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "room-1",
			productType: "tour",
		})
		const error = Object.assign(new Error("PROVIDER_CONFIGURATION_BLOCKED:publish"), {
			details: {
				capability: "publish",
				blockers: [
					{
						id: "fiscality",
						label: "Completa la identidad fiscal del proveedor.",
						severity: "high",
						href: "/provider/settings/verification/fiscal",
						areaId: "fiscality",
						capabilities: ["publish"],
					},
					{
						id: "unsafe_link",
						label: "No debe incluir un enlace externo.",
						href: "https://example.test",
					},
				],
				risks: [],
			},
		})
		mocks.finalizeTourRate.mockRejectedValue(error)

		const response = await POST({
			request: request({ playbook: "launch-tour" }),
		} as never)
		const payload = await response.json()

		expect(response.status).toBe(409)
		expect(payload).toEqual({
			code: "provider_configuration_blocked",
			error: "Completa los requisitos del proveedor antes de activar esta oferta.",
			blockers: [
				{
					id: "fiscality",
					label: "Completa la identidad fiscal del proveedor.",
					href: "/provider/settings/verification/fiscal",
					severity: "high",
					areaId: "fiscality",
				},
				{
					id: "unsafe_link",
					label: "No debe incluir un enlace externo.",
				},
			],
		})
	})

	it("provides a settings recovery link when governance returns no actionable issue", async () => {
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "room-1",
			productType: "tour",
		})
		mocks.finalizeTourRate.mockRejectedValue(
			Object.assign(new Error("PROVIDER_CONFIGURATION_BLOCKED:publish"), {
				details: { capability: "publish", blockers: [] },
			})
		)

		const response = await POST({
			request: request({ playbook: "launch-tour" }),
		} as never)
		const payload = await response.json()

		expect(response.status).toBe(409)
		expect(payload.blockers).toEqual([
			{
				id: "provider_configuration",
				label:
					"No pudimos identificar el requisito pendiente. Revisa la configuración de tu proveedor.",
				href: "/provider/settings",
			},
		])
	})

	it("does not disclose another provider's rate plan", async () => {
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "another-provider",
			productId: "product-1",
			variantId: "room-1",
			productType: "hotel",
		})

		const response = await POST({ request: request() } as never)

		expect(response.status).toBe(404)
		expect(mocks.finalizeAddRoom).not.toHaveBeenCalled()
	})

	it("resolves vertical from the owned rate plan instead of trusting a hotel claim", async () => {
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "room-1",
			productType: "tour",
		})

		const response = await POST({
			request: request({ vertical: "hotel", playbook: "launch-tour" }),
		} as never)

		expect(response.status).toBe(200)
		expect(mocks.finalizeTourRate).toHaveBeenCalledWith({
			providerId: "provider-1",
			userId: "user-1",
			productId: "product-1",
			variantId: "room-1",
			ratePlanId: "rate-1",
			playbook: "launch-tour",
		})
		expect(mocks.finalizeAddRoom).not.toHaveBeenCalled()
		const payload = await response.json()
		expect(payload).toMatchObject({ alreadyActive: true, cacheRefreshPending: false })
	})
})
