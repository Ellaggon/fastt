import type { APIRoute } from "astro"
import { db, TaxFee, eq } from "astro:db"

export const DELETE: APIRoute = async ({ params }) => {
	const { id: productId, taxId } = params

	if (!productId || !taxId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await db.delete(TaxFee).where(eq(TaxFee.id, taxId))

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
