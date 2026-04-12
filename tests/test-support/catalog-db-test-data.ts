// Integration-test-only helpers. Tests should not import "astro:db" directly;
// this file centralizes minimal seeding needed for catalog flows.
import { and, db, eq, Provider, ProviderUser, RoomType, User } from "astro:db"

export async function upsertProvider(row: {
	id: string
	legalName?: string | null
	displayName?: string | null
	ownerEmail?: string | null
}) {
	const legalName = String(row.legalName ?? row.displayName ?? `Provider ${row.id}`).trim()
	const displayName = String(row.displayName ?? row.legalName ?? `Provider ${row.id}`).trim()

	await db
		.insert(Provider)
		.values({
			id: row.id,
			legalName,
			displayName,
			status: "draft",
		})
		.onConflictDoUpdate({
			target: [Provider.id],
			set: {
				legalName,
				displayName,
			},
		})

	const email = String(row.ownerEmail ?? "")
		.trim()
		.toLowerCase()
	if (!email) return

	const existingUser = await db
		.select({ id: User.id })
		.from(User)
		.where(eq(User.email, email))
		.get()
	const userId = existingUser?.id ?? `user_${email}`
	if (!existingUser?.id) {
		await db.insert(User).values({ id: userId, email }).onConflictDoNothing()
	}

	const link = await db
		.select({ id: ProviderUser.id })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, row.id), eq(ProviderUser.userId, userId)))
		.get()
	if (link?.id) return

	await db.insert(ProviderUser).values({
		id: crypto.randomUUID(),
		providerId: row.id,
		userId,
		role: "owner",
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
