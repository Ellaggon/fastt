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

function normalizeProductType(
	raw: string
): "hotel" | "tour" | "package" | "limousine" | "whole_home" | "unknown" {
	return normalizeProductTypeForStorage(raw) ?? "unknown"
}

function expectedKindForProductType(pt: string): VariantKind | null {
	return variantKindForProductType(normalizeProductType(pt))
}

export async function createVariant(
	deps: {
		repo: VariantManagementRepositoryPort
		inventoryConfigRepo: VariantInventoryConfigRepositoryPort
		inventoryBootstrap?: InventoryBootstrapPort
	},
	params: {
		/** Trusted server-generated ID for recoverable creation. */
		variantId?: string
		productId: string
		name: string
		description?: string | null
		kind: VariantKind
		/** Default capacity; tour_slot should pass maxPax. Default 1 (hotel rooms). */
		defaultTotalUnits?: number
		/**
		 * Profile and date inventory are separate. Tour slots skip bootstrap so the
		 * provider opens dates explicitly in the calendar; other variants retain the
		 * existing bootstrap behavior.
		 */
		bootstrapInventory?: boolean
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

	const variantId = params.variantId ?? crypto.randomUUID()
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

	await deps.inventoryConfigRepo.upsert({
		variantId,
		defaultTotalUnits,
		horizonDays: 365,
	})
	if (params.bootstrapInventory !== false) {
		if (!deps.inventoryBootstrap) throw new Error("Inventory bootstrap is required")
		// Only bootstrap when this action explicitly owns date setup.
		await deps.inventoryBootstrap.bootstrapVariantInventory({
			variantId,
			totalInventory: defaultTotalUnits,
			days: 365,
		})
	}

	return { variantId, lifecycleState }
}
