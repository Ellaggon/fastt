// Integration-test-only helpers. Tests use the canonical PostgreSQL schema;
// this file centralizes minimal seeding needed for catalog flows.
import {
	and,
	db,
	eq,
	GeoPlace,
	ProductStatus,
	Provider,
	ProviderUser,
	RoomType,
	User,
} from "@/shared/infrastructure/db/compat"

export async function upsertGeoPlace(row: {
	id: string
	canonicalName: string
	slug: string
	countryCode?: string
	placeType?: "city" | "locality"
	latitude?: number | null
	longitude?: number | null
}) {
	await db
		.insert(GeoPlace)
		.values({
			id: row.id,
			canonicalName: row.canonicalName,
			normalizedName: row.canonicalName.toLocaleLowerCase("es").trim(),
			slug: row.slug,
			canonicalPath: row.slug,
			countryCode: row.countryCode ?? "CL",
			placeType: row.placeType ?? "city",
			centroidLat: row.latitude ?? null,
			centroidLng: row.longitude ?? null,
			status: "active",
			source: "test",
		})
		.onConflictDoNothing()
}

export async function upsertProvider(row: {
	id: string
	legalName?: string | null
	displayName?: string | null
	ownerEmail?: string | null
	accountPurpose?: "commercial" | "internal_qa" | "integration_certification"
	dataClassification?: "production" | "demo" | "fixture"
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
			accountPurpose: row.accountPurpose ?? "commercial",
			dataClassification: row.dataClassification ?? "fixture",
		})
		.onConflictDoUpdate({
			target: [Provider.id],
			set: {
				legalName,
				displayName,
				accountPurpose: row.accountPurpose ?? "commercial",
				dataClassification: row.dataClassification ?? "fixture",
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
		.then((rows) => rows[0])
	const userId = existingUser?.id ?? `user_${email}`
	if (!existingUser?.id) {
		await db.insert(User).values({ id: userId, email }).onConflictDoNothing()
	}

	const link = await db
		.select({ id: ProviderUser.id })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, row.id), eq(ProviderUser.userId, userId)))
		.then((rows) => rows[0])
	if (link?.id) return

	await db.insert(ProviderUser).values({
		id: crypto.randomUUID(),
		providerId: row.id,
		userId,
		role: "owner",
	})
}

export async function upsertPublishedProductStatus(productId: string) {
	await db
		.insert(ProductStatus)
		.values({ productId, state: "published" })
		.onConflictDoUpdate({
			target: [ProductStatus.productId],
			set: { state: "published" },
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
