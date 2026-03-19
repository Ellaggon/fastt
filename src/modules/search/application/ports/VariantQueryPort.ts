export interface VariantQueryPort {
	getActiveByProduct(productId: string): Promise<
		Array<{
			id: string
			entityType: string
			basePrice?: number
			[key: string]: any
		}>
	>
}
