import { db, TaxFee, eq } from "astro:db"

export async function getTaxes(productId: string): Promise<Response> {
	if (!productId)
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })

	const taxes = await db.select().from(TaxFee).where(eq(TaxFee.productId, productId)).all()

	return new Response(JSON.stringify({ taxes }), {
		headers: { "Content-Type": "application/json" },
	})
}
