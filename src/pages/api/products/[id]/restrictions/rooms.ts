import type { APIRoute } from "astro"
import { db, eq, Variant } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = String(params.id || "")

	if (!productId) {
		return new Response(JSON.stringify({ variants: [] }), { status: 400 })
	}

	const variants = await db
		.select({
			id: Variant.id,
			name: Variant.name,
		})
		.from(Variant)
		.where(eq(Variant.productId, productId))
		.all()

	return new Response(JSON.stringify({ variants }), { status: 200 })
}