import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import type {
	CatalogReadModelRepositoryPort,
	ProviderFullAggregate,
} from "../ports/CatalogReadModelRepositoryPort"

export type { ProviderFullAggregate }

export function createGetProviderFullAggregateQuery(deps: {
	repo: CatalogReadModelRepositoryPort
}) {
	return async function getProviderFullAggregate(
		providerId: string,
		currentUserId: string
	): Promise<ProviderFullAggregate | null> {
		if (!providerId || !currentUserId) return null
		return readThrough(cacheKeys.providerSurface(providerId), cacheTtls.providerSurface, async () =>
			deps.repo.getProviderFullAggregate(providerId, currentUserId)
		)
	}
}
