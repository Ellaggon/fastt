import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	owned: vi.fn(),
	context: vi.fn(),
	canonical: vi.fn(),
	evaluate: vi.fn(),
	publish: vi.fn(),
	refresh: vi.fn(),
}))
vi.mock("@/container", () => ({ productRepository: { ensureProductOwnedByProvider: mocks.owned } }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user", email: "user@example.test" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: mocks.refresh,
}))
vi.mock("@/lib/product/canonical-product-publication", () => ({
	resolveCanonicalProductPublicationValidationErrors: mocks.canonical,
}))
vi.mock("@/modules/catalog/public", () => ({
	evaluateProductReadiness: mocks.evaluate,
	publishProduct: mocks.publish,
}))
vi.mock("@/lib/provider-governance", () => ({ assertProviderCapability: async () => undefined }))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	assertProductCommercialCapability: async () => undefined,
	CommercialPolicyBlockedError: class extends Error {},
}))
vi.mock("@/lib/verification/line-gate", () => ({
	assertProductLineGate: async () => undefined,
	ProductLineGateBlockedError: class extends Error {},
}))
vi.mock("@/lib/tours/loadTourCommercialContext", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/tours/loadTourCommercialContext")>()
	return { ...actual, loadTourCommercialContext: mocks.context }
})
import { POST as evaluate } from "@/pages/api/product/evaluate"
import { POST as publish } from "@/pages/api/product/publish"

function request(selection = true) {
	const form = new FormData()
	form.set("productId", "tour")
	if (selection) {
		form.set("variantId", "option")
		form.set("ratePlanId", "rate")
	}
	return new Request("https://fastt.test/api/product/evaluate", { method: "POST", body: form })
}

describe("product APIs retain and validate tour selection", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.owned.mockResolvedValue({ productType: "tour" })
		mocks.context.mockResolvedValue({
			status: "resolved",
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
		})
		mocks.canonical.mockResolvedValue([])
		mocks.evaluate.mockImplementation(async (deps) => {
			await deps.resolvePublicationValidationErrors({ productId: "tour" })
			return { state: "ready" }
		})
		mocks.publish.mockImplementation(async (deps) => {
			await deps.resolvePublicationValidationErrors({ productId: "tour" })
			return { ok: true }
		})
		mocks.refresh.mockResolvedValue(undefined)
	})
	it.each([evaluate, publish])(
		"passes the same option and rate to canonical evaluation",
		async (route) => {
			const response = (await route({ request: request() } as Parameters<
				typeof route
			>[0])) as Response
			expect(response.status).toBe(200)
			expect(mocks.context).toHaveBeenCalledWith(
				expect.objectContaining({
					productId: "tour",
					providerId: "provider",
					selection: { variantId: "option", ratePlanId: "rate" },
				})
			)
			expect(mocks.canonical).toHaveBeenCalledWith(
				expect.objectContaining({ selection: { variantId: "option", ratePlanId: "rate" } })
			)
		}
	)
	it.each([evaluate, publish])(
		"rejects a forged selection before any product state write",
		async (route) => {
			mocks.context.mockResolvedValue({
				status: "unresolved",
				reason: "invalid_selection",
				productId: "tour",
			})
			const response = (await route({ request: request() } as Parameters<
				typeof route
			>[0])) as Response
			expect(response.status).toBe(400)
			expect(mocks.evaluate).not.toHaveBeenCalled()
			expect(mocks.publish).not.toHaveBeenCalled()
			expect(mocks.refresh).not.toHaveBeenCalled()
		}
	)
	it.each([evaluate, publish])("requires a selection for ambiguous offers", async (route) => {
		mocks.context.mockResolvedValue({
			status: "unresolved",
			reason: "selection_required",
			productId: "tour",
		})
		const response = (await route({ request: request(false) } as Parameters<
			typeof route
		>[0])) as Response
		expect(response.status).toBe(409)
		expect(await response.json()).toMatchObject({
			error: "selection_required",
			selectionHref: "/product/tour/select-offer",
		})
		expect(mocks.evaluate).not.toHaveBeenCalled()
		expect(mocks.publish).not.toHaveBeenCalled()
	})
	it.each([evaluate, publish])(
		"offers a retry rather than another selection when reading the offer fails",
		async (route) => {
			mocks.context.mockResolvedValue({ status: "read_failed", productId: "tour" })
			const response = (await route({ request: request() } as Parameters<
				typeof route
			>[0])) as Response
			const payload = await response.json()
			expect(response.status).toBe(503)
			expect(payload.action).toEqual({ label: "Volver a intentar", href: "/product/tour/preview" })
			expect(payload.selectionHref).toBeUndefined()
			expect(mocks.publish).not.toHaveBeenCalled()
			expect(mocks.evaluate).not.toHaveBeenCalled()
		}
	)
	it("returns diagnostic actions before publication when a tour is blocked", async () => {
		const error = {
			code: "price",
			message: "Define el precio de esta tarifa.",
			responsible: "provider",
			state: "pending",
			action: {
				label: "Configurar precio",
				href: "/rates/plans/rate?productId=tour&variantId=option&ratePlanId=rate&vista=price",
			},
		}
		mocks.canonical.mockResolvedValue([error])
		const response = (await publish({ request: request() } as Parameters<
			typeof publish
		>[0])) as Response
		expect(response.status).toBe(422)
		expect(await response.json()).toMatchObject({ ok: false, validationErrors: [error] })
		expect(mocks.publish).not.toHaveBeenCalled()
		expect(mocks.refresh).not.toHaveBeenCalled()
	})
	it.each([evaluate, publish])("leaves hotel selection rules unchanged", async (route) => {
		mocks.owned.mockResolvedValue({ productType: "hotel" })
		const response = (await route({ request: request(false) } as Parameters<
			typeof route
		>[0])) as Response
		expect(response.status).toBe(200)
		expect(mocks.context).not.toHaveBeenCalled()
	})
})
