import type {
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import { updateVariantStatusSchema } from "../../schemas/variant/variantSchemas"
import { ZodError } from "zod"

const allowed: Record<VariantLifecycleStatus, VariantLifecycleStatus[]> = {
	draft: ["ready", "archived"],
	ready: ["sellable", "archived", "draft"],
	sellable: ["archived"],
	archived: [],
}

export async function updateVariantStatus(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string; status: VariantLifecycleStatus }
): Promise<{ variantId: string; status: VariantLifecycleStatus }> {
	const parsed = updateVariantStatusSchema.parse(params)

	// CAPA 3 hardening: "sellable" is reserved until CAPA 4/5 (pricing + inventory) exist.
	// Prevent accidental/manual elevation into sellable in production.
	if (parsed.status === "sellable") {
		throw new ZodError([
			{
				code: "custom",
				path: ["status"],
				message: "sellable_reserved",
			},
		])
	}

	const v = await deps.repo.getVariantById(parsed.variantId)
	if (!v) throw new Error("Variant not found")

	const currentRaw = String(v.status ?? "draft")
		.trim()
		.toLowerCase()
	const current: VariantLifecycleStatus =
		currentRaw === "draft" ||
		currentRaw === "ready" ||
		currentRaw === "sellable" ||
		currentRaw === "archived"
			? (currentRaw as VariantLifecycleStatus)
			: "draft"

	if (!allowed[current].includes(parsed.status)) {
		throw new Error("Invalid status transition")
	}

	// Minimal behavior: isActive follows whether it is at least ready and not archived.
	// With sellable blocked (reserved), "ready" is the only active lifecycle state for now.
	const isActive = parsed.status === "ready"
	await deps.repo.updateVariantStatus({
		variantId: parsed.variantId,
		status: parsed.status,
		isActive,
	})

	return { variantId: parsed.variantId, status: parsed.status }
}
