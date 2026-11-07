import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"

it("retires generic tour archive submission without deleting lodging or historical access", async () => {
	const route = await readFile("src/pages/provider/settings/verification/documents.astro", "utf8")
	const component = await readFile(
		"src/components/provider/ProviderVerificationOptionals.astro",
		"utf8"
	)
	expect(route).toContain('navigation.line === "tour"')
	expect(route.match(/readOnlyArchive=\{readOnlyTourArchive\}/g)).toHaveLength(2)
	expect(component).toContain("!readOnlyArchive && canManageDocuments && uploadTypes.length")
	expect(component).toContain("Abrir archivo seguro")
	expect(route).not.toContain("packTypes.has(doc.type)")
	expect(component).toContain("OperatingTerritoryPicker")
	expect(component).not.toContain('placeholder="BO-LP o código de permiso"')
})
