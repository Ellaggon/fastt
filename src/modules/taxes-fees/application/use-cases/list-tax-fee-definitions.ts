import type { TaxFeeDefinition } from "../../domain/tax-fee.types"
import type { TaxFeeQueryRepositoryPort } from "../ports/TaxFeeQueryRepositoryPort"

export async function listTaxFeeDefinitionsByProvider(
	deps: { repo: TaxFeeQueryRepositoryPort },
	params: { providerId: string }
): Promise<{ definitions: TaxFeeDefinition[] }> {
	const providerId = String(params.providerId || "").trim()
	if (!providerId) throw new Error("providerId is required")

	const definitions = await deps.repo.listDefinitionsByProvider(providerId)
	return { definitions }
}
