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
	await deleteCascade(productId)

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
