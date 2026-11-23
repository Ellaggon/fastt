export interface CatalogPlace {
	id: string
	name: string
	country: string
	parentId: string | null
	placeType: string
}
export interface CatalogTerritoryNode {
	id: string
	label: string
	parentId: string | null
	kind: string
}
export function catalogTerritoryPath(id: string, nodes: CatalogTerritoryNode[]) {
	const parts: string[] = []
	const visited = new Set<string>()
	let node = nodes.find((item) => item.id === id)
	while (node && !visited.has(node.id)) {
		visited.add(node.id)
		parts.unshift(node.label)
		node = nodes.find((item) => item.id === node!.parentId)
	}
	return parts.join(" → ")
}
export function catalogTerritorySelection(id: string, nodes: CatalogTerritoryNode[]) {
	const path = catalogTerritoryPath(id, nodes)
	if (!id) return "Todos los territorios"
	if (!path) return "Territorio seleccionado"
	return id.startsWith("country:") ? `${path} · Todos sus territorios` : path
}
export function buildCatalogTerritoryTree(places: CatalogPlace[], countries: string[]) {
	const countryNames = new Intl.DisplayNames(["es"], { type: "region" })
	const ids = new Set(places.map((place) => place.id))
	const nodes: CatalogTerritoryNode[] = [...new Set(countries)].sort().map((country) => ({
		id: `country:${country}`,
		label: countryNames.of(country) ?? country,
		parentId: null,
		kind: "País",
	}))
	const kinds: Record<string, string> = {
		admin_area_1: "Región",
		admin_area_2: "Provincia",
		city: "Ciudad",
		locality: "Localidad",
		natural_area: "Área natural",
		poi: "Lugar",
	}
	for (const place of places) {
		if (place.placeType === "country") continue
		nodes.push({
			id: place.id,
			label: place.name,
			parentId:
				place.parentId &&
				ids.has(place.parentId) &&
				places.find((item) => item.id === place.parentId)?.placeType !== "country"
					? place.parentId
					: `country:${place.country}`,
			kind: kinds[place.placeType] ?? "Territorio",
		})
	}
	return nodes.sort((a, b) => a.label.localeCompare(b.label, "es"))
}

/** Catalog exploration includes descendants, not a judgment of policy applicability. */
export function matchesCatalogTerritory(
	selected: string,
	country: string,
	scopes: string[],
	ancestors: Record<string, readonly string[]>
) {
	if (!selected) return true
	if (selected.startsWith("country:")) return selected === `country:${country}`
	return scopes.some((id) => id === selected || ancestors[id]?.includes(selected))
}
