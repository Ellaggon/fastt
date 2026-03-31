import type { SellableUnit } from "../../domain/unit.types"

export interface VariantQueryPort<TUnit extends SellableUnit = SellableUnit> {
	getActiveByProduct(productId: string): Promise<TUnit[]>
}
