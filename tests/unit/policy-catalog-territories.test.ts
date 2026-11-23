import { expect, it } from "vitest"
import {
	catalogTerritorySelection,
	catalogTerritoryPath,
	buildCatalogTerritoryTree,
	matchesCatalogTerritory,
} from "@/lib/commercial-policy/catalog-territories"

it("distinguishes country-wide browsing from local policy scope",()=>{
	const nodes=buildCatalogTerritoryTree([{id:"lp",name:"La Paz",country:"BO",parentId:null,placeType:"admin_area_1"}],["BO"])
	expect(catalogTerritorySelection("country:BO",nodes)).toBe("Bolivia · Todos sus territorios")
	expect(catalogTerritoryPath("lp",nodes)).toBe("Bolivia → La Paz")
	expect(catalogTerritorySelection("",nodes)).toBe("Todos los territorios")
	expect(catalogTerritoryPath("unknown",nodes)).toBe("")
})

it("groups only catalog places under countries without duplicating country records", () => {
	const tree = buildCatalogTerritoryTree(
		[
			{ id: "bo", name: "Bolivia", country: "BO", parentId: null, placeType: "country" },
			{ id: "lp", name: "La Paz", country: "BO", parentId: "bo", placeType: "admin_area_1" },
			{ id: "city", name: "La Paz", country: "BO", parentId: "lp", placeType: "city" },
		],
		["BO", "BO"]
	)
	expect(tree).toHaveLength(3)
	expect(tree.find((n) => n.id === "country:BO")?.label).toBe("Bolivia")
	expect(tree.find((n) => n.id === "lp")?.parentId).toBe("country:BO")
	expect(tree.find((n) => n.id === "city")).toMatchObject({ parentId: "lp", kind: "Ciudad" })
})

it("filters exact places and descendants, but never adds national policy applicability", () => {
	const ancestors = { city: ["city", "lp", "bo"], lp: ["lp", "bo"] }
	expect(matchesCatalogTerritory("", "BO", [], ancestors)).toBe(true)
	expect(matchesCatalogTerritory("country:BO", "BO", [], ancestors)).toBe(true)
	expect(matchesCatalogTerritory("country:CL", "BO", ["lp"], ancestors)).toBe(false)
	expect(matchesCatalogTerritory("lp", "BO", ["city"], ancestors)).toBe(true)
	expect(matchesCatalogTerritory("lp", "BO", ["lp"], ancestors)).toBe(true)
	expect(matchesCatalogTerritory("city", "BO", ["lp"], ancestors)).toBe(false)
	expect(matchesCatalogTerritory("unknown", "BO", ["lp"], ancestors)).toBe(false)
})
