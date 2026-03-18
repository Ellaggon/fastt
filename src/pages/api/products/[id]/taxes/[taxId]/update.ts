import type { APIRoute } from "astro"
import { updateTax } from "@/modules/catalog/application/use-cases/update-tax"

export const PUT: APIRoute = async ({ params, request }) => {
	const { id: productId, taxId } = params
	const body = await request.json()

	const { type, value, currency, isIncluded, isActive } = body
	return updateTax({
		productId: productId || "",
		taxId: taxId || "",
		type,
		value,
		currency,
		isIncluded,
		isActive,
	})
}
