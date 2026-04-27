export function resolveVariantRef(variant: { id: string; entityId?: string | null }): string {
	if (variant.entityId && variant.entityId !== variant.id) {
		console.warn("entityId != id", {
			id: variant.id,
			entityId: variant.entityId,
		})
	}

	return variant.id
}
