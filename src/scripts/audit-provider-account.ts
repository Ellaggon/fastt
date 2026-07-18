import { db, inArray, Product, Provider, ProviderUser, sql, User } from "astro:db"

export default async function auditProviderAccount() {
	const targetEmail = String(process.env.AUDIT_PROVIDER_EMAIL ?? "")
		.trim()
		.toLowerCase()

	if (!targetEmail) {
		throw new Error("AUDIT_PROVIDER_EMAIL is required")
	}

	const users = await db
		.select({ id: User.id, email: User.email })
		.from(User)
		.where(sql`lower(${User.email}) = ${targetEmail}`)

	const links = users.length
		? await db
				.select({
					id: ProviderUser.id,
					userId: ProviderUser.userId,
					providerId: ProviderUser.providerId,
					role: ProviderUser.role,
				})
				.from(ProviderUser)
				.where(
					inArray(
						ProviderUser.userId,
						users.map((user) => user.id)
					)
				)
		: []

	const providers = await db
		.select({
			id: Provider.id,
			displayName: Provider.displayName,
			legalName: Provider.legalName,
			status: Provider.status,
		})
		.from(Provider)

	const products = await db
		.select({
			id: Product.id,
			name: Product.name,
			productType: Product.productType,
			providerId: Product.providerId,
		})
		.from(Product)

	const linkedProviderIds = new Set(links.map((link) => link.providerId))
	const productProviderIds = new Set(products.map((product) => product.providerId).filter(Boolean))

	console.log(
		JSON.stringify(
			{
				targetEmail,
				users,
				links,
				linkedProviders: providers.filter((provider) => linkedProviderIds.has(provider.id)),
				allProviders: providers,
				productsByLinkedProviders: products.filter((product) =>
					linkedProviderIds.has(String(product.providerId ?? ""))
				),
				productProviderIds: Array.from(productProviderIds),
				productCountByProvider: Array.from(productProviderIds).map((providerId) => ({
					providerId,
					count: products.filter((product) => product.providerId === providerId).length,
					names: products
						.filter((product) => product.providerId === providerId)
						.map((product) => `${product.productType}:${product.name}`),
				})),
			},
			null,
			2
		)
	)
}
