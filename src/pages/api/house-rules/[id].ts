import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getProductById } from "@/modules/catalog/public"
import { db, eq, HouseRule as HouseRuleTable } from "astro:db"
import { deleteHouseRule } from "@/modules/house-rules/public"

export const DELETE: APIRoute = async ({ request, params }) => {
	let providerId: string
	try {
		const res = await requireProvider(request)
		providerId = res.providerId
	} catch (e: any) {
		if (e instanceof Response) return e
		return new Response("Unauthorized", { status: 401 })
	}

	const id = String(params.id ?? "").trim()
	if (!id) return new Response("Not found", { status: 404 })

	const rule = await db.select().from(HouseRuleTable).where(eq(HouseRuleTable.id, id)).get()
	if (!rule) return new Response("Not found", { status: 404 })

	const productId = String((rule as any).productId ?? "").trim()
	const product = await getProductById(productId)
	if (!product || String(product.providerId ?? "") !== providerId)
		return new Response("Not found", { status: 404 })

	await deleteHouseRule(id)
	return new Response(null, { status: 204 })
}
