export type LegalForm = {
	code: string
	country: string
	label: string
	holderType: "persona_natural" | "entidad"
}

// Classification only: these choices do not impose evidence or enable a market.
export const legalForms: readonly LegalForm[] = [
	{ code: "BO:individual", country: "BO", label: "Persona natural", holderType: "persona_natural" },
	{
		code: "BO:sole_trader",
		country: "BO",
		label: "Empresa unipersonal",
		holderType: "persona_natural",
	},
	{ code: "BO:company", country: "BO", label: "Sociedad comercial", holderType: "entidad" },
	{
		code: "BO:association",
		country: "BO",
		label: "Asociación o entidad comunitaria",
		holderType: "entidad",
	},
]
export function legalFormForCountry(code: string | null | undefined, country: string) {
	return legalForms.find((form) => form.code === code && form.country === country)
}
