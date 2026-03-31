import type { TaxFeeRepositoryPort } from "../ports/TaxFeeRepositoryPort"

export async function createTax(
	deps: { repo: TaxFeeRepositoryPort },
	params: {
		productId: string
		type: unknown
		value: unknown
		currency: unknown
		isIncluded: unknown
		isActive: unknown
	}
): Promise<Response> {
	const { productId, type, value, currency, isIncluded, isActive } = params

	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	await deps.repo.createTaxFee({ productId, type, value, currency, isIncluded, isActive })

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
