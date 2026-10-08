import { beforeEach, expect, it, vi } from "vitest"
import type { MiddlewareHandler } from "astro"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn() }))
vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider: mocks.auth }))
vi.mock("@/lib/onboarding/tourOptionSession", () => ({ getOptionSession: mocks.session }))
vi.mock("@/lib/auth/ensureAuthSession", () => ({ ensureAuthSessionForRequest: async () => [] }))
vi.mock("@/lib/dashboard/workspaceRequestContext", () => ({ buildWorkspaceRequestContext: vi.fn() }))
import { onRequest } from "@/middleware"
function context(
	query = "?playbook=add-tour-option&productId=tour-a&sessionId=session-a&variantId=option-a&ratePlanId=rate-a"
) {
	const url = new URL(`/rates/calendar${query}`, "http://localhost")
	return {
		url,
		request: new Request(url),
		locals: {},
		redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
	} as unknown as Parameters<MiddlewareHandler>[0]
}
async function invoke(ctx: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) {
	const response = await onRequest(ctx, next)
	expect(response).toBeInstanceOf(Response)
	return response as Response
}
beforeEach(() => {
	vi.clearAllMocks()
	mocks.auth.mockResolvedValue({ providerId: "provider-a", user: { id: "user-a" } })
	mocks.session.mockResolvedValue({
		id: "session-a",
		productId: "tour-a",
		variantId: "option-a",
		ratePlanId: "rate-a",
		status: "active",
	})
})
it("validates and shares the session before any rendering begins", async () => {
	const ctx = context()
	const next = vi.fn(async () => {
		expect(ctx.locals.optionPreparationSession?.id).toBe("session-a")
		return new Response("rendered")
	})
	expect((await invoke(ctx, next)).status).toBe(200)
	expect(next).toHaveBeenCalledOnce()
})
it("redirects a closed session before rendering, avoiding ResponseSentError", async () => {
	mocks.session.mockResolvedValue({ productId: "tour-a", status: "completed" })
	const next = vi.fn(async () => new Response("rendered"))
	const response = await invoke(context(), next)
	expect(response.headers.get("Location")).toBe("/product/tour-a/departures")
	expect(next).not.toHaveBeenCalled()
})
it("rejects another offer before rendering", async () => {
	mocks.session.mockResolvedValue({ productId: "tour-a", status: "active", variantId: "option-b" })
	const next = vi.fn(async () => new Response("rendered"))
	expect((await invoke(context(), next)).status).toBe(409)
	expect(next).not.toHaveBeenCalled()
})
it("preserves authentication return and leaves ordinary pages unaffected", async () => {
	mocks.auth.mockImplementation(async (_request, opts) => {
		throw opts.unauthorizedResponse
	})
	const next = vi.fn(async () => new Response("rendered"))
	const response = await invoke(context(), next)
	expect(response.headers.get("Location")).toContain("/SignInPage?returnTo=")
	expect(next).not.toHaveBeenCalled()
	mocks.auth.mockClear()
	expect((await invoke(context(""), next)).status).toBe(200)
	expect(mocks.auth).not.toHaveBeenCalled()
})
