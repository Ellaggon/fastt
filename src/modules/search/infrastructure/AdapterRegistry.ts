import type { SellableUnitAdapterPort } from "../application/ports/SellableUnitAdapterPort"
import type { AdapterRegistryPort } from "../application/ports/AdapterRegistryPort"
import type { SellableUnit } from "../domain/unit.types"

export class AdapterRegistry<TUnit extends SellableUnit = SellableUnit>
	implements AdapterRegistryPort<TUnit>
{
	private adapters = new Map<string, SellableUnitAdapterPort<TUnit>>()

	register(type: string, adapter: SellableUnitAdapterPort<TUnit>) {
		this.adapters.set(type, adapter)
	}

	get(type: string): SellableUnitAdapterPort<TUnit> {
		const adapter = this.adapters.get(type)

		if (!adapter) {
			throw new Error(`No adapter registered for type: ${type}`)
		}

		return adapter
	}
}
