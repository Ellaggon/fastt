export interface ProductContentRulesRepositoryPort {
	readProductContentRulesText(productId: string): Promise<string | null>
}
