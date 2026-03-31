import type { InventoryBootstrapPort } from "../../application/ports/InventoryBootstrapPort"
import { InventoryBootstrapService } from "./InventoryBootstrapService"

export class InventoryBootstrapper implements InventoryBootstrapPort {
	constructor(private svc = new InventoryBootstrapService()) {}

	async bootstrapVariantInventory(params: {
		variantId: string
		totalInventory: number
		days: number
	}) {
		return this.svc.bootstrap({
			variantId: params.variantId,
			totalInventory: params.totalInventory,
			days: params.days,
		})
	}
}
