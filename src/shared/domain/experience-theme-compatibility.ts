type Category = {
	id: string
	classificationKind: string
	isActive: boolean
	vertical: string
	dataClass: string
}
type Activity = Category & {
	parentCategoryId: string | null
	allowedAdditionalThemeIds?: string[]
	themeCompatibilityRevision?: number
}
/** Discovery compatibility is editorial, independent of commercial authorization. */
export function experienceThemeCompatibility(
	activity: Activity | null | undefined,
	families: Category[],
	selected: string[] = []
) {
	const allowed = new Set(activity?.isActive ? (activity.allowedAdditionalThemeIds ?? []) : [])
	const available = families.filter(
		(row) =>
			allowed.has(row.id) &&
			row.id !== activity?.parentCategoryId &&
			row.classificationKind === "family" &&
			row.isActive &&
			row.vertical === activity?.vertical &&
			row.dataClass === activity?.dataClass
	)
	const ids = new Set(available.map((row) => row.id))
	return {
		availableIds: [...ids],
		validIds: [...new Set(selected)].filter((id) => ids.has(id)),
		invalidIds: [...new Set(selected)].filter((id) => !ids.has(id)),
		revision: activity?.themeCompatibilityRevision ?? 0,
	}
}
