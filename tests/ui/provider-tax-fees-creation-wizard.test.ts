import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("the fiscal definition wizard ends creation as an unpublished draft", () => {
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

	expect(wizard).toContain('{ id: 1, title: "Tipo y nombre" }')
	expect(wizard).toContain('{ id: 2, title: "Cálculo" }')
	expect(wizard).toContain('{ id: 3, title: "Jurisdicción y condiciones" }')
	expect(wizard).toContain('{ id: 4, title: "Revisar y guardar" }')
	expect(wizard).not.toContain('{ id: 5, title: "Revisión y publicación" }')
	expect(wizard).toContain("Guardar borrador")
	expect(wizard).toContain("Todavía no afecta precios ni reservas.")
	expect(wizard).toContain("Comprobar en Simulador")
	expect(wizard).toContain("Comprueba cómo se cobrará al huésped")
	expect(wizard).toContain("Definición creada")
	expect(wizard).toContain("Después podrás publicar y asignar la definición.")
})

test("the wizard protects unfinished work and warns about likely duplicates", () => {
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

	expect(wizard).toContain("CREATION_DRAFT_STORAGE_KEY")
	expect(wizard).toContain("window.sessionStorage.setItem")
	expect(wizard).toContain("Recuperamos tu progreso")
	expect(wizard).toContain("potentialDuplicates")
	expect(wizard).toContain("Puede que esta definición ya exista")
	expect(wizard).toContain("Selecciona un país")
})
