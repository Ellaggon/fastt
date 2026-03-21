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
