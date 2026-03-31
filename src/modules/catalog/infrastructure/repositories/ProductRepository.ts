import {
	db,
	eq,
	and,
	asc,
	Product,
	Tour,
	Package,
	Hotel,
	Image,
	HotelRoomType,
	Variant,
	PricingBaseRate,
	NOW,
} from "astro:db"
import type { ProductRepositoryPort } from "../../application/ports/ProductRepositoryPort"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"

type DrizzleDB = typeof db
type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0]
type DBOrTx = DrizzleDB | DrizzleTx

export class ProductRepository implements ProductRepositoryPort {
	constructor(private r2: S3Client) {}

	async createProductWithImages(params: {
		id: string
		name: string
		description: string | null
		productType: string
		providerId: string | null
		destinationId: string
		images: string[]
	}): Promise<void> {
		// Preserve existing behavior: one product insert, then one image insert per URL.
		await db.insert(Product).values({
			id: params.id,
			name: params.name,
			description: params.description,
			productType: params.productType,
			creationDate: NOW,
			lastUpdated: NOW,
			providerId: params.providerId,
			destinationId: params.destinationId,
		})

		for (let i = 0; i < params.images.length; i++) {
			const url = params.images[i]
			await db.insert(Image).values({
				id: crypto.randomUUID(),
				entityId: params.id,
				entityType: "Product",
				url,
				order: i,
				isPrimary: i === 0,
			})
		}
	}

	async getProductById(productId: string) {
		if (!productId) return null
		return db.select().from(Product).where(eq(Product.id, productId)).get()
	}

	/** Verifica que el product exista y pertenezca al providerId */
	async ensureProductOwnedByProvider(productId: string, providerId: string) {
		if (!productId || !providerId) return null
		const product = await db
			.select()
			.from(Product)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.get()
		return product ?? null
	}

	// Usar el providerId para obtener todos los productos del proveedor
	async getProductsByProvider(providerId: string) {
		const products = await db
			.select()
			.from(Product)
			.where(eq(Product.providerId, providerId))
			.leftJoin(Tour, eq(Product.id, Tour.productId))
			.leftJoin(Package, eq(Product.id, Package.productId))
			// Unimos con Variant + PricingBaseRate para traer el precio base (CAPA 4A).
			.leftJoin(Variant, eq(Product.id, Variant.productId))
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.groupBy(Product.id)

		// Formatear los resultados en un array limpio
		return products.map((el) => {
			const combinedData = {
				...el.Product,
				...el.Tour,
				...el.Package,
			}

			return {
				id: combinedData.id,
				name: combinedData.name,
				productType: combinedData.productType,
				basePrice: el.PricingBaseRate?.basePrice ?? 0,
				currency: el.PricingBaseRate?.currency ?? "USD",
				destinationId: combinedData.destinationId,
			}
		})
	}

	/** Obtener product + images ordenadas + subtype row (si existe) */
	async getProductWithImagesAndSubtype(productId: string) {
		const product = await db.select().from(Product).where(eq(Product.id, productId)).get()
		if (!product) return null

		const images = await db
			.select()
			.from(Image)
			.where(eq(Image.entityId, productId))
			.orderBy(asc(Image.order))
			.all()

		const pt = String(product.productType || "").toLowerCase()
		let subtype = null
		if (pt === "hotel")
			subtype = await db.select().from(Hotel).where(eq(Hotel.productId, productId)).get()
		else if (pt === "tour")
			subtype = await db.select().from(Tour).where(eq(Tour.productId, productId)).get()
		else if (pt === "package")
			subtype = await db.select().from(Package).where(eq(Package.productId, productId)).get()

		return { product, images, subtype }
	}

	/** Actualiza campos simples del product (single-table) */
	async updateProductFields(
		dbOrTx: DBOrTx,
		productId: string,
		data: Partial<Record<string, unknown>>
	) {
		if (!productId) return
		await dbOrTx
			.update(Product)
			.set(data as any)
			.where(eq(Product.id, productId))
	}

	/** Borra product + related rows + intentará limpiar objetos en R2 (best-effort) */
	async deleteProductCascade(productId: string) {
		if (!productId) return
		// 1) obtener producto
		const product = await db.select().from(Product).where(eq(Product.id, productId)).get()
		if (!product) return
		// 2) obtener imágenes asociadas (guardamos URLs para borrar en R2 luego)
		const images = await db.select().from(Image).where(eq(Image.entityId, productId)).all()

		// 3) borrar filas relacionadas en DB (Images, subtype, hotel room types)
		try {
			await db.delete(Image).where(eq(Image.entityId, productId))
			const pt = String(product.productType || "").toLowerCase()
			if (pt === "hotel") {
				// eliminar room types que referencien al hotel
				try {
					await db.delete(HotelRoomType).where(eq(HotelRoomType.hotelId, productId))
				} catch (e) {
					console.warn("No se pudo borrar HotelRoomType (o no existe): ", e)
				}
				await db.delete(Hotel).where(eq(Hotel.productId, productId))
			} else if (pt === "tour") {
				await db.delete(Tour).where(eq(Tour.productId, productId))
			} else if (pt === "package") {
				await db.delete(Package).where(eq(Package.productId, productId))
			}
			// 4) borrar product
			await db.delete(Product).where(eq(Product.id, productId))
		} catch (e) {
			console.error("Error borrando files en DBdurante deleteProductCascade: ", e)
			throw e // re-lanzar para que el caller lo maneje
		}
		// 5) intentar borrar objetos en R2 (best-effort)
		for (const img of images) {
			try {
				if (!img?.url) continue
				const key = new URL(img.url).pathname.replace(/^\/+/, "")
				await this.r2.send(
					new DeleteObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME!,
						Key: key,
					})
				)
				console.log("Deleted from R2:", key)
			} catch (e) {
				console.error("Failed to delete R2 object for image: ", e)
				// not throwing: queremos que DB quede consistente aunque R2 falle
			}
		}
	}
}
