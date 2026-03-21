import type {
	DestinationQueryRepositoryPort,
	DestinationRow,
} from "../ports/DestinationQueryRepositoryPort"

function capitalizeWords(text: string | null | undefined): string {
	if (!text) return ""
	return text
		.toLowerCase()
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

function formatDestinationRow(r: DestinationRow): DestinationRow {
	return {
		...r,
		department: capitalizeWords(r.department),
		country: capitalizeWords(r.country),
		name: capitalizeWords(r.name),
	}
}

export function createSearchDestinationsQuery(deps: { repo: DestinationQueryRepositoryPort }) {
	return async function searchDestinations(params: { q: string; limit: number }) {
		const q = (params.q || "").trim()
		const limit = Math.min(Number(params.limit || 10), 50)

		const results = q ? await deps.repo.search({ q, limit }) : await deps.repo.list({ limit })
		return results.map(formatDestinationRow)
	}
}
