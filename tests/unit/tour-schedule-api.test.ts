import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	user: vi.fn(),
	provider: vi.fn(),
	preview: vi.fn(),
	program: vi.fn(),
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: mocks.user }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({ getProviderIdFromRequest: mocks.provider }))
vi.mock("@/modules/inventory/public", () => ({
	loadTourScheduleContext: vi.fn(),
	previewTourDepartures: mocks.preview,
	programTourDepartures: mocks.program,
	TourScheduleError: class extends Error {},
}))
import { POST } from "../../src/pages/api/inventory/program-tour-departures"
const input = {
	variantId: "option-A",
	from: "2099-01-01",
	to: "2099-01-05",
	weekdays: [1],
	excluded: [],
	capacity: 10,
}
const call = (body: unknown, key?: string) =>
	POST({
		request: new Request("http://localhost/api/inventory/program-tour-departures", {
			method: "POST",
			headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
			body: JSON.stringify(body),
		}),
		url: new URL("http://localhost/api/inventory/program-tour-departures"),
	} as Parameters<typeof POST>[0])
beforeEach(() => {
	vi.clearAllMocks()
	mocks.user.mockResolvedValue({ id: "user" })
	mocks.provider.mockResolvedValue("authorized-provider")
	mocks.preview.mockResolvedValue({ token: "review" })
})
it("requires authentication before any scheduling read or write", async () => {
	mocks.user.mockResolvedValue(null)
	expect((await call({ input })).status).toBe(401)
	expect(mocks.preview).not.toHaveBeenCalled()
	expect(mocks.program).not.toHaveBeenCalled()
})
it("uses the authorized provider rather than a provider from the payload", async () => {
	expect((await call({ input, providerId: "other" })).status).toBe(422)
	expect((await call({ input })).status).toBe(200)
	expect(mocks.preview).toHaveBeenCalledWith("authorized-provider", input)
})
it("requires a valid replay identity before applying a reviewed range", async () => {
	expect((await call({ input, token: "review" })).status).toBe(400)
	expect((await call({ input, token: "review" }, "x".repeat(201))).status).toBe(400)
	expect(mocks.program).not.toHaveBeenCalled()
})
it("passes the reviewed input and replay key unchanged to the transactional service", async () => {
	mocks.program.mockResolvedValue({ refresh: "ready" })
	expect((await call({ input, token: "review" }, "same-command")).status).toBe(200)
	expect(mocks.program).toHaveBeenCalledWith("authorized-provider", input, "review", "same-command")
})
