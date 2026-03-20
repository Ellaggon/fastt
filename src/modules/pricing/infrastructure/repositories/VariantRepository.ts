import { db, Variant, eq, and } from "astro:db"
import type {
	VariantRepositoryPort,
	VariantSnapshot,
} from "../../application/ports/VariantRepositoryPort"

export class VariantRepository implements VariantRepositoryPort {
	async getById(id: string): Promise<VariantSnapshot | null | undefined> {
		return db.select().from(Variant).where(eq(Variant.id, id)).get()
	}

	// Still used by non-ported legacy code paths.
	async getActiveByProduct(productId: string): Promise<VariantSnapshot[]> {
		return db
			.select()
			.from(Variant)
			.where(and(eq(Variant.productId, productId), eq(Variant.isActive, true)))
			.all()
	}
}
