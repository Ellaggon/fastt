export const BED_TYPES = [
	{ id: "single", name: "Single" },
	{ id: "twin", name: "Twin" },
	{ id: "double", name: "Double" },
	{ id: "queen", name: "Queen" },
	{ id: "king", name: "King" },
	{ id: "california_king", name: "California King" },
	{ id: "sofa_bed", name: "Sofá cama" },
	{ id: "bunk_bed", name: "Litera" },
	{ id: "rollaway", name: "Cama extra (movible)" },
	{ id: "crib", name: "Cuna" },
] as const

export function formatBedType(bedType: any) {
	if (!bedType) return "Tipo de cama"

	let parsed = bedType

	if (typeof bedType === "string") {
		try {
			parsed = JSON.parse(bedType)
		} catch {
			return "Tipo de cama"
		}
	}

	if (!Array.isArray(parsed)) return "Tipo de cama"

	return parsed
		.map((b) => {
			const def = BED_TYPES.find((t) => t.id === b.id)
			return `${b.count} ${def ? def.name : b.id}`
		})
		.join(", ")
}
