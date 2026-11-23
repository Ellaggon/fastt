export function requiresTerritorialTransition(versionId: string, bundles: unknown[]) {
	return bundles.some((bundle) => {
		if (!bundle || typeof bundle !== "object") return false
		const value = bundle as { publicationAuthorized?: unknown; drafts?: unknown }
		return (
			value.publicationAuthorized === false &&
			Array.isArray(value.drafts) &&
			value.drafts.some(
				(draft) =>
					draft && typeof draft === "object" && (draft as { id?: unknown }).id === versionId
			)
		)
	})
}
