import { afterEach, expect, it, vi } from "vitest"
import { financialViewHealth } from "@/pages/financial/_client/financial-load-state"
import {
	fetchFinancialJson,
	getFinancialSourceState,
	FinancialLoadError,
} from "@/pages/financial/_client/financial-data-cache"
afterEach(() => vi.unstubAllGlobals())
it("separates loading, empty success, partial failure and total failure", () => {
	expect(financialViewHealth([])).toBe("loading")
	expect(financialViewHealth([{ status: "ready", data: { items: [] } }])).toBe("ready")
	expect(financialViewHealth([{ status: "ready" }, { status: "error" }])).toBe("partial")
	expect(financialViewHealth([{ status: "error" }])).toBe("error")
	expect(financialViewHealth([{ status: "error", data: { items: [1] } }])).toBe("partial")
})
it("failed refresh preserves previous evidence, HTTP status and allows a successful retry", async () => {
	vi.stubGlobal("document", { getElementById: () => null, dispatchEvent: vi.fn() })
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(public type: string) {}
		}
	)
	const request = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ items: [{ id: "reserved-history" }] }))
		.mockResolvedValueOnce(Response.json({ error: "blocked" }, { status: 423 }))
		.mockResolvedValueOnce(Response.json({ items: [{ id: "new" }] }))
	vi.stubGlobal("fetch", request)
	const url = `/api/internal/financial/operations?test=${crypto.randomUUID()}`
	await fetchFinancialJson(url)
	await expect(fetchFinancialJson(url, { force: true })).rejects.toMatchObject({ status: 423 })
	expect(getFinancialSourceState(url)).toMatchObject({
		status: "error",
		data: { items: [{ id: "reserved-history" }] },
		error: { status: 423 },
	})
	await fetchFinancialJson(url, { force: true })
	expect(getFinancialSourceState(url)).toMatchObject({
		status: "ready",
		data: { items: [{ id: "new" }] },
	})
})
it("authentication failures remain authentication failures instead of empty lists", async () => {
	vi.stubGlobal("document", { getElementById: () => null, dispatchEvent: vi.fn() })
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(public type: string) {}
		}
	)
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 401 }))
	)
	const url = `/api/internal/financial/operations?test=${crypto.randomUUID()}`
	await expect(fetchFinancialJson(url)).rejects.toBeInstanceOf(FinancialLoadError)
	expect(getFinancialSourceState(url)?.error?.status).toBe(401)
	expect(financialViewHealth([getFinancialSourceState(url)!])).toBe("error")
})

it("HTTP 200 with degraded data remains partial and preserves previously read cases", async () => {
	vi.stubGlobal("document", { getElementById: () => null, dispatchEvent: vi.fn() })
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(public type: string) {}
		}
	)
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ items: [{ id: "kept" }] }))
			.mockResolvedValueOnce(Response.json({ items: [], degraded: true }))
	)
	const url = `/api/internal/financial/operations?test=${crypto.randomUUID()}`
	await fetchFinancialJson(url)
	expect(await fetchFinancialJson(url, { force: true })).toEqual({ items: [{ id: "kept" }] })
	expect(getFinancialSourceState(url)).toMatchObject({ status: "error", error: { status: 503 } })
})

it("cached financial data is isolated by the authenticated provider and never sends that cache identity as an API selector", async () => {
	let providerId = "provider-a"
	vi.stubGlobal("document", {
		getElementById: () => ({ dataset: { providerId } }),
		dispatchEvent: vi.fn(),
	})
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(public type: string) {}
		}
	)
	const request = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ items: [{ id: "a" }] }))
		.mockResolvedValueOnce(Response.json({ items: [{ id: "b" }] }))
	vi.stubGlobal("fetch", request)
	const url = `/api/internal/financial/operations?test=${crypto.randomUUID()}`
	expect(await fetchFinancialJson(url)).toEqual({ items: [{ id: "a" }] })
	providerId = "provider-b"
	expect(await fetchFinancialJson(url)).toEqual({ items: [{ id: "b" }] })
	expect(request).toHaveBeenCalledTimes(2)
	expect(request.mock.calls[1][0]).not.toContain("_cacheProvider")
	providerId = "provider-a"
	expect(await fetchFinancialJson(url)).toEqual({ items: [{ id: "a" }] })
})
