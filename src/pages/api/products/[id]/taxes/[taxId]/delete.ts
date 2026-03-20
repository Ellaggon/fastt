import type { APIRoute } from "astro"
import { taxFeeRepository } from "@/container"
import { deleteTax } from "@/modules/catalog/public"

export const DELETE: APIRoute = async ({ params }) => {
	const { id: productId, taxId } = params
	return deleteTax({ repo: taxFeeRepository }, { productId: productId || "", taxId: taxId || "" })
}
