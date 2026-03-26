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

// import type {
// 	DestinationQueryRepositoryPort,
// 	DestinationRow,
// } from "../ports/DestinationQueryRepositoryPort"

// function capitalizeWords(text: string | null | undefined): string {
// 	if (!text) return ""
// 	return text
// 		.toLowerCase()
// 		.split(" ")
// 		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
// 		.join(" ")
// }

// function formatDestinationRow(r: DestinationRow): DestinationRow {
// 	return {
// 		...r,
// 		department: capitalizeWords(r.department),
// 		country: capitalizeWords(r.country),
// 		name: capitalizeWords(r.name),
// 	}
// }

// export function createSearchDestinationsQuery(deps: { repo: DestinationQueryRepositoryPort }) {
// 	return async function searchDestinations(params: { q: string; limit: number }) {
// 		const q = (params.q || "").trim()
// 		const limit = Math.min(Number(params.limit || 10), 50)

// 		// Main behavior: search when q is present, otherwise list.
// 		const results = q ? await deps.repo.search({ q, limit }) : await deps.repo.list({ limit })
// 		if (process.env.DESTINATIONS_DEBUG === "1") {
// 			// Diagnostic mode: compare list() vs search() to detect DB/runtime mismatches.
// 			// This adds extra queries ONLY when debugging.
// 			const listProbe = await deps.repo.list({ limit: 5 })
// 			const searchProbe = q ? await deps.repo.search({ q, limit: 5 }) : []

// 			console.info("[destinations] input", { q, limit })
// 			console.info("[destinations] list_probe_count", listProbe.length)
// 			console.info("[destinations] list_probe_sample", listProbe.slice(0, 5))
// 			console.info("[destinations] search_probe_count", searchProbe.length)
// 			console.info("[destinations] search_probe_sample", searchProbe.slice(0, 5))

// 			// Log raw rows before formatting/mapping.
// 			console.info("[destinations] raw_count", results.length)
// 			console.info("[destinations] raw_sample", results.slice(0, 5))
// 		}
// 		return results.map(formatDestinationRow)
// 	}
// }
