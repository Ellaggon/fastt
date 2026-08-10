import { describe, expect, it } from "vitest"

import {
	resolveProviderWorkspaceContext,
	resolveWorkspaceNavigationScope,
	withWorkspaceNavigationScope,
} from "@/lib/workspace/verticalContext"

describe("workspace vertical context", () => {
	it("keeps company context neutral when the provider has no products", () => {
		expect(resolveProviderWorkspaceContext({ productTypes: [] })).toEqual({
			level: "company",
			availableVerticals: [],
			vertical: null,
			productId: null,
		})
	})

	it("distinguishes vertical from concrete product scope", () => {
		expect(
			resolveProviderWorkspaceContext({
				productTypes: ["Hotel", "Tour"],
				vertical: "Tour",
			})
		).toEqual({
			level: "vertical",
			availableVerticals: ["hotel", "tour"],
			vertical: "tour",
			productId: null,
		})
		expect(
			resolveProviderWorkspaceContext({
				productTypes: ["Hotel", "Tour"],
				vertical: "Tour",
				productId: "tour_123",
			})
		).toEqual({
			level: "product",
			availableVerticals: ["hotel", "tour"],
			vertical: "tour",
			productId: "tour_123",
		})
	})

	it("serializes scope without dropping existing page filters", () => {
		const scope = resolveWorkspaceNavigationScope({
			productTypes: ["Hotel", "Tour"],
			searchParams: new URLSearchParams("scope=tour&productId=tour_123"),
		})
		expect(scope).toEqual({ vertical: "tour", productId: "tour_123" })
		expect(withWorkspaceNavigationScope("/booking?vista=today", scope)).toBe(
			"/booking?vista=today&scope=tour&productId=tour_123"
		)
	})
})
