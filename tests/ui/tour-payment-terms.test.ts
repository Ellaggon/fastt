import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../..", import.meta.url)
const source = (path: string) => readFile(new URL(path, root), "utf8")

describe("tour payment terms UI", () => {
	it("keeps tour payment with the provider and explains it before a hold", async () => {
		const [conditions, guest, summary, assignment] = await Promise.all([
			source("src/components/policy/RatePlanPoliciesSurface.astro"),
			source("src/components/tours/TourDepartureSection.astro"),
			source("src/pages/api/tours/selection-summary.ts"),
			source("src/components/policy/PolicyAssignmentFlow.astro"),
		])

		expect(conditions).toContain("Pago al proveedor")
		expect(conditions).toContain("Confirmar pago al proveedor")
		expect(guest).toContain("recibe: ${payload.payment.recipient}")
		expect(guest).toContain("Cancelación")
		expect(summary).toContain("buildTourPaymentTerms")
		expect(assignment).toContain("El prepago no está disponible en Fastt todavía.")
		expect(assignment).toContain("provider_at_experience_only")
	})
})
