import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Summary from "@/components/admin/ProviderCommercialAgreementSummary.astro"

describe("admin commercial agreement summary", () => {
	it.each([true, false])(
		"links to one existing workspace and never authorizes from the bank review (canOffer=%s)",
		async (canOffer) => {
			const container = await AstroContainer.create()
			const html = await container.renderToString(Summary, {
				props: {
					canOffer,
					model: {
						providerId: "provider-a",
						collectionModel: "property_collect",
						label: "Propuesta solicitada",
						next: "Fastt debe preparar y autorizar la propuesta.",
						action: "Preparar propuesta",
						actionable: true,
					},
				},
			})
			expect(html).toContain("/admin/commercial-agreements?providerId=provider-a")
			expect(html).toContain(canOffer ? "Preparar propuesta" : "Consultar solicitud")
			expect(html).toContain("Cobro directo confirmado por el proveedor")
			expect(html).not.toContain("<form")
			expect(html).not.toContain("Aceptar acuerdo")
		}
	)
})
