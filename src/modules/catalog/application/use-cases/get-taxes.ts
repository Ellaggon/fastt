import type { TaxFeeRepositoryPort } from "../ports/TaxFeeRepositoryPort"

export async function getTaxes(
	deps: { repo: TaxFeeRepositoryPort },
	productId: string
): Promise<Response> {
	if (!productId)
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })

	const taxes = await deps.repo.listTaxFeesByProduct(productId)

	return new Response(JSON.stringify({ taxes }), {
		headers: { "Content-Type": "application/json" },
	})
}
