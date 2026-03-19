import type { SellableUnitAdapterPort } from "./SellableUnitAdapterPort"

export interface AdapterRegistryPort {
	register(type: string, adapter: SellableUnitAdapterPort): void
	get(type: string): SellableUnitAdapterPort
}
