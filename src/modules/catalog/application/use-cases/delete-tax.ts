import type { TaxFeeRepositoryPort } from "../ports/TaxFeeRepositoryPort"

export async function deleteTax(
	deps: { repo: TaxFeeRepositoryPort },
	params: { productId: string; taxId: string }
): Promise<Response> {
	const { productId, taxId } = params

	if (!productId || !taxId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await deps.repo.deleteTaxFee({ productId, taxId })

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
