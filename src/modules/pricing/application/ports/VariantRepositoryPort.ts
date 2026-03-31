export interface VariantSnapshot {
	id: string
	productId: string
	entityType: string
	entityId: string
	basePrice?: number | null
	currency?: string | null
	name?: string | null
}

export interface VariantRepositoryPort {
	// NOTE: astro:db `.get()` returns `undefined` when no row exists. We allow both `null` and
	// `undefined` here so use-cases can depend on the port while legacy repositories evolve.
	getById(id: string): Promise<VariantSnapshot | null | undefined>
}
