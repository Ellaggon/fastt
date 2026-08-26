import type {
	VariantLifecycleState,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import { updateVariantLifecycleSchema } from "../../schemas/variant/variantSchemas"

const allowedTransitions: Record<VariantLifecycleState, VariantLifecycleState[]> = {
	// Readiness belongs to the evaluator. Manual lifecycle control is intentionally
	// limited to retirement so an operator cannot bypass commercial validation.
	draft: ["archived"],
	ready: ["archived"],
	archived: [],
}

export async function updateVariantLifecycle(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string; lifecycleState: VariantLifecycleState }
): Promise<{ variantId: string; lifecycleState: VariantLifecycleState }> {
	const parsed = updateVariantLifecycleSchema.parse(params)
	const variant = await deps.repo.getVariantById(parsed.variantId)
	if (!variant) throw new Error("Variant not found")

	if (!allowedTransitions[variant.lifecycleState].includes(parsed.lifecycleState)) {
		throw new Error("Invalid lifecycle transition")
	}

	await deps.repo.updateVariantLifecycle(parsed)
	return parsed
}
