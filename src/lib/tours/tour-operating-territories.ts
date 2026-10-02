/** Operational declaration codes, independent of geography IDs and policy approval. */
export const tourOperatingTerritories = [
	{ code: "BO-BN", label: "Beni, Bolivia" },
	{ code: "BO-CH", label: "Chuquisaca, Bolivia" },
	{ code: "BO-CB", label: "Cochabamba, Bolivia" },
	{ code: "BO-LP", label: "La Paz, Bolivia" },
	{ code: "BO-OR", label: "Oruro, Bolivia" },
	{ code: "BO-PN", label: "Pando, Bolivia" },
	{ code: "BO-PT", label: "Potosí, Bolivia" },
	{ code: "BO-SC", label: "Santa Cruz, Bolivia" },
	{ code: "BO-TJ", label: "Tarija, Bolivia" },
] as const

export function tourOperatingTerritory(code: string | null | undefined) {
	return tourOperatingTerritories.find((territory) => territory.code === code) ?? null
}
