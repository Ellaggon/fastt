import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ count: 1, select: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()),
	db: { select: state.select },
}))
vi.mock("@/lib/marketplace/publicDestinationListings", () => ({
	resolvePublicDestination: vi.fn(),
}))
import { getPublicTourCatalog } from "@/lib/tours/publicTourCatalog"
beforeEach(() => {
	state.select.mockReset()
	state.select.mockImplementation((fields) => {
		const rows =
			"experienceFormat" in fields
				? Array.from({ length: state.count }, (_, index) => ({
						productId: String(index),
						name: "Experiencia",
						experienceFormat: index % 2 ? "class" : "guided_tour",
						duration: "1 hora",
						difficultyLevel: "easy",
						description: "Actividad",
						reviewCount: 0,
					}))
				: []
		const query: any = {
			from: () => query,
			innerJoin: () => query,
			leftJoin: () => query,
			where: () => query,
			limit: () => query,
			groupBy: () => query,
			orderBy: () => query,
			then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
		}
		return query
	})
})
it.each([1, 12])("reads formats for %i cards in the same two batched queries", async (count) => {
	state.count = count
	const catalog = await getPublicTourCatalog({ limit: 20 })
	expect(catalog.cards).toHaveLength(count)
	expect(state.select).toHaveBeenCalledTimes(2)
	expect(catalog.cards[0]).toMatchObject({ experienceFormat: "guided_tour" })
	if (count > 1)
		expect(catalog.cards[1]).toMatchObject({ experienceFormat: "class", difficultyLevel: null })
})
