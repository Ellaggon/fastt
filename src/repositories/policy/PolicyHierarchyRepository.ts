import { db, eq, Variant, Hotel } from "astro:db"

export async function findParent(type: string, id: string) {
	if (type === "variant") {
		const row = await db.select().from(Variant).where(eq(Variant.id, id)).get()
		if (!row) return null
		return { type: "product", id: row.productId }
	}

	if (type === "product") {
		const hotel = await db.select().from(Hotel).where(eq(Hotel.productId, id)).get()

		if (!hotel) return null

		return { type: "hotel", id: id }
	}

	if (type === "hotel") return null

	return null
}
