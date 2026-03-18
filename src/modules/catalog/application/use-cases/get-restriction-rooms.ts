import { db, eq, Variant } from "astro:db"

export async function getRestrictionRooms(productId: string): Promise<Response> {
	const pid = String(productId || "")

	if (!pid) {
		return new Response(JSON.stringify({ variants: [] }), { status: 400 })
	}

	const variants = await db
		.select({
			id: Variant.id,
			name: Variant.name,
		})
		.from(Variant)
		.where(eq(Variant.productId, pid))
		.all()

	return new Response(JSON.stringify({ variants }), { status: 200 })
}
