import type { TaxFeeCommandRepositoryPort } from "../ports/TaxFeeCommandRepositoryPort"
import type { TaxFeeScope } from "../../domain/tax-fee.types"

export async function assignTaxFee(
	deps: { repo: TaxFeeCommandRepositoryPort },
	params: {
		taxFeeDefinitionId: string
		scope: TaxFeeScope
		scopeId: string | null
		channel?: string | null
		status?: "active" | "archived"
	}
): Promise<{ id: string }> {
	const def = await deps.repo.getDefinitionById(params.taxFeeDefinitionId)
	if (!def) throw new Error("Tax/fee definition not found")
	if (def.status !== "active") throw new Error("Tax/fee definition is not active")

	const existingByCode = await deps.repo.findActiveAssignmentByCodeScope({
		code: def.code,
		scope: params.scope,
		scopeId: params.scopeId,
	})
	if (existingByCode) throw new Error("Duplicate active assignment for code and scope")

	const existing = await deps.repo.findActiveAssignment({
		definitionId: params.taxFeeDefinitionId,
		scope: params.scope,
		scopeId: params.scopeId,
		channel: params.channel ?? null,
	})
	if (existing) throw new Error("Duplicate active assignment")

	const id = crypto.randomUUID()
	await deps.repo.createAssignment({
		id,
		taxFeeDefinitionId: params.taxFeeDefinitionId,
		scope: params.scope,
		scopeId: params.scopeId,
		channel: params.channel ?? null,
		status: params.status ?? "active",
	})

	return { id }
}
