import type { SellableUnitAdapterPort } from "../application/ports/SellableUnitAdapterPort"
import type { AdapterRegistryPort } from "../application/ports/AdapterRegistryPort"

export class AdapterRegistry implements AdapterRegistryPort {
	private adapters = new Map<string, SellableUnitAdapterPort>()

	register(type: string, adapter: SellableUnitAdapterPort) {
		this.adapters.set(type, adapter)
	}

	get(type: string): SellableUnitAdapterPort {
		const adapter = this.adapters.get(type)

		if (!adapter) {
			throw new Error(`No adapter registered for type: ${type}`)
		}

		return adapter
	}
}
