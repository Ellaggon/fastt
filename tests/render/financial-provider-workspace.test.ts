import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Workspace from "@/components/financial/FinancialUnifiedWorkspace.astro"
import ContractCard from "@/components/provider/ProviderCommercialContractCard.astro"
import type { ProviderContractSurface } from "@/lib/commercial-policy/provider-contract-surface"
const scope = {
	valid: true,
	vertical: "tour",
	line: "tour",
	productIds: ["a"],
	product: null,
	vocabulary: {},
	availableVerticals: ["tour"],
}
it.each(["/financial", "/financial/collections", "/financial/settlements", "/financial/refunds"])(
	"%s renders the same header, summary and scoped destinations",
	async (path) => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Workspace, {
			props: { scope },
			request: new Request(`http://local${path}?scope=tour`),
		})
		expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("data-financial-contract-summary"))
		expect(html).toContain("Condiciones comerciales")
		expect(html).toContain("Pendientes")
		expect(html).toContain("Devoluciones")
		expect(html).toContain("data-financial-secondary-nav")
		expect(html).toContain("/financial/collections?scope=tour")
		expect(html).not.toContain("Se declara por línea")
		expect(html).toContain("data-financial-load-retry")
	}
)
it("contract detail explains a common reason once, with names and an action", async () => {
	const reason = {
		code: "policy_context_unsupported_holder",
		message: "Solicita revisión de esta combinación.",
		owner: "fastt" as const,
		policyVersionId: null,
		action: { label: "Consultar con Fastt", href: "/provider/support?line=tour" },
	}
	const model: ProviderContractSurface = {
		offerings: ["a", "b", "c"].map((id) => ({
			productId: id,
			name: `Experiencia ${id}`,
			commercialLine: "tour",
			verticalLabel: "Experiencia",
			collectionModel: "undecided",
			collectionModelLabel: "Por definir",
			country: "BO",
			status: "unsupported",
			statusLabel: "Condiciones por definir",
			detail: reason.message,
			reasons: [reason],
			primaryAction: reason.action,
			platformCollectionAvailable: false,
			platformPayoutAvailable: false,
		})),
	}
	const container = await AstroContainer.create()
	const html = await container.renderToString(ContractCard, { props: { model } })
	expect(
		html.split("Fastt debe definir las condiciones comerciales aplicables a estas ofertas.")
	).toHaveLength(2)
	expect(html.replace(/\s+/g, " ")).toContain("3 ofertas afectadas")
	for (const id of ["a", "b", "c"]) expect(html).toContain(`Experiencia ${id}`)
	expect(html).toContain("Consultar con Fastt")
})
