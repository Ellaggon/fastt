import type { TaxFeeRepositoryPort } from "../ports/TaxFeeRepositoryPort"

export async function updateTax(
	deps: { repo: TaxFeeRepositoryPort },
	params: {
		productId: string
		taxId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}
): Promise<Response> {
	const { productId, taxId, type, value, currency, isIncluded, isActive } = params

	if (!productId || !taxId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await deps.repo.updateTaxFee({ productId, taxId, type, value, currency, isIncluded, isActive })

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
