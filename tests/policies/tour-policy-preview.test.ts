import { describe, expect, it } from "vitest"
import { buildTourPolicyCategoryPreview } from "@/lib/policies/build-tour-policy-preview"

const context = {
	departureDate: "2026-10-07",
	departureTime: "09:00",
	departureDateSource: "next_available" as const,
	timezone: "America/Santiago",
	currency: "BOB",
	quoteAmount: null,
}

describe("tour policy preview", () => {
	it("presenta el corte flexible en lenguaje humano y sin anotaciones técnicas", () => {
		const preview = buildTourPolicyCategoryPreview({
			category: "Cancellation",
			context,
			snapshot: {
				cancellation: {
					calculation: {
						cancellation: {
							freeCancellationDeadlineLocal: "2026-10-06T09:00:00[property_local]",
							refundTiers: [
								{ hoursBeforeDeparture: 24, refundPercent: 100 },
								{ hoursBeforeDeparture: 0, refundPercent: 0 },
							],
						},
					},
				},
			} as any,
		})

		expect(preview.previewReady).toBe(true)
		expect(preview.items.map((item) => item.key)).toEqual([
			"departure",
			"free_cancellation",
			"before_cutoff",
			"after_cutoff",
		])
		expect(preview.items[1].value).toContain("martes, 6 de octubre de 2026 a las 09:00")
		expect(JSON.stringify(preview)).not.toContain("property_local")
	})

	it("no promete cancelación gratuita para una tarifa no reembolsable", () => {
		const preview = buildTourPolicyCategoryPreview({
			category: "Cancellation",
			context: { ...context, departureDate: null },
			snapshot: {
				cancellation: {
					calculation: {
						cancellation: {
							freeCancellationDeadlineLocal: null,
							refundTiers: [{ hoursBeforeDeparture: 0, refundPercent: 0 }],
						},
					},
				},
			} as any,
		})

		expect(preview.items.map((item) => item.label)).not.toContain("Cancelación gratuita")
		expect(preview.items[0]).toMatchObject({ value: "No reembolsable" })
	})

	it("explica la regla relativa cuando todavía no hay fechas abiertas", () => {
		const preview = buildTourPolicyCategoryPreview({
			category: "Cancellation",
			context: { ...context, departureDate: null },
			snapshot: {
				cancellation: {
					calculation: {
						cancellation: {
							freeCancellationDeadlineLocal: "2026-10-06T09:00:00[property_local]",
							refundTiers: [
								{ hoursBeforeDeparture: 24, refundPercent: 100 },
								{ hoursBeforeDeparture: 0, refundPercent: 0 },
							],
						},
					},
				},
			} as any,
		})

		expect(preview.items[0].value).toBe("No hay fechas futuras con cupo para esta salida.")
		expect(preview.items[1].value).toBe("Hasta 24 horas antes de la salida")
		expect(JSON.stringify(preview)).not.toContain("2026-10-06")
	})

	it("presenta disponibilidad como el siguiente paso durante la guía", () => {
		const preview = buildTourPolicyCategoryPreview({
			category: "Cancellation",
			context: {
				...context,
				departureDate: null,
				availabilityStepIsNext: true,
				configuredCancellationTiers: [
					{
						hoursBeforeDeparture: 24,
						penaltyType: "percentage",
						penaltyAmount: 0,
					},
				],
			},
			snapshot: {
				cancellation: {
					calculation: {
						cancellation: {
							freeCancellationDeadlineLocal: null,
							refundTiers: [
								{ hoursBeforeDeparture: 24, refundPercent: 100 },
								{ hoursBeforeDeparture: 0, refundPercent: 0 },
							],
						},
					},
				},
			} as any,
		})

		expect(preview.items[0]).toMatchObject({
			label: "Próximo paso",
			value: "Se configura en el siguiente paso de la guía.",
		})
		expect(preview.items[1].value).toBe("Hasta 24 horas antes de la salida")
		expect(JSON.stringify(preview)).not.toContain("No hay fechas futuras")
	})

	it("no llama gratuita a una cancelación con reembolso parcial", () => {
		const preview = buildTourPolicyCategoryPreview({
			category: "Cancellation",
			context,
			snapshot: {
				cancellation: {
					calculation: {
						cancellation: {
							freeCancellationDeadlineLocal: null,
							refundTiers: [{ hoursBeforeDeparture: 0, refundPercent: 50 }],
						},
					},
				},
			} as any,
		})

		expect(preview.items.map((item) => item.label)).not.toContain("Cancelación gratuita")
		expect(preview.items[1]).toMatchObject({ value: "50% de reembolso" })
	})
})
