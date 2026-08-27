import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import {
	and,
	asc,
	db,
	eq,
	inArray,
	Product,
	ProductCategory,
	ProductCategoryLink,
} from "@/shared/infrastructure/db/compat"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

const linkSchema = z.object({
	productId: z.string().trim().min(1),
	categoryIds: z.array(z.string().trim().min(1)).default([]),
})

export const GET: APIRoute = async ({ url }) => {
	const vertical =
		String(url.searchParams.get("vertical") ?? "tour")
			.trim()
			.toLowerCase() || "tour"

	const categories = await db
		.select({
			id: ProductCategory.id,
			slug: ProductCategory.slug,
			name: ProductCategory.name,
			vertical: ProductCategory.vertical,
			sortOrder: ProductCategory.sortOrder,
		})
		.from(ProductCategory)
		.where(
			and(
				eq(ProductCategory.vertical, vertical),
				eq(ProductCategory.isActive, true),
				eq(ProductCategory.dataClass, "production")
			)
		)
		.orderBy(asc(ProductCategory.sortOrder), asc(ProductCategory.name))

	const productId = String(url.searchParams.get("productId") ?? "").trim()
	let linkedIds: string[] = []
	if (productId) {
		const links = await db
			.select({ categoryId: ProductCategoryLink.categoryId })
			.from(ProductCategoryLink)
			.where(eq(ProductCategoryLink.productId, productId))
		linkedIds = links.map((row) => String(row.categoryId))
	}

	return new Response(JSON.stringify({ ok: true, categories, linkedIds }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		const body = await request.json().catch(() => ({}))
		const parsed = linkSchema.parse(body)
		const product = await db
			.select({ id: Product.id, productType: Product.productType })
			.from(Product)
			.where(and(eq(Product.id, parsed.productId), eq(Product.providerId, providerId)))
			.then((rows) => rows[0])
		if (!product) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}
		const vertical = String(product.productType ?? "")
			.trim()
			.toLowerCase()
		if (!vertical) {
			return new Response(JSON.stringify({ error: "invalid_product_vertical" }), { status: 409 })
		}

		const uniqueIds = [...new Set(parsed.categoryIds.map((id) => id.trim()).filter(Boolean))]
		if (uniqueIds.length > 0) {
			const valid = await db
				.select({ id: ProductCategory.id })
				.from(ProductCategory)
				.where(
					and(
						inArray(ProductCategory.id, uniqueIds),
						eq(ProductCategory.vertical, vertical),
						eq(ProductCategory.isActive, true),
						eq(ProductCategory.dataClass, "production")
					)
				)
			const validSet = new Set(valid.map((row) => String(row.id)))
			for (const id of uniqueIds) {
				if (!validSet.has(id)) {
					return new Response(JSON.stringify({ error: "invalid_category", categoryId: id }), {
						status: 400,
					})
				}
			}
		}

		await db.transaction(async (tx) => {
			await tx
				.delete(ProductCategoryLink)
				.where(eq(ProductCategoryLink.productId, parsed.productId))
			if (uniqueIds.length === 0) return
			const now = new Date()
			await tx.insert(ProductCategoryLink).values(
				uniqueIds.map((categoryId) => ({
					id: crypto.randomUUID(),
					productId: parsed.productId,
					categoryId,
					createdAt: now,
				}))
			)
		})

		return new Response(JSON.stringify({ ok: true, linkedIds: uniqueIds }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
			})
		}
		console.error("product-categories POST", e)
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}
