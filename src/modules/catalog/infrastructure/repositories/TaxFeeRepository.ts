import { db, TaxFee, eq, and } from "astro:db"
import type { TaxFeeRepositoryPort, TaxFeeRow } from "../../application/ports/TaxFeeRepositoryPort"

export class TaxFeeRepository implements TaxFeeRepositoryPort {
	async createTaxFee(params: {
		productId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}): Promise<void> {
		await db.insert(TaxFee).values({
			id: crypto.randomUUID(),
			productId: params.productId,
			type: params.type as any,
			value: params.value as any,
			currency: params.currency as any,
			isIncluded: params.isIncluded as any,
			isActive: params.isActive as any,
			createdAt: new Date(),
		})
	}

	async listTaxFeesByProduct(productId: string): Promise<TaxFeeRow[]> {
		return (await db.select().from(TaxFee).where(eq(TaxFee.productId, productId)).all()) as any
	}

	async updateTaxFee(params: {
		productId: string
		taxId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}): Promise<void> {
		await db
			.update(TaxFee)
			.set({
				type: params.type as any,
				value: params.value as any,
				currency: params.currency as any,
				isIncluded: params.isIncluded as any,
				isActive: params.isActive as any,
			})
			.where(and(eq(TaxFee.id, params.taxId), eq(TaxFee.productId, params.productId)))
	}

	async deleteTaxFee(params: { productId: string; taxId: string }): Promise<void> {
		await db
			.delete(TaxFee)
			.where(and(eq(TaxFee.id, params.taxId), eq(TaxFee.productId, params.productId)))
	}
}
