// Integration-test-only helpers. Tests should not import "astro:db" directly;
// this file centralizes minimal seeding needed for catalog flows.
import { db, RoomType, Provider } from "astro:db"

export async function upsertProvider(row: {
	id: string
	companyName: string
	userEmail?: string | null
}) {
	await db
		.insert(Provider)
		.values({
			id: row.id,
			companyName: row.companyName,
			userEmail: row.userEmail ?? null,
		})
		.onConflictDoUpdate({
			target: [Provider.id],
			set: {
				companyName: row.companyName,
				userEmail: row.userEmail ?? null,
			},
		})
}

export async function upsertRoomType(row: {
	id: string
	name: string
	maxOccupancy: number
	description?: string | null
}) {
	await db
		.insert(RoomType)
		.values({
			id: row.id,
			name: row.name,
			maxOccupancy: row.maxOccupancy,
			description: row.description ?? null,
		})
		.onConflictDoUpdate({
			target: [RoomType.id],
			set: {
				name: row.name,
				maxOccupancy: row.maxOccupancy,
				description: row.description ?? null,
			},
		})
}
