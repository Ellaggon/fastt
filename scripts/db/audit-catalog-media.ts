import "dotenv/config"
import postgres from "postgres"

type CountRow = { count: number }

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
	throw new Error("DATABASE_URL is required to audit catalog media.")
}

const sql = postgres(connectionString, { prepare: false })

try {
	const [
		galleryCounts,
		brokenProductLinks,
		brokenVariantLinks,
		uploadCounts,
		unlinkedAssets,
		legacyImageColumns,
		multiplePrimaryGalleries,
		crossOwnedAssets,
	] =
		await Promise.all([
			sql<{ owner: string; count: number }[]>`
				select 'product' as owner, count(*)::int as count from "ProductImage"
				union all
				select 'variant' as owner, count(*)::int as count from "VariantImage"
				union all
				select 'assets' as owner, count(*)::int as count from "Image"
				order by owner
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from "ProductImage" link
				where not exists (select 1 from "Product" product where product.id = link."productId")
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from "VariantImage" link
				where not exists (select 1 from "Variant" variant where variant.id = link."variantId")
			`,
			sql<{ status: string; count: number }[]>`
				select status, count(*)::int as count from "ImageUpload" group by 1 order by 1
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from "Image" image
				where not exists (select 1 from "ProductImage" product_link where product_link."imageId" = image.id)
					and not exists (select 1 from "VariantImage" variant_link where variant_link."imageId" = image.id)
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from information_schema.columns
				where table_schema = 'public'
					and table_name = 'Image'
					and column_name in ('entityType', 'entityId', 'order', 'isPrimary')
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from (
					select "productId" from "ProductImage"
					where "isPrimary" = true
					group by "productId" having count(*) > 1
					union all
					select "variantId" from "VariantImage"
					where "isPrimary" = true
					group by "variantId" having count(*) > 1
				) galleries
			`,
			sql<CountRow[]>`
				select count(*)::int as count
				from "ProductImage" product_link
				join "VariantImage" variant_link on variant_link."imageId" = product_link."imageId"
			`,
		])

	console.log(
		JSON.stringify(
			{
				galleryCounts,
				brokenProductLinks: brokenProductLinks[0]?.count ?? 0,
				brokenVariantLinks: brokenVariantLinks[0]?.count ?? 0,
				uploadCounts,
				unlinkedAssets: unlinkedAssets[0]?.count ?? 0,
				legacyImageColumns: legacyImageColumns[0]?.count ?? 0,
				multiplePrimaryGalleries: multiplePrimaryGalleries[0]?.count ?? 0,
				crossOwnedAssets: crossOwnedAssets[0]?.count ?? 0,
			},
			null,
			2
		)
	)
} finally {
	await sql.end()
}
