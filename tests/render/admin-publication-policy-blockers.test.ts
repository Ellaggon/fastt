import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Panel from "@/components/admin/ProviderPublicationPolicyBlockers.astro"

it("links to policy administration with the provider context, never an approval action", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Panel, {
		props: {
			providerId: "provider-test",
			blockers: [
				{
					code: "policy_context_unsupported_holder",
					label: "Titular del negocio",
					products: [{ id: "tour", name: "Tour" }],
				},
			],
		},
	})
	expect(html).toContain("/admin/commercial-policies?providerId=provider-test")
	expect(html).toContain("Revisar políticas aplicables")
	expect(html).not.toContain("<form")
})

it("does not claim success or offer approvals on a failed read", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Panel, {
		props: { providerId: "provider-test", blockers: [], failed: true },
	})
	expect(html).toContain("No se pudieron comprobar")
	expect(html).not.toContain("Revisar políticas aplicables")
})
