import { describe, expect, it } from "vitest"
import { resolveProductPreparationCoach } from "@/lib/playbook/product-preparation-coach"

describe("resolveProductPreparationCoach", () => {
	it("maps guest-rules as the next requirement with a single CTA", () => {
		const coach = resolveProductPreparationCoach({
			readyToPublish: false,
			nextStepLabel: "Reglas para huéspedes",
			continuePreparationHref: "/product/hotel-sol/house-rules",
			previewHref: "/product/hotel-sol/preview",
		})
		expect(coach.badge).toBe("En curso")
		expect(coach.label).toBe("Reglas para huéspedes")
		expect(coach.body).toBe("Qué esperar durante la estadía.")
		expect(coach.cta).toBe("Revisar reglas")
		expect(coach.href).toBe("/product/hotel-sol/house-rules")
	})

	it("prefers live body and CTA when provided", () => {
		const coach = resolveProductPreparationCoach({
			readyToPublish: false,
			nextStepLabel: "Condiciones de reserva",
			nextStepBody: "Cancelación, pago y reglas comerciales que acepta el huésped",
			nextStepCta: "Revisar tarifas",
			continuePreparationHref: "/rates",
			previewHref: "/preview",
		})
		expect(coach.body).toBe("Cancelación, pago y reglas comerciales que acepta el huésped.")
		expect(coach.cta).toBe("Revisar tarifas")
	})

	it("switches to the ready state", () => {
		const coach = resolveProductPreparationCoach({
			readyToPublish: true,
			nextStepLabel: null,
			continuePreparationHref: "/product/hotel-sol/content",
			previewHref: "/product/hotel-sol/preview",
		})
		expect(coach.badge).toBe("Lista")
		expect(coach.label).toBe("Listo para publicar")
		expect(coach.cta).toBe("Ir a vista previa")
		expect(coach.href).toBe("/product/hotel-sol/preview")
	})
})
