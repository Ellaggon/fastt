import type {
	VariantKind,
	VariantLifecycleState,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import { createVariantSchema } from "../../schemas/variant/variantSchemas"
import type {
	InventoryBootstrapPort,
	VariantInventoryConfigRepositoryPort,
} from "@/modules/inventory/public"
import {
	normalizeProductTypeForStorage,
	variantKindForProductType,
} from "@/lib/catalog/productVerticalRegistry"

function normalizeProductType(raw: string): "hotel" | "tour" | "package" | "limousine" | "unknown" {
	return normalizeProductTypeForStorage(raw) ?? "unknown"
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
): Promise<{ variantId: string; lifecycleState: VariantLifecycleState }> {
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

	// A new unit is not validated and never enters sales implicitly.
	const lifecycleState: VariantLifecycleState = "draft"

	await deps.repo.createVariant({
		id: variantId,
		productId: parsed.productId,
		kind: parsed.kind,
		name: parsed.name,
		description: parsed.description ?? null,
		lifecycleState,
		createdAt,
		salesEnabled: false,
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

	return { variantId, lifecycleState }
}
