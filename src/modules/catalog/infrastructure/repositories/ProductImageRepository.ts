import {
	db,
	Image,
	ImageUpload,
	ProductImage,
	eq,
	asc,
	desc,
	and,
	or,
} from "@/shared/infrastructure/db/compat"
import { ensureObjectKey } from "@/lib/images/objectKey"
import type {
	ProductImageRepositoryPort,
	ProductImageRow,
} from "../../application/ports/ProductImageRepositoryPort"

export class ProductImageRepository implements ProductImageRepositoryPort {
	private selectGallery(productId: string) {
		return db
			.select({
				id: Image.id,
				url: Image.url,
				objectKey: Image.objectKey,
				order: ProductImage.sortOrder,
				isPrimary: ProductImage.isPrimary,
			})
			.from(ProductImage)
			.innerJoin(Image, eq(Image.id, ProductImage.imageId))
			.where(eq(ProductImage.productId, productId))
	}

	async listByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await this.selectGallery(productId).orderBy(
			asc(ProductImage.sortOrder),
			asc(Image.id)
		)) as any
	}

	async updateImage(id: string, patch: Record<string, unknown>): Promise<void> {
		const galleryPatch: Record<string, unknown> = {}
		if (typeof patch.order === "number") galleryPatch.sortOrder = patch.order
		if (typeof patch.isPrimary === "boolean") galleryPatch.isPrimary = patch.isPrimary
		if (Object.keys(galleryPatch).length) {
			await db
				.update(ProductImage)
				.set(galleryPatch as any)
				.where(eq(ProductImage.imageId, id))
		}
	}

	async clearPrimary(productId: string): Promise<void> {
		await db
			.update(ProductImage)
			.set({ isPrimary: false })
			.where(and(eq(ProductImage.productId, productId), eq(ProductImage.isPrimary, true)))
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
		await db.transaction(async (tx) => {
			if (params.isPrimary) {
				await tx
					.update(ProductImage)
					.set({ isPrimary: false })
					.where(
						and(eq(ProductImage.productId, params.productId), eq(ProductImage.isPrimary, true))
					)
			}
			await tx.insert(Image).values({ id: imageId, objectKey, url: params.url })
			await tx.insert(ProductImage).values({
				productId: params.productId,
				imageId,
				sortOrder: params.order,
				isPrimary: params.isPrimary,
			})
		})
	}

	async deleteImage(id: string): Promise<void> {
		await db.delete(ImageUpload).where(or(eq(ImageUpload.imageId, id), eq(ImageUpload.id, id)))
		await db.delete(Image).where(eq(Image.id, id))
	}

	async listOrderedByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await this.selectGallery(productId).orderBy(
			asc(ProductImage.sortOrder),
			asc(Image.id)
		)) as any
	}

	async listGalleryByProduct(productId: string): Promise<ProductImageRow[]> {
		return (await this.selectGallery(productId).orderBy(
			desc(ProductImage.isPrimary),
			asc(ProductImage.sortOrder)
		)) as any
	}
}
