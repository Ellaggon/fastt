import type { VariantQueryPort } from "../../application/ports/VariantQueryPort"

export class VariantQueryAdapter implements VariantQueryPort {
	constructor(private repo: { getActiveByProduct(productId: string): Promise<any[]> }) {}

	async getActiveByProduct(productId: string) {
		return this.repo.getActiveByProduct(productId)
	}
}
