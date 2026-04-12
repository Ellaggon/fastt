import {
	and,
	db,
	desc,
	eq,
	Provider,
	ProviderProfile,
	ProviderUser,
	ProviderVerification,
	User,
} from "astro:db"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"

export type ProviderFullAggregate = {
	provider: typeof Provider.$inferSelect
	profile: typeof ProviderProfile.$inferSelect | null
	latestVerification: typeof ProviderVerification.$inferSelect | null
	ownerUser: Pick<typeof User.$inferSelect, "id" | "email"> | null
}

export async function getProviderFullAggregate(
	providerId: string,
	currentUserId: string
): Promise<ProviderFullAggregate | null> {
	if (!providerId || !currentUserId) return null
	return readThrough(cacheKeys.providerSurface(providerId), cacheTtls.providerSurface, async () => {
		const rows = await db
			.select({
				provider: Provider,
				profile: ProviderProfile,
				providerUserId: ProviderUser.id,
				providerUserRole: ProviderUser.role,
				providerUserUserId: ProviderUser.userId,
				ownerId: User.id,
				ownerEmail: User.email,
			})
			.from(Provider)
			.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Provider.id))
			.leftJoin(ProviderUser, eq(ProviderUser.providerId, Provider.id))
			.leftJoin(User, eq(User.id, ProviderUser.userId))
			.where(eq(Provider.id, providerId))
			.all()

		if (!rows.length) return null

		const provider = rows[0].provider
		const profile = rows[0].profile ?? null

		const ownerPreferred =
			rows.find((row) => row.providerUserRole === "owner" && row.ownerId) ??
			rows.find((row) => row.providerUserUserId === currentUserId && row.ownerId) ??
			null

		const ownerUser = ownerPreferred
			? {
					id: String(ownerPreferred.ownerId),
					email: String(ownerPreferred.ownerEmail),
				}
			: null

		const latestVerification =
			(await db
				.select()
				.from(ProviderVerification)
				.where(eq(ProviderVerification.providerId, providerId))
				.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
				.get()) ?? null

		return {
			provider,
			profile,
			latestVerification,
			ownerUser,
		}
	})
}
