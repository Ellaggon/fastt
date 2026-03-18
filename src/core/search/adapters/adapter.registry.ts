import type { SellableUnitAdapter } from "./adapter.SellableUnit"

export class AdapterRegistry {
	private adapters = new Map<string, SellableUnitAdapter>()

	register(type: string, adapter: SellableUnitAdapter) {
		this.adapters.set(type, adapter)
	}

	get(type: string): SellableUnitAdapter {
		const adapter = this.adapters.get(type)

		if (!adapter) {
			throw new Error(`No adapter registered for type: ${type}`)
		}

		return adapter
	}
}
