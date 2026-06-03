import type { RefundCalculationRepositoryPort } from "../ports/RefundCalculationRepositoryPort"
import { buildRefundQuote, type BuildRefundQuoteInput } from "./build-refund-quote"

export async function createRefundQuoteBeforeCancellation(
	deps: { repo: RefundCalculationRepositoryPort },
	input: BuildRefundQuoteInput
) {
	const quote = buildRefundQuote(input)
	return deps.repo.saveQuoteIfAbsentByIdempotencyKey(quote)
}
