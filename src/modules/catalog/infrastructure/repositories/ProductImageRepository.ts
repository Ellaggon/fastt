import { db, Image, ImageUpload, eq, asc, desc, and, inArray, or } from "astro:db"
import { ensureObjectKey } from "@/lib/images/objectKey"
import type {
	ProductImageRepositoryPort,
	ProductImageRow,
} from "../../application/ports/ProductImageRepositoryPort"

export class ProductImageRepository implements ProductImageRepositoryPort {
	async listByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await db
			.select()
			.from(Image)
			.where(and(eq(Image.entityId, productId), inArray(Image.entityType, ["product", "Product"])))
			.orderBy(asc(Image.order), asc(Image.id))
			.all()) as any
	}

	async updateImage(id: string, patch: Record<string, unknown>): Promise<void> {
		await db
			.update(Image)
			.set(patch as any)
			.where(eq(Image.id, id))
	}

	async insertImage(params: {
		id?: string
		productId: string
		url: string
		objectKey?: string
		order: number
		isPrimary: boolean
	}) {
		const imageId = params.id ?? crypto.randomUUID()
		const objectKey = ensureObjectKey({
			objectKey: params.objectKey ?? null,
			url: params.url,
			context: "ProductImageRepository.insertImage",
			imageId,
		})
		if (!objectKey) throw new Error("objectKey_required")
		await db.insert(Image).values({
			id: imageId,
			entityId: params.productId,
			entityType: "product",
			objectKey,
			url: params.url,
			order: params.order,
			isPrimary: params.isPrimary,
		})
	}

	async deleteImage(id: string): Promise<void> {
		await db.delete(ImageUpload).where(or(eq(ImageUpload.imageId, id), eq(ImageUpload.id, id)))
		await db.delete(Image).where(eq(Image.id, id))
	}

	async listOrderedByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await db
			.select()
			.from(Image)
			.where(and(eq(Image.entityId, productId), inArray(Image.entityType, ["product", "Product"])))
			.orderBy(asc(Image.order), asc(Image.id))
			.all()) as any
	}

	async listGalleryByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await db
			.select()
			.from(Image)
			.where(and(eq(Image.entityId, productId), inArray(Image.entityType, ["product", "Product"])))
			.orderBy(desc(Image.isPrimary), asc(Image.order))
			.all()) as any
	}
}
