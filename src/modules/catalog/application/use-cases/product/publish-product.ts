import type { ProductRepositoryPort } from "../../ports/ProductRepositoryPort"
import { evaluateProductReadiness } from "./evaluate-product-readiness"

export async function publishProduct(
	deps: { repo: ProductRepositoryPort },
	params: { productId: string }
): Promise<{
	ok: boolean
	productId: string
	state: "draft" | "ready" | "published"
	validationErrors: Array<{ code: string; message: string }>
}> {
	const readiness = await evaluateProductReadiness(deps, { productId: params.productId })
	if (readiness.state !== "ready") {
		return {
			ok: false,
			productId: params.productId,
			state: readiness.state,
			validationErrors: readiness.validationErrors,
		}
	}

	await deps.repo.upsertProductStatus({
		productId: params.productId,
		state: "published",
		validationErrorsJson: null,
	})

	return {
		ok: true,
		productId: params.productId,
		state: "published",
		validationErrors: [],
	}
}
