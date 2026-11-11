import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Review from "@/components/admin/CommercialPolicyPackageReview.astro"

it("shows the ratified package without offering another approval", async () => {
	const html = await (
		await AstroContainer.create()
	).renderToString(Review, {
		props: {
			versions: [
				{
					id: "published",
					label: "Empresa",
					version: 1,
					status: "published",
					holderType: "entidad",
				},
			],
			canApprove: false,
		},
	})
	expect(html).toContain("1 versiones publicadas · 0 borradores")
	expect(html).toContain("Sin borradores pendientes de ratificación")
	expect(html).not.toContain("Revisar paquete")
})
it("offers draft selection and explicit confirmation of all three areas", async () => {
	const html = await (
		await AstroContainer.create()
	).renderToString(Review, {
		props: {
			versions: [
				{ id: "draft", label: "Guía", version: 2, status: "draft", holderType: "persona_natural" },
			],
			canApprove: true,
		},
	})
	expect(html).toContain('name="packageVersion"')
	expect(html).toContain("Revisar paquete")
	expect(html).toContain("Políticas revisadas")
	expect(html).toContain("Finanzas revisadas")
	expect(html).toContain("Operaciones Tours revisadas")
})
