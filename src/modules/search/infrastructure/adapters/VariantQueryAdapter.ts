import type { VariantQueryPort } from "../../application/ports/VariantQueryPort"
import type { SellableUnit } from "../../domain/unit.types"

export class VariantQueryAdapter<TUnit extends SellableUnit> implements VariantQueryPort<TUnit> {
	constructor(
		private repo: {
			getActiveByProduct(productId: string): Promise<TUnit[]>
		}
	) {}

	async getActiveByProduct(productId: string) {
		return this.repo.getActiveByProduct(productId)
	}
}
