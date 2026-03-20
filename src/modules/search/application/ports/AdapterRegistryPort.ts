import type { SellableUnitAdapterPort } from "./SellableUnitAdapterPort"
import type { SellableUnit } from "../../domain/unit.types"

export interface AdapterRegistryPort<TUnit extends SellableUnit = SellableUnit> {
	register(type: string, adapter: SellableUnitAdapterPort<TUnit>): void
	get(type: string): SellableUnitAdapterPort<TUnit>
}
