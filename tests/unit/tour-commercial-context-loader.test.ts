import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	queries: [] as Array<{ table: string; conditions?: unknown }>,
	data: {} as Record<string, unknown[]>,
	fail: "",
	user: vi.fn(),
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: mocks.user }))
vi.mock("@/shared/infrastructure/db/compat", () => {
	const table = (name: string, columns: string[]) =>
		Object.fromEntries([["table", name], ...columns.map((column) => [column, `${name}.${column}`])])
	return {
		Product: table("product", ["id", "providerId", "productType"]),
		Variant: table("option", ["id", "productId", "kind", "name", "lifecycleState", "salesEnabled"]),
		RatePlan: table("rate", ["id", "variantId", "name", "isActive", "isDefault"]),
		TourSlotProfile: table("profile", ["variantId", "bookingMode"]),
		VariantCapacity: table("capacity", ["variantId"]),
		ProviderPreparationSession: table("session", [
			"providerId",
			"userId",
			"productId",
			"vertical",
			"status",
			"updatedAt",
			"variantId",
			"ratePlanId",
		]),
		eq: (column: unknown, value: unknown) => ({ column, value }),
		and: (...conditions: unknown[]) => conditions,
		desc: (column: unknown) => column,
		first: (rows: unknown[]) => rows[0],
		db: {
			select: () => ({
				from: (table: { table: string }) => {
					const record = { table: table.table, conditions: undefined as unknown }
					mocks.queries.push(record)
					const query = {
						leftJoin: () => query,
						innerJoin: () => query,
						where: (conditions: unknown) => {
							record.conditions = conditions
							return query
						},
						orderBy: () => query,
						limit: () => query,
						then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
							(mocks.fail === table.table
								? Promise.reject(new Error("offline"))
								: Promise.resolve(mocks.data[table.table] ?? [])
							).then(resolve, reject),
					}
					return query
				},
			}),
		},
	}
})

import {
	loadTourCommercialContext,
	loadTourCommercialEntryContext,
	tourContextEntryResponse,
	tourContextValidationResponse,
} from "@/lib/tours/loadTourCommercialContext"

const input = { providerId: "provider", productId: "tour" }
const row = {
	variantId: "option",
	name: "Option",
	lifecycleState: "draft",
	salesEnabled: false,
	profileId: "option",
	capacityId: "option",
	bookingMode: "shared",
	ratePlanId: "rate",
	rateName: "Rate",
	isActive: false,
	isDefault: false,
}

