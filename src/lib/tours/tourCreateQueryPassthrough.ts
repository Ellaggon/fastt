/** Query keys preserved across tour create / activity entry without editorial ownership. */
export const tourCreateCommercialQueryKeys = ["variantId", "ratePlanId", "returnTo"] as const

export function copyTourCreateCommercialQuery(from: URL, to: URL): void {
	for (const key of tourCreateCommercialQueryKeys) {
		const value = from.searchParams.get(key)
		if (value) to.searchParams.set(key, value)
	}
}
