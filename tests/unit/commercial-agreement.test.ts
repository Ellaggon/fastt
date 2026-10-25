import { describe, expect, it } from "vitest"
import {
	agreementTermsSchema,
	agreementValidity,
	agreementReturnTo,
} from "@/modules/financial/domain/commercial-agreement"
const terms = {
	commissionPercent: "12",
	commissionBase: "Importe del servicio cobrado y no devuelto, sin impuestos separados.",
	currency: "USD",
	effectiveFrom: "2026-01-01",
	effectiveTo: "2030-12-31",
	paymentTiming: "El proveedor cobra al viajero antes de la actividad.",
	cancellationTerms: "Se aplican las condiciones de la oferta aceptadas al reservar.",
	settlementTerms: "Conciliación mensual según los cobros acreditados del periodo.",
	fiscalResponsibilities:
		"El vendedor emite el documento del servicio; Fastt documenta su comisión.",
	fullTerms:
		"Condiciones contractuales de prueba para un acuerdo de cobro directo entre el proveedor y Fastt. No constituye una propuesta real.",
	documentReference: "fixture-contract-v1",
}
describe("commercial agreement contract", () => {
	it("requires an explicit rate, real dates and a complete proposal", () => {
		expect(agreementTermsSchema.parse(terms).commissionPercent).toBe(12)
		expect(agreementTermsSchema.safeParse({ ...terms, commissionPercent: "" }).success).toBe(false)
		expect(agreementTermsSchema.safeParse({ ...terms, effectiveTo: "2025-12-31" }).success).toBe(
			false
		)
	})
	it("acceptance, identity, collection and validity must all hold", () => {
		const value = {
			status: "accepted",
			acceptedAt: new Date(),
			identityMatches: true,
			collectionModel: "property_collect",
			effectiveFrom: "2026-01-01",
			effectiveTo: "2030-12-31",
			now: new Date("2026-10-24T12:00:00Z"),
		}
		expect(agreementValidity(value)).toBe("active")
		expect(agreementValidity({ ...value, status: "offered" })).toBe("acceptance_required")
		expect(agreementValidity({ ...value, identityMatches: false })).toBe("review_required")
		expect(agreementValidity({ ...value, collectionModel: "undecided" })).toBe("review_required")
		expect(agreementValidity({ ...value, effectiveTo: "2026-01-01" })).toBe("expired")
		expect(
			agreementValidity({
				...value,
				effectiveTo: "2026-10-24",
				now: new Date("2026-10-25T01:00:00Z"),
				timeZone: "America/La_Paz",
			})
		).toBe("active")
	})
	it("preserves publication selection and blocks external returns", () => {
		expect(
			agreementReturnTo(
				"/product/tour-a/preview?playbook=complete-to-publish&variantId=v&result=saved"
			)
		).toBe("/product/tour-a/preview?playbook=complete-to-publish&variantId=v")
		for (const value of [
			"//evil.test",
			"https://evil.test",
			"/api/auth/logout",
			"/admin/providers",
		])
			expect(agreementReturnTo(value)).toBeNull()
	})
})
