import { describe, expect, it } from "vitest"

import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"
import { normalizeOccupancy } from "@/shared/domain/occupancy"

describe("buildOccupancyKey", () => {
	it("es determinístico para la misma ocupación", () => {
		const a = buildOccupancyKey({ adults: 2, children: 1, infants: 0 })
		const b = buildOccupancyKey({ adults: 2, children: 1, infants: 0 })
		expect(a).toBe("a2_c1_i0")
		expect(b).toBe("a2_c1_i0")
		expect(a).toBe(b)
	})

	it("genera keys distintas para combinaciones distintas", () => {
		const one = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
		const two = buildOccupancyKey({ adults: 2, children: 1, infants: 0 })
		const three = buildOccupancyKey({ adults: 2, children: 1, infants: 1 })

		expect(one).toBe("a2_c0_i0")
		expect(two).toBe("a2_c1_i0")
		expect(three).toBe("a2_c1_i1")
		expect(new Set([one, two, three]).size).toBe(3)
	})

	it("incluye infants=0 por defecto", () => {
		const key = buildOccupancyKey({ adults: 1, children: 0 })
		expect(key).toBe("a1_c0_i0")
	})

	it("normaliza campos faltantes y fuerza al menos 1 adulto", () => {
		expect(normalizeOccupancy({})).toEqual({
			adults: 1,
			children: 0,
			infants: 0,
		})
		expect(normalizeOccupancy({ adults: 0, children: 2 })).toEqual({
			adults: 1,
			children: 2,
			infants: 0,
		})
	})

	it("coacciona inválidos y trunca decimales de forma determinística", () => {
		expect(normalizeOccupancy({ adults: "2.9", children: "1.2", infants: "x" })).toEqual({
			adults: 2,
			children: 1,
			infants: 0,
		})
		expect(normalizeOccupancy({ adults: -5, children: -3, infants: -1 })).toEqual({
			adults: 1,
			children: 0,
			infants: 0,
		})
	})

	it("requiere semántica canónica de ocupación (sin totalGuests)", () => {
		const key = buildOccupancyKey({ adults: 3, children: 0, infants: 0 })
		expect(key).toBe("a3_c0_i0")
	})
})
