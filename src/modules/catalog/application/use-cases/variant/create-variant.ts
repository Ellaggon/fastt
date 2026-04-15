import type {
	VariantKind,
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import { createVariantSchema } from "../../schemas/variant/variantSchemas"
import type {
	InventoryBootstrapPort,
	VariantInventoryConfigRepositoryPort,
} from "@/modules/inventory/public"

function normalizeProductType(raw: string): "hotel" | "tour" | "package" | "unknown" {
	const s = String(raw || "")
		.trim()
		.toLowerCase()
	if (s === "hotel") return "hotel"
	if (s === "tour") return "tour"
	if (s === "package") return "package"
	return "unknown"
}

function expectedKindForProductType(pt: string): VariantKind | null {
	const t = normalizeProductType(pt)
	if (t === "hotel") return "hotel_room"
	if (t === "tour") return "tour_slot"
	if (t === "package") return "package_base"
	return null
}

export async function createVariant(
	deps: {
		repo: VariantManagementRepositoryPort
		inventoryConfigRepo: VariantInventoryConfigRepositoryPort
		inventoryBootstrap: InventoryBootstrapPort
	},
	params: { productId: string; name: string; description?: string | null; kind: VariantKind }
): Promise<{ variantId: string; status: VariantLifecycleStatus }> {
	const parsed = createVariantSchema.parse({
		productId: params.productId,
		name: params.name,
		description: params.description ?? undefined,
		kind: params.kind,
	})

	const product = await deps.repo.getProductById(parsed.productId)
	if (!product) throw new Error("Product not found")

	const expected = expectedKindForProductType(product.productType)
	if (!expected || expected !== parsed.kind) {
		throw new Error("Variant kind does not match product type")
	}

	const variantId = crypto.randomUUID()
	const createdAt = new Date()

	// Start inactive until it becomes ready/sellable.
	const status: VariantLifecycleStatus = "draft"

	await deps.repo.createVariant({
		id: variantId,
		productId: parsed.productId,
		kind: parsed.kind,
		name: parsed.name,
		description: parsed.description ?? null,
		status,
		createdAt,
		isActive: false,
	})

	// CAPA 5 (Phase 1): ensure inventory exists and is complete for the variant.
	// Minimal defaults for now: 1 unit and 365-day horizon; providers can adjust later.
	await deps.inventoryConfigRepo.upsert({
		variantId,
		defaultTotalUnits: 1,
		horizonDays: 365,
	})
	await deps.inventoryBootstrap.bootstrapVariantInventory({
		variantId,
		totalInventory: 1,
		days: 365,
	})

	return { variantId, status }
}
