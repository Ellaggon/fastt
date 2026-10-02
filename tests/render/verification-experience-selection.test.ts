import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Nav from "@/components/provider/ProviderVerificationBusinessNav.astro"
import { resolveVerificationNavigation } from "@/lib/verification/navigation"

it("keeps an invalid explicit experience empty and provides a recovery selection", async () => {
	const url = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=activity&experience=foreign&returnTo=%2Fproduct%2Fa%2Fpreview"
	)
	const navigation = resolveVerificationNavigation({
		url,
		lines: ["tour"],
		experienceIds: ["mine"],
		fasttCollects: false,
	})
	const container = await AstroContainer.create()
	const html = await container.renderToString(Nav, {
		props: { url, navigation, products: [{ id: "mine", name: "Mi tour" }] },
	})
	expect(html).toContain("La experiencia del enlace no está disponible")
	expect(html).toMatch(/value=""[^>]*selected/)
	expect(html).not.toMatch(/value="mine"[^>]*selected/)
	expect(html).toContain("Ver experiencia")
	expect(html).toContain('name="returnTo" value="/product/a/preview"')
})
