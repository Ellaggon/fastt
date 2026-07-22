export type VariantKind = "hotel_room" | "tour_slot" | "package_base" | "limousine_service"

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
	// Transitional repositories may return `undefined` while they converge on `null`.
	getById(id: string): Promise<VariantSnapshot | null | undefined>
	existsById(id: string): Promise<boolean>
}
