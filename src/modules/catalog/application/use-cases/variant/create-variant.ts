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
import { normalizeProductVertical, variantKindForProductType } from "@/lib/productVerticalRegistry"

function normalizeProductType(raw: string): "hotel" | "tour" | "package" | "limousine" | "unknown" {
	return normalizeProductVertical(raw) ?? "unknown"
}

function expectedKindForProductType(pt: string): VariantKind | null {
	return variantKindForProductType(normalizeProductType(pt))
}

export async function createVariant(
	deps: {
		repo: VariantManagementRepositoryPort
		inventoryConfigRepo: VariantInventoryConfigRepositoryPort
		inventoryBootstrap: InventoryBootstrapPort
	},
	params: {
		productId: string
		name: string
		description?: string | null
		kind: VariantKind
		/** Inventory cupo bootstrap; tour_slot should pass maxPax. Default 1 (hotel rooms). */
		defaultTotalUnits?: number
	}
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

	const defaultTotalUnits = Math.max(1, Math.floor(Number(params.defaultTotalUnits ?? 1)) || 1)

	// CAPA 5: ensure inventory exists; tour_slot uses maxPax as cupo default.
	await deps.inventoryConfigRepo.upsert({
		variantId,
		defaultTotalUnits,
		horizonDays: 365,
	})
	await deps.inventoryBootstrap.bootstrapVariantInventory({
		variantId,
		totalInventory: defaultTotalUnits,
		days: 365,
	})

	return { variantId, status }
}
