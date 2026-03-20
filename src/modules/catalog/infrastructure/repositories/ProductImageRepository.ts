import { db, Image, eq, asc } from "astro:db"
import type {
	ProductImageRepositoryPort,
	ProductImageRow,
} from "../../application/ports/ProductImageRepositoryPort"

export class ProductImageRepository implements ProductImageRepositoryPort {
	async listByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await db.select().from(Image).where(eq(Image.entityId, productId)).all()) as any
	}

	async updateImage(id: string, patch: Record<string, unknown>): Promise<void> {
		await db
			.update(Image)
			.set(patch as any)
			.where(eq(Image.id, id))
	}

	async insertImage(params: { productId: string; url: string; order: number; isPrimary: boolean }) {
		await db.insert(Image).values({
			id: crypto.randomUUID(),
			entityId: params.productId,
			entityType: "Product",
			url: params.url,
			order: params.order,
			isPrimary: params.isPrimary,
		})
	}

	async deleteImage(id: string): Promise<void> {
		await db.delete(Image).where(eq(Image.id, id))
	}

	async listOrderedByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await db
			.select()
			.from(Image)
			.where(eq(Image.entityId, productId))
			.orderBy(asc(Image.order))
			.all()) as any
	}
}
