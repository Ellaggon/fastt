export interface InventoryBootstrapPort {
	bootstrapVariantInventory(params: {
		variantId: string
		totalInventory: number
		days: number
	}): Promise<void>
}
