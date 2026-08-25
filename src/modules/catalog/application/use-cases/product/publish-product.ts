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

	const eligibility = await deps.repo.getProductPublicationEligibility?.(params.productId)
	if (eligibility && !eligibility.eligible) {
		return {
			ok: false,
			productId: params.productId,
			state: "ready",
			validationErrors: [
				{
					code: "PUBLICATION_OWNER_INELIGIBLE",
					message:
						"Solo los productos de producción de un proveedor comercial de producción pueden publicarse.",
				},
			],
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
