import { db, eq, ProductContent } from "astro:db"

import type { ProductContentRulesRepositoryPort } from "@/modules/rules/application/ports/ProductContentRulesRepositoryPort"

export class ProductContentRulesRepository implements ProductContentRulesRepositoryPort {
	async readProductContentRulesText(productId: string): Promise<string | null> {
		const row = await db
			.select({ rules: ProductContent.rules })
			.from(ProductContent)
			.where(eq(ProductContent.productId, productId))
			.get()
		const value = row?.rules == null ? null : String(row.rules).trim()
		return value && value.length > 0 ? value : null
	}
}
