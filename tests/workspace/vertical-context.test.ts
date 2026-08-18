import { describe, expect, it } from "vitest"

import {
	resolveProviderWorkspaceContext,
	resolveWorkspaceOperationalContext,
	resolveWorkspaceScopeOptions,
	resolveWorkspaceNavigationScope,
	withWorkspaceNavigationScope,
} from "@/lib/workspace/verticalContext"
import { readFileSync } from "node:fs"
import { join } from "node:path"

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
		expect(
			withWorkspaceNavigationScope("/booking?vista=today&scope=tour&productId=tour_123", {
				vertical: null,
				productId: null,
			})
		).toBe("/booking?vista=today")
	})

	it("builds scope options from the active vertical registry and effective access", () => {
		expect(
			resolveWorkspaceScopeOptions({
				productTypes: ["Hotel", "Package", "Limousine"],
				canAccessWorkspace: true,
			})
		).toEqual([
			{ vertical: "hotel", label: "Alojamientos" },
			{ vertical: "package", label: "Paquetes" },
			{ vertical: "limousine", label: "Traslados" },
		])
		expect(
			resolveWorkspaceScopeOptions({
				productTypes: ["Hotel", "Tour"],
				canAccessWorkspace: true,
				allowedVerticals: ["Tour"],
			})
		).toEqual([{ vertical: "tour", label: "Tours" }])
		expect(
			resolveWorkspaceScopeOptions({
				productTypes: ["Hotel", "Tour"],
				canAccessWorkspace: false,
			})
		).toEqual([])
	})

	it("keeps the operational context inside the provider verticals", () => {
		expect(
			resolveWorkspaceOperationalContext({
				productTypes: ["Hotel"],
				searchParams: new URLSearchParams("scope=tour"),
			})
		).toMatchObject({ level: "company", vertical: null, productId: null })
		expect(
			resolveWorkspaceOperationalContext({
				productTypes: ["Hotel", "Tour"],
				searchParams: new URLSearchParams("scope=tour"),
			})
		).toMatchObject({ level: "vertical", vertical: "tour", productId: null })
	})

	it("keeps the context selector aligned with the provider navigation grid", () => {
		const switcher = readFileSync(
			join(process.cwd(), "src/components/dashboard/WorkspaceScopeSwitcher.astro"),
			"utf8"
		)
		expect(switcher).toContain('class="mb-2.5"')
		expect(switcher).toContain("min-h-11 w-full")
		expect(switcher).toContain("rounded-lg")
		expect(switcher).not.toContain("Contexto operativo")
		expect(switcher).not.toContain("border-b border-white/[0.08]")
		expect(switcher).not.toContain('class="mb-4 px-2.5"')
	})
})
