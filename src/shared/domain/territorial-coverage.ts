export type TerritoryAncestors = Record<string, readonly string[]>

/** Coverage is directional: a city never authorizes its parent department. */
export function territoryIsCovered(
	placeId: string,
	coverage: readonly string[],
	ancestors: TerritoryAncestors = {}
): boolean {
	return (
		coverage.includes(placeId) || (ancestors[placeId] ?? []).some((id) => coverage.includes(id))
	)
}

export function allTerritoriesCovered(
	places: readonly string[],
	coverage: readonly string[],
	ancestors: TerritoryAncestors = {}
): boolean {
	return places.length > 0 && places.every((id) => territoryIsCovered(id, coverage, ancestors))
}
