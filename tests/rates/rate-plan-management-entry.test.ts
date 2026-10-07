import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	where: vi.fn(),
	eq: vi.fn((column: string, value: string) => ({ column, value })),
}))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	Product: { id: "product.id", providerId: "product.providerId", productType: "product.type" },
	and: (...conditions: unknown[]) => conditions,
	eq: mocks.eq,
	first: (rows: unknown[]) => rows[0],
	db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}))

import { loadRatePlanManagementEntry } from "@/lib/rates/loadRatePlanManagementEntry"
import type { ProviderRatePlanVariantChoice } from "@/lib/rates/loadProviderRatePlanVariants"

function load(query: string, variantChoices: ProviderRatePlanVariantChoice[] = []) {
	return loadRatePlanManagementEntry({
		url: new URL(`https://fastt.test/rates/plans/manage?${query}`),
		providerId: "provider-1",
		variantChoices,
	})
}

describe("rate management entry without departures", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.where.mockResolvedValue([{ productId: "tour-1", productType: "tour" }])
	})

	it.each([
		"playbook=launch",
		"playbook=add-room",
		"flow=create",
		"flow=add-room",
		"playbook=launch-tour&flow=create",
	])("routes an owned tour with no variants from %s to its departure step", async (query) => {
		const result = await load(`productId=tour-1&${query}&ratePlanId=obsolete&openDialog=1`)
		expect(result.notFound).toBe(false)
		expect(result.isTour).toBe(true)
		const target = new URL(result.redirectHref!, "https://fastt.test")
		expect(target.pathname).toBe("/product/tour-1/departures/new")
		expect(Object.fromEntries(target.searchParams)).toEqual({
			playbook: "launch-tour",
			step: "departure",
			flow: "create",
			tourFlowVersion: "2",
		})
		expect(mocks.where).toHaveBeenCalledWith([
			{ column: "product.id", value: "tour-1" },
			{ column: "product.providerId", value: "provider-1" },
		])
	})

	it("preserves the continuation playbook when a departure is missing", async () => {
		const result = await load(
			"productId=tour-1&playbook=complete-to-publish&step=rate&flow=complete"
		)
		expect(result.redirectHref).toBe(
			"/product/tour-1/departures/new?playbook=complete-to-publish&step=departure&flow=complete"
		)
	})

	it("offers a departure form for an ordinary tour rate entry without inventing a guide", async () => {
		const result = await load("productId=tour-1")
		expect(result.redirectHref).toBe("/product/tour-1/departures/new")
	})

	it.each(["hotel", "accommodation"])(
		"keeps %s legacy guide entries unchanged",
		async (productType) => {
			mocks.where.mockResolvedValue([{ productId: "hotel-1", productType }])
			for (const playbook of ["launch", "add-room"]) {
				const result = await load(`productId=hotel-1&playbook=${playbook}`)
				expect(result).toMatchObject({ isTour: false, notFound: false, redirectHref: null })
			}
		}
	)

	it("rejects a missing or unowned product instead of falling back to a hotel", async () => {
		mocks.where.mockResolvedValue([])
		const result = await load("productId=other-product&playbook=launch")
		expect(result).toMatchObject({ notFound: true, redirectHref: null })
	})

	it("keeps a selected owned departure and avoids an additional product query", async () => {
		const choice = {
			productId: "tour-1",
			productType: "tour",
			productName: "Tour",
			variantId: "slot-1",
			variantName: "Salida",
			label: "Tour · Salida",
		}
		const result = await load("productId=tour-1&variantId=slot-1&playbook=add-room", [choice])
		const target = new URL(result.redirectHref!, "https://fastt.test")
		expect(target.pathname).toBe("/rates/plans/manage")
		expect(target.searchParams.get("variantId")).toBe("slot-1")
		expect(target.searchParams.get("playbook")).toBe("launch-tour")
		expect(mocks.where).not.toHaveBeenCalled()
	})

	it("leaves the global rate workspace without a product unscoped", async () => {
		const result = await load("")
		expect(result).toMatchObject({ notFound: false, redirectHref: null, productId: "" })
		expect(mocks.where).not.toHaveBeenCalled()
	})
	it("keeps the conditions stage and recovery context for a new tour even when another tour has options", async () => {
		const choices = [
			{
				productId: "other-tour",
				productType: "tour",
				productName: "Otro tour",
				variantId: "other-slot",
				variantName: "Otra opción",
				label: "Otro tour",
			},
		]
		const result = await load(
			"productId=tour-1&playbook=launch-tour&step=conditions&flow=create&tourFlowVersion=2&returnTo=%2Fproduct%2Ftour-1%2Fpreview",
			choices
		)
		const target = new URL(result.redirectHref!, "https://fastt.test")
		expect(target.pathname).toBe("/product/tour-1/conditions")
		expect(target.searchParams.get("step")).toBe("conditions")
		expect(target.searchParams.get("returnTo")).toBe("/product/tour-1/preview")
		expect(target.searchParams.has("variantId")).toBe(false)
	})
})
