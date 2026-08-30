import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	clearPricingBulkClientIntent,
	getOrCreatePricingBulkClientIntent,
} from "@/lib/pricing/pricing-bulk-client-intent"

const read = (path: string) => readFileSync(path, "utf8")

describe("pricing bulk operation UX", () => {
	it("keeps asynchronous pricing work visible and actionable", () => {
		const panel = read("src/components/pricing/PricingBulkJobOperationPanel.tsx")
		const multi = read("src/components/rates/MultiCalendarWorkspace.tsx")
		const single = read("src/components/rates/SingleCalendarWorkspace.tsx")

		expect(panel).toContain("Operación preparada")
		expect(panel).toContain("Progreso real")
		expect(panel).toContain("aplicadas")
		expect(panel).toContain("omitidas")
		expect(panel).toContain("Reintentar fallidas")
		expect(panel).toContain("Reintentar finalización")
		expect(panel).toContain("No pudimos consultar la operación")
		expect(panel).toContain("Reintentar consulta")
		expect(panel).toContain("Esta operación no existe o ya no está disponible para tu cuenta.")
		expect(panel).toContain("comprobadas")
		expect(panel).toContain("Ver actividad de la operación")
		expect(multi).toContain('fetch("/api/pricing/bulk-jobs"')
		expect(multi).toContain("shouldQueuePricingPreview")
		expect(multi).toContain("getOrCreatePricingBulkClientIntent")
		expect(single).toContain('fetch("/api/pricing/bulk-jobs"')
	})

	it("keeps the same idempotency key until the UI closes the intent", () => {
		const values = new Map<string, string>()
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
		})
		const input = {
			surface: "calendar",
			mode: "apply" as const,
			payload: { ratePlanIds: ["rate-1"], value: 120 },
		}
		const first = getOrCreatePricingBulkClientIntent(input)
		const replay = getOrCreatePricingBulkClientIntent(input)
		expect(replay).toEqual(first)
		clearPricingBulkClientIntent(first.storageKey)
		expect(getOrCreatePricingBulkClientIntent(input).idempotencyKey).not.toBe(first.idempotencyKey)
	})

	it("keeps the operation usable when session storage is blocked", () => {
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: {
				getItem: () => {
					throw new Error("storage_blocked")
				},
				setItem: () => {
					throw new Error("storage_blocked")
				},
				removeItem: () => {
					throw new Error("storage_blocked")
				},
			},
		})
		const intent = getOrCreatePricingBulkClientIntent({
			surface: "calendar",
			mode: "apply",
			payload: { ratePlanIds: ["rate-1"], value: 120 },
		})
		expect(intent.idempotencyKey).toContain("pricing-bulk:calendar:apply:")
		expect(() => clearPricingBulkClientIntent(intent.storageKey)).not.toThrow()
	})
})
