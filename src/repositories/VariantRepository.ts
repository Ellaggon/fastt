import { db, Variant, eq, and } from "astro:db"

export class VariantRepository {
	async getById(id: string) {
		return db.select().from(Variant).where(eq(Variant.id, id)).get()
	}

	async getActiveByProduct(productId: string) {
		return db
			.select()
			.from(Variant)
			.where(and(eq(Variant.productId, productId), eq(Variant.isActive, true)))
			.all()
	}
}
