import { providerRepository } from "@/container"
import { getUserFromRequest } from "./getUserFromRequest"

/**
 * Compatibility helper used by existing pages/routes.
 *
 * Returns the providerId for the authenticated user, or null if:
 * - no authenticated user
 * - user is not associated to a provider
 */
export async function getProviderIdFromRequest(request: Request): Promise<string | null> {
	const user = await getUserFromRequest(request)
	if (!user?.id) return null

	const providerByUserLink = await providerRepository.getProviderByUserId(user.id)
	if (providerByUserLink?.id) {
		console.info(
			JSON.stringify({
				type: "provider_resolution",
				path: "provider_user",
				userId: user.id,
			})
		)
		return providerByUserLink.id
	}

	console.info(
		JSON.stringify({
			type: "provider_resolution",
			path: "none",
			userId: user.id,
		})
	)
	return null
}
