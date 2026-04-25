import { describe, expect, it } from "vitest"

import { classifySearchMismatch } from "@/modules/search/public"

describe("classifySearchMismatch", () => {
	it("returns critical when sellability differs", () => {
		expect(
			classifySearchMismatch({
				baselineIsSellable: true,
				candidateIsSellable: false,
				reasonCodeMismatch: true,
				priceMismatch: true,
			})
		).toBe("critical")
	})

	it("returns major when reason mismatch without sellability mismatch", () => {
		expect(
			classifySearchMismatch({
				baselineIsSellable: true,
				candidateIsSellable: true,
				reasonCodeMismatch: true,
				priceMismatch: true,
			})
		).toBe("major")
	})

	it("returns minor when only price mismatches", () => {
		expect(
			classifySearchMismatch({
				baselineIsSellable: true,
				candidateIsSellable: true,
				reasonCodeMismatch: false,
				priceMismatch: true,
			})
		).toBe("minor")
	})

	it("returns none when all dimensions are equal", () => {
		expect(
			classifySearchMismatch({
				baselineIsSellable: false,
				candidateIsSellable: false,
				reasonCodeMismatch: false,
				priceMismatch: false,
			})
		).toBe("none")
	})
})
