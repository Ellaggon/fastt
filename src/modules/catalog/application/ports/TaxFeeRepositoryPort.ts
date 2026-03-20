export type TaxFeeRow = {
	id: string
	productId: string
	type: unknown
	value: unknown
	currency: unknown
	isIncluded: unknown
	isActive: unknown
	createdAt?: unknown
}

export interface TaxFeeRepositoryPort {
	createTaxFee(params: {
		productId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}): Promise<void>

	listTaxFeesByProduct(productId: string): Promise<TaxFeeRow[]>

	updateTaxFee(params: {
		productId: string
		taxId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}): Promise<void>

	deleteTaxFee(params: { productId: string; taxId: string }): Promise<void>
}
