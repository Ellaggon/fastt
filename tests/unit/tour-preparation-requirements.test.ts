import { describe, expect, it } from "vitest"
import {
	formatTourPreparationProgressLine,
	requirementStatusLabel,
	resolveActiveTourPreparationRequirement,
	TOUR_PREPARATION_REQUIREMENT_ORDER,
} from "@/lib/tours/tourPreparationRequirements"

describe("tour preparation requirements rail", () => {
	it("formats the preparation progress line for the playbook header", () => {
		expect(
			formatTourPreparationProgressLine({
				readyCount: 9,
				totalCount: 10,
				readinessPercent: 90,
			})
		).toBe("Requisitos 9 de 10 · Preparado 90%")
	})

	it("keeps the ten preparation requirements in playbook order", () => {
		expect(TOUR_PREPARATION_REQUIREMENT_ORDER).toHaveLength(10)
		expect(TOUR_PREPARATION_REQUIREMENT_ORDER[0]).toBe("presentation")
		expect(TOUR_PREPARATION_REQUIREMENT_ORDER.at(-1)).toBe("calendar_configuration")
	})

	it("prefers the current playbook step over the next pending requirement", () => {
		expect(
			resolveActiveTourPreparationRequirement("conditions", "presentation", {
				preferPlaybookStep: true,
			})
		).toBe("conditions")
		expect(resolveActiveTourPreparationRequirement("location", "presentation")).toBe("logistics")
		expect(resolveActiveTourPreparationRequirement("categories", "logistics")).toBe("activities")
	})

	it("labels the active requirement as En curso", () => {
		expect(
			requirementStatusLabel(
				{
					id: "conditions",
					position: 9,
					label: "Condiciones",
					state: "pending",
					href: "/rates/plans/x",
				},
				"conditions"
			)
		).toBe("En curso")
		expect(
			requirementStatusLabel(
				{
					id: "price",
					position: 8,
					label: "Precio",
					state: "ready",
					href: null,
				},
				"conditions"
			)
		).toBe("Lista")
	})
})
