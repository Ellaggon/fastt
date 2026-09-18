import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../..", import.meta.url)
const source = (path: string) => readFile(new URL(path, root), "utf8")

describe("provider onboarding content", () => {
	it("uses vertical-specific, task-focused content for the identity and operations forms", async () => {
		const [business, identity, operations] = await Promise.all([
			source("src/pages/provider/onboarding/business.astro"),
			source("src/components/provider/ProviderRegisterForm.astro"),
			source("src/components/provider/ProviderProfileForm.astro"),
		])

		expect(business).toContain("Crea tu negocio para ofrecer un")
		expect(business).toContain("Paso 1 de 2")
		expect(business).toContain("Paso 2 de 2")
		expect(business).toContain("onboarding={true}")
		expect(business).toContain("Guardar y crear mi")
		expect(identity).toContain("Es el nombre que verán los viajeros.")
		expect(identity).toContain("No publica el")
		expect(identity).not.toContain("Quién cobrará al viajero")
		expect(identity).not.toContain('name="collectionModel"')
		expect(operations).toContain("Define las horas de las salidas o la disponibilidad.")
		expect(operations).toContain("Te lo pedimos ahora para dejarlo listo antes de publicar")
	})

	it("keeps publication requirements actionable at the offer preview", async () => {
		const [business, preview] = await Promise.all([
			source("src/pages/provider/onboarding/business.astro"),
			source("src/pages/product/[id]/preview.astro"),
		])

		expect(business).toContain("requisitos pendientes del negocio y de la oferta")
		expect(preview).toContain("data-provider-publish-blocked")
		expect(preview).toContain("Resolver configuración")
	})
})
