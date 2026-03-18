import type { APIRoute } from "astro"
import { deleteTax } from "@/modules/catalog/application/use-cases/delete-tax"

export const DELETE: APIRoute = async ({ params }) => {
	const { id: productId, taxId } = params
	return deleteTax({ productId: productId || "", taxId: taxId || "" })
}
