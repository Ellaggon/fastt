import { db } from "astro:db"

export async function updateProductSubtype(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	subtypeExists: (
		dbOrTx: any,
		productId: string,
		subtype: "hotel" | "tour" | "package"
	) => Promise<boolean>
	updateHotel: (dbOrTx: any, productId: string, data: any) => Promise<void>
	updateTour: (dbOrTx: any, productId: string, data: any) => Promise<void>
	updatePackage: (dbOrTx: any, productId: string, data: any) => Promise<void>
	insertHotel: (dbOrTx: any, data: any) => Promise<any>
	insertTour: (dbOrTx: any, data: any) => Promise<any>
	insertPackage: (dbOrTx: any, data: any) => Promise<any>
	providerId: string
	productId: string
	subtypeType: "hotel" | "tour" | "package"
	subtype: any
}): Promise<Response> {
	const {
		ensureOwned,
		subtypeExists,
		updateHotel,
		updateTour,
		updatePackage,
		insertHotel,
		insertTour,
		insertPackage,
		providerId,
		productId,
		subtypeType,
		subtype,
	} = params

	// ownership + product check
	const product = await ensureOwned(productId, providerId)
	if (!product)
		return new Response(JSON.stringify({ error: "Not found or not owned" }), { status: 403 })

	const prevType = String((product as any).productType || "").toLowerCase()
	if (subtypeType !== prevType) {
		return new Response(
			JSON.stringify({
				error:
					"Subtype type does not match product.productType. Change productType first in the product page.",
			}),
			{ status: 400 }
		)
	}

	// Upsert subtype inside a transaction
	await db.transaction(async (tx) => {
		const exists = await subtypeExists(tx as any, productId, subtypeType)
		if (exists) {
			if (subtypeType === "hotel") await updateHotel(tx as any, productId, subtype || {})
			if (subtypeType === "tour") await updateTour(tx as any, productId, subtype || {})
			if (subtypeType === "package") await updatePackage(tx as any, productId, subtype || {})
		} else {
			if (subtypeType === "hotel")
				await insertHotel(tx as any, { productId, ...(subtype || {}) } as any)
			if (subtypeType === "tour")
				await insertTour(tx as any, { productId, ...(subtype || {}) } as any)
			if (subtypeType === "package")
				await insertPackage(tx as any, { productId, ...(subtype || {}) } as any)
		}
	})

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
