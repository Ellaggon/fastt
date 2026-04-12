import {
	db,
	and,
	eq,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
	Image,
	Hotel,
	Tour,
	Package,
} from "astro:db"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type {
	ProductAggregate,
	ProductRepositoryPort,
	ProductStatusState,
} from "../../application/ports/ProductRepositoryPort"

export class ProductRepository implements ProductRepositoryPort {
	constructor(private r2?: S3Client) {}

	// INVARIANT:
	// Product persists identity only.
	// Content, location and status are stored in their dedicated tables.
	async createProductBase(params: {
		id: string
		name: string
		productType: string
		providerId?: string | null
		destinationId: string
	}): Promise<void> {
		await db.insert(Product).values({
			id: params.id,
			name: params.name,
			productType: params.productType,
			providerId: params.providerId ?? null,
			destinationId: params.destinationId,
		})
	}

	async getProductById(productId: string) {
		if (!productId) return null
		const row = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(eq(Product.id, productId))
			.get()
		return row ?? null
	}

	async ensureProductOwnedByProvider(productId: string, providerId: string) {
		if (!productId || !providerId) return null
		const row = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.get()
		return row ?? null
	}

	async upsertProductContent(params: {
		productId: string
		description?: string | null
		highlightsJson?: unknown | null
		rules?: string | null
		seoJson?: unknown | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductContent.productId })
			.from(ProductContent)
			.where(eq(ProductContent.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductContent).values({
				productId: params.productId,
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				rules: params.rules ?? null,
				seoJson: params.seoJson ?? null,
			})
			return
		}

		await db
			.update(ProductContent)
			.set({
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				rules: params.rules ?? null,
				seoJson: params.seoJson ?? null,
			})
			.where(eq(ProductContent.productId, params.productId))
	}

	async upsertProductLocation(params: {
		productId: string
		address?: string | null
		lat?: number | null
		lng?: number | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductLocation.productId })
			.from(ProductLocation)
			.where(eq(ProductLocation.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductLocation).values({
				productId: params.productId,
				address: params.address ?? null,
				lat: params.lat ?? null,
				lng: params.lng ?? null,
			})
			return
		}

		await db
			.update(ProductLocation)
			.set({
				address: params.address ?? null,
				lat: params.lat ?? null,
				lng: params.lng ?? null,
			})
			.where(eq(ProductLocation.productId, params.productId))
	}

	async upsertProductStatus(params: {
		productId: string
		state: "draft" | "ready" | "published"
		validationErrorsJson?: unknown | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductStatus.productId })
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductStatus).values({
				productId: params.productId,
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
			})
			return
		}

		await db
			.update(ProductStatus)
			.set({
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
			})
			.where(eq(ProductStatus.productId, params.productId))
	}

	async getProductAggregate(productId: string): Promise<ProductAggregate | null> {
		const product = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(eq(Product.id, productId))
			.get()

		if (!product) return null

		const content = await db
			.select({
				productId: ProductContent.productId,
				description: ProductContent.description,
				highlightsJson: ProductContent.highlightsJson,
				rules: ProductContent.rules,
				seoJson: ProductContent.seoJson,
			})
			.from(ProductContent)
			.where(eq(ProductContent.productId, productId))
			.get()

		const location = await db
			.select({
				productId: ProductLocation.productId,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
			})
			.from(ProductLocation)
			.where(eq(ProductLocation.productId, productId))
			.get()

		const status = await db
			.select({
				productId: ProductStatus.productId,
				state: ProductStatus.state,
				validationErrorsJson: ProductStatus.validationErrorsJson,
			})
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, productId))
			.get()

		const images = await db
			.select({ id: Image.id })
			.from(Image)
			.where(eq(Image.entityId, productId))
			.all()

		const pt = String(product.productType || "")
			.trim()
			.toLowerCase()
		let subtypeExists = false
		if (pt === "hotel") {
			subtypeExists = !!(await db.select().from(Hotel).where(eq(Hotel.productId, productId)).get())
		} else if (pt === "tour") {
			subtypeExists = !!(await db.select().from(Tour).where(eq(Tour.productId, productId)).get())
		} else if (pt === "package") {
			subtypeExists = !!(await db
				.select()
				.from(Package)
				.where(eq(Package.productId, productId))
				.get())
		}

		const rawState = status?.state ?? null
		const statusState: ProductStatusState | null =
			rawState === "draft" || rawState === "ready" || rawState === "published" ? rawState : null

		return {
			product,
			imagesCount: images.length,
			subtypeExists,
			content: content ?? null,
			location: location ?? null,
			status:
				status && statusState
					? {
							productId: status.productId,
							state: statusState,
							validationErrorsJson: status.validationErrorsJson ?? null,
						}
					: null,
		}
	}

	async deleteProductCascade(productId: string) {
		if (!productId) return
		const product = await db.select().from(Product).where(eq(Product.id, productId)).get()
		if (!product) return

		const images = await db.select().from(Image).where(eq(Image.entityId, productId)).all()

		await db.delete(Image).where(eq(Image.entityId, productId))
		await db.delete(ProductContent).where(eq(ProductContent.productId, productId))
		await db.delete(ProductLocation).where(eq(ProductLocation.productId, productId))
		await db.delete(ProductStatus).where(eq(ProductStatus.productId, productId))

		const pt = String(product.productType || "").toLowerCase()
		if (pt === "hotel") {
			await db.delete(Hotel).where(eq(Hotel.productId, productId))
		} else if (pt === "tour") {
			await db.delete(Tour).where(eq(Tour.productId, productId))
		} else if (pt === "package") {
			await db.delete(Package).where(eq(Package.productId, productId))
		}

		await db.delete(Product).where(eq(Product.id, productId))

		if (!this.r2 || !process.env.R2_BUCKET_NAME) return
		for (const img of images) {
			try {
				const objectKey = (img as any).objectKey ? String((img as any).objectKey) : null
				const key = objectKey || (img?.url ? new URL(img.url).pathname.replace(/^\/+/, "") : null)
				if (!key) continue
				await this.r2.send(
					new DeleteObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME,
						Key: key,
					})
				)
			} catch (error) {
				console.warn("Failed to delete product image from R2", error)
			}
		}
	}
}
