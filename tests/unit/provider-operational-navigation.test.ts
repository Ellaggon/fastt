import { describe, expect, it } from "vitest"

import {
	providerOperationalNavigation,
	resolveOperationalSidebarVertical,
} from "@/lib/dashboard/providerOperationalNavigation"

describe("provider operational navigation", () => {
	it("uses hotel vocabulary for rooms, rates, inventory calendar and guest conditions", () => {
		const groups = providerOperationalNavigation("hotel") ?? []
		const labels = groups.flatMap((group) => group.items.map((item) => item.label))
		expect(labels).toEqual(
			expect.arrayContaining([
				"Mis alojamientos",
				"Habitaciones",
				"Reglas para huéspedes",
				"Tarifas",
				"Calendario",
				"Reservas",
			])
		)
		expect(labels).not.toContain("Salidas y cupos")
	})

	it("uses tour vocabulary for departures and day-of operations", () => {
		const groups = providerOperationalNavigation("tour") ?? []
		const labels = groups.flatMap((group) => group.items.map((item) => item.label))
		expect(labels).toEqual(
			expect.arrayContaining(["Mis tours", "Salidas y cupos", "Operación de hoy", "Tarifas"])
		)
		expect(labels).not.toContain("Habitaciones")
		expect(labels).not.toContain("Reglas para huéspedes")
	})

	it("only adopts a vertical automatically when the provider has one active vertical", () => {
		expect(
		resolveOperationalSidebarVertical({
			workspaceScope: { vertical: null, productId: null },
			availableVerticals: ["tour"],
		})
	).toBe("tour")
		expect(
		resolveOperationalSidebarVertical({
			workspaceScope: { vertical: null, productId: null },
			availableVerticals: ["hotel", "tour"],
		})
	).toBeNull()
})
})
