import { describe, expect, it } from "vitest"

import {
	currentFinancialNavigationScope,
	financialBookingDetailHref,
	financialReturnTo,
	withFinancialNavigationScope,
} from "@/pages/financial/_client/financial-navigation-scope"

describe("financial-navigation-scope", () => {
	it("preserves scope on booking detail links", () => {
		const href = withFinancialNavigationScope("/booking/abc", {
			vertical: "tour",
			productId: "prod_1",
		})
		expect(href).toContain("scope=tour")
		expect(href).toContain("productId=prod_1")
		expect(href).toContain("/booking/abc")
	})

	it("builds scoped booking href from id", () => {
		const scope = { vertical: "tour" as const, productId: "prod_1" }
		expect(withFinancialNavigationScope("/booking/bk_123", scope)).toContain(
			"/booking/bk_123?scope=tour&productId=prod_1"
		)
		expect(financialBookingDetailHref("bk_123")).toBe("/booking/bk_123")
	})

	it("carries a scoped returnTo so the booking detail can come back into the financial case", () => {
		const href = financialBookingDetailHref("bk_123", {
			pathname: "/financial/collections",
			search: "?scope=tour&status=mismatch",
		} as Location)
		const url = new URL(href, "http://fastt.local")
		expect(url.pathname).toBe("/booking/bk_123")
		expect(url.searchParams.get("scope")).toBe("tour")
		const returnTo = new URL(String(url.searchParams.get("returnTo")), "http://fastt.local")
		expect(returnTo.pathname).toBe("/financial/collections")
		expect(returnTo.searchParams.get("status")).toBe("mismatch")
		expect(returnTo.searchParams.get("scope")).toBe("tour")
		expect(financialReturnTo({ pathname: "/booking", search: "" } as Location)).toBeNull()
	})

	it("falls back to URL search params for current scope", () => {
		const scope = currentFinancialNavigationScope({
			search: "?scope=hotel&productId=hotel_9",
		} as Location)
		expect(scope).toEqual({ vertical: "hotel", productId: "hotel_9" })
	})
})
