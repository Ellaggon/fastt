import type { APIRoute } from "astro"
import { previewRestrictionsViaService } from "@/modules/catalog/application/use-cases/preview-restrictions-via-service"

export const POST: APIRoute = async ({ request, params }) => {
	const body = await request.json()
	return previewRestrictionsViaService({ productId: params.id!, body })
}