describe("owned tour context loader", () => {
	beforeEach(() => {
		mocks.queries.length = 0
		mocks.data = { product: [{ id: "tour", productType: "tour" }], option: [row], session: [] }
		mocks.fail = ""
		mocks.user.mockResolvedValue({ id: "user" })
	})
	it("checks ownership before reading options", async () => {
		mocks.data.product = []
		expect(await loadTourCommercialContext(input)).toMatchObject({ status: "not_found" })
		expect(mocks.queries).toEqual([
			{
				table: "product",
				conditions: [
					{ column: "product.id", value: "tour" },
					{ column: "product.providerId", value: "provider" },
				],
			},
		])
	})
	it("does not query tour options for a hotel", async () => {
		mocks.data.product = [{ id: "tour", productType: "hotel" }]
		expect(await loadTourCommercialContext(input)).toMatchObject({ status: "not_tour" })
		expect(mocks.queries).toHaveLength(1)
	})
	it("limits session reads to the user, provider, product and line", async () => {
		mocks.data.option = [row, { ...row, variantId: "other", ratePlanId: "other-rate" }]
		mocks.data.session = [{ variantId: "other", ratePlanId: "other-rate" }]
		expect(await loadTourCommercialContext({ ...input, userId: "user" })).toMatchObject({
			status: "resolved",
			source: "session",
			variantId: "other",
		})
		expect(mocks.queries.find((query) => query.table === "session")?.conditions).toEqual([
			{ column: "session.providerId", value: "provider" },
			{ column: "session.userId", value: "user" },
			{ column: "session.productId", value: "tour" },
			{ column: "session.vertical", value: "tour" },
			{ column: "session.status", value: "active" },
		])
	})
	it("never reads a session to repair an explicit invalid URL", async () => {
		expect(
			await loadTourCommercialContext({
				...input,
				userId: "user",
				url: new URL("https://fastt.test/?ratePlanId=foreign"),
			})
		).toMatchObject({ reason: "invalid_selection" })
		expect(mocks.queries.some((query) => query.table === "session")).toBe(false)
	})
	it("deduplicates context reads within a request, keeping products separate", async () => {
		const request = new Request("https://fastt.test/product/tour/preview")
		const first = loadTourCommercialContext({ ...input, request })
		const second = loadTourCommercialContext({ ...input, request })
		expect(first).toBe(second)
		await Promise.all([first, second])
		expect(mocks.queries.filter((query) => query.table === "option")).toHaveLength(1)
		await loadTourCommercialContext({ ...input, productId: "other", request })
		expect(mocks.queries.filter((query) => query.table === "option")).toHaveLength(2)
	})
	it("does not reuse context during mutation requests", async () => {
		const request = new Request("https://fastt.test/api/activate", { method: "POST" })
		await loadTourCommercialContext({ ...input, request })
		mocks.data.option = []
		expect(await loadTourCommercialContext({ ...input, request })).toMatchObject({
			status: "unresolved",
			reason: "missing_option",
		})
		expect(mocks.queries.filter((query) => query.table === "option")).toHaveLength(2)
	})

	it("does not cache between requests", async () => {
		await loadTourCommercialContext({ ...input, request: new Request("https://fastt.test") })
		await loadTourCommercialContext({ ...input, request: new Request("https://fastt.test") })
		expect(mocks.queries.filter((query) => query.table === "option")).toHaveLength(2)
	})
	it("reports read failures rather than guessing a selection", async () => {
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.fail = "option"
		expect(await loadTourCommercialContext(input)).toEqual({
			status: "read_failed",
			productId: "tour",
		})
		errorLog.mockRestore()
	})
	it.each(["product", "option"])(
		"preserves offer A through %s failure and revalidates A despite session B",
		async (table) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
			const url = new URL(
				"https://fastt.test/product/tour/preview?variantId=option&ratePlanId=rate"
			)
			const session = { variantId: "other", ratePlanId: "other-rate" }
			mocks.fail = table
			const failed = await loadTourCommercialContext({ ...input, url, session })
			expect(failed).toEqual({
				status: "read_failed",
				productId: "tour",
				recoveryIntent: { variantId: "option", ratePlanId: "rate" },
			})
			expect(failed).not.toHaveProperty("variantId")
			const response = tourContextValidationResponse(failed)!
			expect(response.status).toBe(503)
			const body = await response.json()
			const retryUrl = new URL(body.action.href, url)
			expect(retryUrl.searchParams.get("variantId")).toBe("option")
			expect(retryUrl.searchParams.get("ratePlanId")).toBe("rate")
			mocks.fail = ""
			mocks.data.option = [row, { ...row, variantId: "other", ratePlanId: "other-rate" }]
			expect(await loadTourCommercialContext({ ...input, url: retryUrl, session })).toMatchObject({
				status: "resolved",
				source: "url",
				variantId: "option",
				ratePlanId: "rate",
			})
			mocks.data.option = [{ ...row, variantId: "other", ratePlanId: "other-rate" }]
			expect(await loadTourCommercialContext({ ...input, url: retryUrl, session })).toMatchObject({
				status: "unresolved",
				reason: "invalid_selection",
			})
			log.mockRestore()
		}
	)
	it("preserves a partial inherited intent without filling it from the session", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.fail = "option"
		const failed = await loadTourCommercialContext({
			...input,
			selection: { ratePlanId: "rate" },
			session: { variantId: "other", ratePlanId: "other-rate" },
		})
		expect(failed).toMatchObject({ recoveryIntent: { variantId: null, ratePlanId: "rate" } })
		log.mockRestore()
	})

	it("explicit URL intent precedes inherited page hints", async () => {
		mocks.data.option = [row, { ...row, variantId: "other", ratePlanId: "other-rate" }]
		expect(
			await loadTourCommercialContext({
				...input,
				url: new URL("https://fastt.test/?ratePlanId=other-rate"),
				selection: { variantId: "option", ratePlanId: "rate" },
			})
		).toMatchObject({ source: "url", variantId: "other", ratePlanId: "other-rate" })
	})
	it("infers the product of a rate-only entry through an owned relation", async () => {
		mocks.data.product = [{ productId: "tour", id: "tour", productType: "tour" }]
		const url = new URL("https://fastt.test/rates/calendar?ratePlanId=rate")
		const context = await loadTourCommercialEntryContext({
			providerId: "provider",
			productId: "",
			url,
		})
		expect(context).toMatchObject({
			status: "resolved",
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(mocks.queries[0].conditions).toEqual([
			{ column: "product.providerId", value: "provider" },
			{ column: "rate.id", value: "rate" },
		])
		const response = tourContextEntryResponse(context!, url)
		expect(response?.headers.get("Location")).toContain("productId=tour")
	})
	it("does not invent context for a global workspace or an unowned rate", async () => {
		expect(await loadTourCommercialEntryContext({ ...input, productId: "" })).toBeNull()
		expect(mocks.queries).toHaveLength(0)
		mocks.data.product = []
		expect(
			await loadTourCommercialEntryContext({
				...input,
				productId: "",
				url: new URL("https://fastt.test/?variantId=foreign&ratePlanId=foreign-rate"),
			})
		).toMatchObject({ status: "not_found" })
		expect(mocks.queries[0].conditions).toEqual([
			{ column: "product.providerId", value: "provider" },
			{ column: "option.id", value: "foreign" },
			{ column: "rate.id", value: "foreign-rate" },
		])
	})
	it("redirects ambiguity to an explicit chooser with the guide return intact", async () => {
		mocks.data.option = [row, { ...row, ratePlanId: "second" }]
		const url = new URL(
			"https://fastt.test/rates/calendar?productId=tour&playbook=complete-to-publish&step=calendar&flow=complete"
		)
		const context = await loadTourCommercialContext({ ...input, url })
		const response = tourContextEntryResponse(context, url)
		expect(response?.status).toBe(302)
		const target = new URL(response!.headers.get("Location")!, url)
		expect(target.pathname).toBe("/product/tour/select-offer")
		expect(target.searchParams.get("returnTo")).toBe(url.pathname + url.search)
	})
})
