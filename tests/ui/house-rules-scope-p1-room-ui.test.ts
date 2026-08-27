import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/house-rules P1 room editor", () => {
	it("renders variant override rows with inherited, exception, and remove on ?variantId=", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const row = read("src/components/house-rules/HouseRuleVariantOverrideRow.astro")
		const presentation = read("src/modules/house-rules/presentation/houseRulePresentation.ts")

		expect(presentation).toContain("spaceVariantEditorTypes")
		expect(presentation).toContain('"Smoking"')
		expect(presentation).toContain('"Access"')
		expect(presentation).toContain('"ExtraBeds"')
		expect(presentation).toContain('"Safety"')
		expect(presentation).toContain('"Pets"')

		expect(page).toContain("HouseRuleVariantOverrideRow")
		expect(page).toContain("data-house-rules-variant-editor")
		expect(page).toContain("listEffectiveHouseRules")
		expect(page).toContain('scope: "variant"')
		expect(page).toContain("spaceVariantEditorTypes.map")
		expect(page).toContain("override-saved")
		expect(page).toContain("override-removed")
		expect(page).toContain("findOwnedHouseRule")
		expect(page).toContain('from "astro:transitions/client"')
		expect(page).toContain("data-house-rules-workspace")

		expect(row).toContain("data-house-rule-inherited-block")
		expect(row).toContain("Heredada del alojamiento")
		expect(row).toContain("data-house-rule-override-block")
		expect(row).toContain("Excepción de este espacio")
		expect(row).toContain("Quitar excepción")
		expect(row).toContain("Crear excepción")
		expect(row).toContain('name="scope" value="variant"')
		expect(row).toContain('data-house-rule-variant-mode={hasOverride ? "override" : "inherited"}')
	})

	it("keeps hotel editor and quick setups out of space context", () => {
		const page = read("src/pages/provider/house-rules.astro")

		expect(page).toContain("isSpaceContext && spaceContext ? (")
		expect(page).toContain("Excepciones de {spaceContext.name}")
		expect(page).not.toContain("aún no hay excepciones por habitación")
		expect(page).toContain("Aquí solo excepciones puntuales")
	})
})
