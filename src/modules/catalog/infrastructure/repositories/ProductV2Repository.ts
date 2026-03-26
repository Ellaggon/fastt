import {
	db,
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
import type {
	ProductV2Aggregate,
	ProductV2RepositoryPort,
	ProductV2StatusState,
} from "../../application/ports/ProductV2RepositoryPort"

export class ProductV2Repository implements ProductV2RepositoryPort {
	async createProductBase(params: {
		id: string
		name: string
		productType: string
		description?: string | null
		providerId?: string | null
		destinationId: string
	}): Promise<void> {
		await db.insert(Product).values({
			id: params.id,
			name: params.name,
			description: params.description ?? null,
			productType: params.productType,
			providerId: params.providerId ?? null,
			destinationId: params.destinationId,
		})
	}

	async upsertProductContent(params: {
		productId: string
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
				highlightsJson: params.highlightsJson ?? null,
				rules: params.rules ?? null,
				seoJson: params.seoJson ?? null,
			})
			return
		}

		await db
			.update(ProductContent)
			.set({
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

	async getProductAggregate(productId: string): Promise<ProductV2Aggregate | null> {
		const product = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				description: Product.description,
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
		const statusState: ProductV2StatusState | null =
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
}
