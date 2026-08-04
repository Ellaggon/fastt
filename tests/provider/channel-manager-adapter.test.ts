import { readdirSync, readFileSync, statSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import type { ChannelManagerAdapter } from "@/lib/channel-manager/channel-manager-adapter"
import { ChannexAdapter } from "@/lib/channel-manager/channex/channex-adapter"

function response(payload: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json", ...init.headers },
		...init,
	})
}

function property(id: string) {
	return {
		type: "property",
		id,
		attributes: {
			title: `Hotel ${id}`,
			city: "Santiago",
			country: "CL",
			currency: "USD",
			timezone: "America/Santiago",
			is_active: true,
		},
	}
}

function sourceFiles(path: URL): string[] {
	return readdirSync(path).flatMap((name) => {
		const child = new URL(name, path.href.endsWith("/") ? path : new URL(`${path.href}/`))
		if (statSync(child).isDirectory()) return sourceFiles(new URL(`${child.href}/`))
		return /\.(?:ts|astro)$/.test(name) ? [readFileSync(child, "utf8")] : []
	})
}

describe("ChannelManagerAdapter contract", () => {
	it("exposes every operation required by channel-manager orchestration", () => {
		const methods: Array<keyof ChannelManagerAdapter> = [
			"listProperties",
			"listRoomTypes",
			"listRatePlans",
			"pushAvailability",
			"pushRatesAndRestrictions",
			"fetchBookingRevisions",
			"acknowledgeBookingRevision",
			"testAccess",
		]
		const adapter = new ChannexAdapter({
			apiKey: "test://channex-ok",
			mode: "sandbox",
		})
		for (const method of methods) expect(typeof adapter[method]).toBe("function")
	})

	it("paginates complete collections and propagates request IDs", async () => {
		const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input))
			const page = Number(url.searchParams.get("pagination[page]"))
			expect(new Headers(init?.headers).get("user-api-key")).toBe("secret")
			expect(new Headers(init?.headers).get("x-request-id")).toBe(`fastt-${page}`)
			return response(
				{ data: [property(String(page))], meta: { page, limit: 1, total: 2 } },
				{ headers: { "x-request-id": `channex-${page}` } }
			)
		})
		let request = 0
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			fetchImpl: fetchImpl as typeof fetch,
			requestIdFactory: () => `fastt-${++request}`,
		})

		const result = await adapter.listProperties()

		expect(result.items.map((item) => item.id)).toEqual(["1", "2"])
		expect(result.pageCount).toBe(2)
		expect(result.requestIds).toEqual(["channex-1", "channex-2"])
		expect(fetchImpl).toHaveBeenCalledTimes(2)
	})

	it("treats warnings in HTTP 200 as partial rejection", async () => {
		const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body))
			expect(body.values).toHaveLength(2)
			expect(body.values[0]).toMatchObject({
				property_id: "property-1",
				room_type_id: "room-1",
				availability: 3,
			})
			return response({
				meta: {
					message: "Success",
					warnings: [{ code: "invalid_availability", title: "Valor rechazado", index: 1 }],
				},
			})
		})
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			fetchImpl: fetchImpl as typeof fetch,
		})

		const result = await adapter.pushAvailability({
			values: [
				{ propertyId: "property-1", roomTypeId: "room-1", date: "2026-08-10", availability: 3 },
				{ propertyId: "property-1", roomTypeId: "room-2", date: "2026-08-10", availability: 2 },
			],
		})

		expect(result).toMatchObject({
			ok: true,
			partial: true,
			submitted: 2,
			accepted: 1,
			rejected: 1,
		})
		expect(result.warnings[0]).toMatchObject({ code: "invalid_availability", itemIndex: 1 })
	})

	it("normalizes room types and rate plans and serializes restriction payloads", async () => {
		const requests: Array<{ path: string; body: unknown }> = []
		const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input))
			requests.push({
				path: url.pathname,
				body: init?.body ? JSON.parse(String(init.body)) : null,
			})
			if (url.pathname.endsWith("/room_types")) {
				return response({
					data: [
						{
							id: "room-1",
							attributes: {
								title: "Doble",
								property_id: "property-1",
								count_of_rooms: 4,
								occ_adults: 2,
							},
						},
					],
					meta: { page: 1, limit: 100, total: 1 },
				})
			}
			if (url.pathname.endsWith("/rate_plans")) {
				return response({
					data: [
						{
							id: "rate-1",
							attributes: {
								title: "BAR",
								property_id: "property-1",
								room_type_id: "room-1",
								currency: "USD",
							},
						},
					],
					meta: { page: 1, limit: 100, total: 1 },
				})
			}
			return response({
				data: [{ id: "task-rates-1", type: "task" }],
				meta: { message: "Success" },
			})
		})
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			fetchImpl: fetchImpl as typeof fetch,
		})

		const [rooms, rates] = await Promise.all([
			adapter.listRoomTypes({ propertyId: "property-1" }),
			adapter.listRatePlans({ propertyId: "property-1" }),
		])
		const pushed = await adapter.pushRatesAndRestrictions({
			values: [
				{
					propertyId: "property-1",
					ratePlanId: "rate-1",
					dateFrom: "2026-08-10",
					dateTo: "2026-08-12",
					rate: "180.00",
					minStayArrival: 2,
					stopSell: false,
				},
			],
		})

		expect(rooms.items[0]).toMatchObject({ id: "room-1", units: 4, maxAdults: 2 })
		expect(rates.items[0]).toMatchObject({ id: "rate-1", roomTypeId: "room-1" })
		expect(pushed).toMatchObject({
			ok: true,
			accepted: 1,
			rejected: 0,
			taskIds: ["task-rates-1"],
		})
		expect(requests.find((item) => item.path.endsWith("/restrictions"))?.body).toMatchObject({
			values: [
				{
					property_id: "property-1",
					rate_plan_id: "rate-1",
					date_from: "2026-08-10",
					date_to: "2026-08-12",
					rate: "180.00",
					min_stay_arrival: 2,
					stop_sell: false,
				},
			],
		})
	})

	it("uses typed booking feed and acknowledgement operations", async () => {
		const paths: string[] = []
		const fetchImpl = vi.fn(async (input: string | URL | Request) => {
			const url = new URL(String(input))
			paths.push(`${url.pathname}${url.search}`)
			if (url.pathname.endsWith("/ack")) return response({ meta: { message: "Acknowledged" } })
			return response({
				data: [
					{
						type: "booking_revision",
						id: "revision-1",
						attributes: {
							property_id: "property-1",
							booking_id: "booking-1",
							status: "new",
							currency: "USD",
							customer: {
								name: "Ada",
								surname: "Lovelace",
								email: "ada@example.test",
							},
							rooms: [
								{
									room_type_id: "room-1",
									rate_plan_id: "rate-1",
									meta: { parent_rate_plan_id: "rate-parent-1" },
									checkin_date: "2026-08-10",
									checkout_date: "2026-08-12",
								},
							],
							guarantee: {
								card_number: "4111111111111111",
								cvv: "123",
							},
						},
					},
				],
				meta: { page: 1, limit: 100, total: 1 },
			})
		})
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			fetchImpl: fetchImpl as typeof fetch,
		})

		const revisions = await adapter.fetchBookingRevisions({ propertyId: "property-1" })
		const acknowledged = await adapter.acknowledgeBookingRevision({ revisionId: "revision-1" })

		expect(revisions.items[0]).toMatchObject({
			id: "revision-1",
			status: "new",
			customer: { name: "Ada", surname: "Lovelace", email: "ada@example.test" },
			rooms: [
				{
					roomTypeId: "room-1",
					ratePlanId: "rate-1",
					parentRatePlanId: "rate-parent-1",
				},
			],
		})
		expect(JSON.stringify(revisions.items[0])).not.toContain("4111111111111111")
		expect(JSON.stringify(revisions.items[0])).not.toContain("cvv")
		expect(acknowledged.accepted).toBe(1)
		expect(paths[0]).toContain("/booking_revisions/feed")
		expect(paths[0]).toContain("filter%5Bproperty_id%5D=property-1")
		expect(paths[1]).toContain("/booking_revisions/revision-1/ack")
	})

	it("classifies remote errors without leaking credentials", async () => {
		const adapter = new ChannexAdapter({
			apiKey: "do-not-leak",
			mode: "production",
			fetchImpl: vi.fn(async () =>
				response({ errors: { code: "unauthorized", title: "Unauthorized" } }, { status: 401 })
			) as typeof fetch,
		})

		await expect(adapter.listProperties()).rejects.toMatchObject({
			kind: "authentication",
			status: 401,
			retryable: false,
		})
		await expect(adapter.listProperties()).rejects.not.toThrow("do-not-leak")
	})

	it("classifies invalid domain input before making a request", async () => {
		const fetchImpl = vi.fn()
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			fetchImpl: fetchImpl as typeof fetch,
		})

		await expect(
			adapter.pushAvailability({
				values: [
					{ propertyId: "property-1", roomTypeId: "room-1", date: "not-a-date", availability: 1 },
				],
			})
		).rejects.toMatchObject({ kind: "validation" })
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it("aborts slow requests and marks them retryable", async () => {
		const fetchImpl = vi.fn(
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError"))
					)
				})
		)
		const adapter = new ChannexAdapter({
			apiKey: "secret",
			mode: "sandbox",
			timeoutMs: 5,
			fetchImpl: fetchImpl as typeof fetch,
		})

		await expect(adapter.listProperties()).rejects.toMatchObject({
			kind: "timeout",
			retryable: true,
		})
	})

	it("keeps Channex transport details out of pages, workers and legacy facades", () => {
		const root = new URL("../../", import.meta.url)
		const pages = sourceFiles(new URL("src/pages/", root)).join("\n")
		const facades = [
			"src/lib/provider-channel-manager-properties.ts",
			"src/lib/provider-channel-manager-smoke.ts",
			"src/lib/provider-integration-scheduler.ts",
		]
			.map((path) => readFileSync(new URL(path, root), "utf8"))
			.join("\n")
		const forbidden = /staging\.channex\.io|app\.channex\.io|["']user-api-key["']/

		expect(pages).not.toMatch(forbidden)
		expect(facades).not.toMatch(forbidden)
		expect(facades).toContain("createChannelManagerAdapter")
	})

	it("provides a read-only staging smoke without printing the API key", () => {
		const root = new URL("../../", import.meta.url)
		const script = readFileSync(new URL("src/scripts/smoke-channex-staging.ts", root), "utf8")
		const pkg = readFileSync(new URL("package.json", root), "utf8")

		expect(pkg).toContain('"smoke:channex-staging"')
		expect(script).toContain("CHANNEX_STAGING_API_KEY")
		expect(script).toContain("adapter.testAccess()")
		expect(script).toContain("adapter.listProperties()")
		expect(script).not.toMatch(/console\.(?:log|error)\([^)]*apiKey/)
	})

	it("keeps commercial sends behind the production preflight gate", () => {
		const root = new URL("../../", import.meta.url)
		const pagesAndWorkers = [
			...sourceFiles(new URL("src/pages/", root)),
			readFileSync(new URL("src/lib/provider-integration-scheduler.ts", root), "utf8"),
		].join("\n")
		const ariService = readFileSync(
			new URL("src/lib/channel-manager/channel-manager-initial-ari.ts", root),
			"utf8"
		)
		const domain = readFileSync(new URL("src/lib/provider-integrations.ts", root), "utf8")

		expect(pagesAndWorkers).not.toContain("pushAvailability(")
		expect(pagesAndWorkers).not.toContain("pushRatesAndRestrictions(")
		expect(ariService.match(/adapter\.pushAvailability\(/g)).toHaveLength(1)
		expect(ariService.match(/adapter\.pushRatesAndRestrictions\(/g)).toHaveLength(1)
		expect(ariService).toContain("getProviderChannelManagerPreflight")
		expect(domain).toContain("assertProviderChannelManagerCommercialSyncAllowed")
		expect(domain).toContain("INTEGRATION_COMMERCIAL_SYNC_PREFLIGHT_REQUIRED")
	})
})
