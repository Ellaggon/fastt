export const BED_TYPES = [
	{ id: "single", name: "Simple", plural: "Simples" },
	{ id: "twin", name: "índividual o twin", plural: "Índividuales o twin" },
	{ id: "double", name: "Doble", plural: "Dobles" },
	{ id: "queen", name: "Queen - matrimonial grande", plural: "Queen - matrimonial grande" },
	{
		id: "king",
		name: "King - Matrimonial extra grande",
		plural: "King - Matrimonial extra grande",
	},
	{ id: "california_king", name: "California king", plural: "California king" },
	{ id: "sofa_bed", name: "Sofá cama", plural: "Sofás cama" },
	{ id: "bunk_bed", name: "Litera", plural: "Literas" },
	{ id: "rollaway", name: "Cama extra (movible)", plural: "Camas extras (movibles)" },
	{ id: "crib", name: "Cuna", plural: "Cunas" },
] as const

type BedInput =
	| string
	| {
			id: string
			count: number
	}[]

export function formatBedType(bedType: BedInput) {
	if (!bedType) return "Tipo de cama"

	let parsed: { id: string; count: number }[]

	if (typeof bedType === "string") {
		try {
			parsed = JSON.parse(bedType)
		} catch {
			return "Tipo de cama"
		}
	} else { parsed = bedType }

	if (!Array.isArray(parsed) || parsed.length === 0) return "Tipo de cama"

	return parsed
		.map(({ id, count }) => {
			const def = BED_TYPES.find((t) => t.id === id)

			if (!def) {
				return `${count} ${count === 1 ? "unidad" : "unidades"}`
			}

			// Casos como cuna (no llevan "cama")
			const usesCama = id !== "crib" && !def.name.includes("cama") ? true : false
			const label = count === 1 ? def.name : def.plural

			if (!usesCama) {
				return `${count} ${label}`
			}

			return `${count} ${count === 1 ? "cama" : "camas"} ${label}`
		})
		.join("\n")
}
