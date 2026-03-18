import { db, eq, asc, desc, Image } from "astro:db"

export async function resolveProductImages(productId: string) {
	return db
		.select()
		.from(Image)
		.where(eq(Image.entityId, productId))
		.orderBy(desc(Image.isPrimary), asc(Image.order))
		.all()
}