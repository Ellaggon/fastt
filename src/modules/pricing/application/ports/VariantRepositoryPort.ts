export type VariantKind = "hotel_room" | "tour_slot" | "package_base"

export interface VariantSnapshot {
	id: string
	productId: string
	kind: VariantKind
	pricing: {
		basePrice: number
		currency: string
	}
	capacity: {
		minOccupancy: number
		maxOccupancy: number
	}
	name?: string | null
}

export interface VariantRepositoryPort {
	// NOTE: astro:db `.get()` returns `undefined` when no row exists. We allow both `null` and
	// `undefined` here so use-cases can depend on the port while legacy repositories evolve.
	getById(id: string): Promise<VariantSnapshot | null | undefined>
	existsById(id: string): Promise<boolean>
}
