/** Empty file inputs manufacture a new File on each read; they are not edits. */
export function formDraftFingerprint(data: FormData) {
	return JSON.stringify(
		[...data].map(([key, value]) => [
			key,
			typeof value === "string"
				? value
				: !value.name && value.size === 0
					? ""
					: `${value.name}:${value.size}:${value.lastModified}`,
		])
	)
}
