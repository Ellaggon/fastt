export class ProductDeletionBlockedError extends Error {
	constructor() {
		super(
			"No puedes eliminar esta experiencia porque tiene reservas, solicitudes o historial protegido. Retírala de venta para conservar ese historial."
		)
		this.name = "ProductDeletionBlockedError"
	}
}

export async function deleteProduct(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	deleteCascade: (productId: string) => Promise<void>
	productId: string
	providerId: string
}): Promise<Response> {
	const { ensureOwned, deleteCascade, productId, providerId } = params

	// Verificar que el producto pertenezca al proveedor
	const product = await ensureOwned(productId, String(providerId))
	if (!product) return new Response("Not found or not owned", { status: 403 })

	// Eliminar el producto de la base de datos
	try {
		await deleteCascade(productId)
	} catch (error) {
		if (error instanceof ProductDeletionBlockedError)
			return Response.json({ error: error.message, code: "history_protected" }, { status: 409 })
		throw error
	}

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
