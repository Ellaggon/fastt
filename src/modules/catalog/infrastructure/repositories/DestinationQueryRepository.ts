import { db, Destination, sql } from "astro:db"
import type {
	DestinationQueryRepositoryPort,
	DestinationRow,
} from "../../application/ports/DestinationQueryRepositoryPort"

export class DestinationQueryRepository implements DestinationQueryRepositoryPort {
	async list(params: { limit: number }): Promise<DestinationRow[]> {
		return (await db
			.select()
			.from(Destination)
			.limit(params.limit)
			.all()) as unknown as DestinationRow[]
	}

	async search(params: { q: string; limit: number }): Promise<DestinationRow[]> {
		const pattern = `%${params.q.toLowerCase()}%`
		return (await db
			.select()
			.from(Destination)
			.where(
				sql`(lower(${Destination.name}) LIKE ${pattern} OR lower(${Destination.slug}) LIKE ${pattern} OR lower(${Destination.department}) LIKE ${pattern})`
			)
			.limit(params.limit)
			.all()) as unknown as DestinationRow[]
	}
}

// import { db, dbUrl, Destination, ilike, or } from "astro:db"
// import type {
// 	DestinationQueryRepositoryPort,
// 	DestinationRow,
// } from "../../application/ports/DestinationQueryRepositoryPort"

// export class DestinationQueryRepository implements DestinationQueryRepositoryPort {
// 	async list(params: { limit: number }): Promise<DestinationRow[]> {
// 		const rows = (await db
// 			.select()
// 			.from(Destination)
// 			.limit(params.limit)
// 			.all()) as unknown as DestinationRow[]
// 		if (process.env.DESTINATIONS_DEBUG === "1") {
// 			console.info("[destinations][repo] dbUrl", dbUrl)
// 			console.info("[destinations][repo] list_count", rows.length)
// 			console.info("[destinations][repo] list_sample", rows.slice(0, 5))
// 		}
// 		return rows
// 	}

// 	async search(params: { q: string; limit: number }): Promise<DestinationRow[]> {
// 		// Prefer astro:db predicates over raw SQL. The previous raw `sql\`...\``
// 		// where-clause interpolated column objects and could silently generate a
// 		// predicate that never matches depending on the runtime.
// 		const pattern = `%${params.q}%`
// 		const rows = (await db
// 			.select()
// 			.from(Destination)
// 			.where(
// 				or(
// 					ilike(Destination.name, pattern),
// 					ilike(Destination.slug, pattern),
// 					ilike(Destination.department, pattern)
// 				)
// 			)
// 			.limit(params.limit)
// 			.all()) as unknown as DestinationRow[]
// 		if (process.env.DESTINATIONS_DEBUG === "1") {
// 			console.info("[destinations][repo] dbUrl", dbUrl)
// 			console.info("[destinations][repo] search_input", { q: params.q, limit: params.limit })
// 			console.info("[destinations][repo] search_pattern", pattern)
// 			console.info("[destinations][repo] search_count", rows.length)
// 			console.info("[destinations][repo] search_sample", rows.slice(0, 5))
// 		}
// 		return rows
// 	}
// }
