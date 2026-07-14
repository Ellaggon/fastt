import { and, db, eq, inArray, Product, ProductStatus, sql, Variant } from "astro:db"

import {
	PRODUCT_VERTICAL_OPTIONS,
	type ProductTypeStorage,
	productTypeLabel,
} from "@/lib/productVerticalRegistry"

export type CatalogProductRow = {
	id: string
	name: string
	productType: string | null
	roomCount: number
	activeRoomCount: number
	status: {
		label: string
		variant: "success" | "info" | "warning"
		state: "published" | "ready" | "draft"
	}
}

export type CatalogSummary = {
	total: number
	published: number
	ready: number
	draft: number
}

export type CatalogVerticalSummary = {
	storageType: ProductTypeStorage
	label: string
	singularLabel: string
	createCta: string
	listHref: string
	createHref: string
	summary: CatalogSummary
}

export type ProviderCatalogSummary = {
	products: CatalogProductRow[]
	summary: CatalogSummary
	verticals: CatalogVerticalSummary[]
}

export function getCatalogStatusMeta(rawState: string | undefined): CatalogProductRow["status"] {
	const state = String(rawState ?? "draft")
		.trim()
		.toLowerCase()
	if (state === "published") {
		return { label: "Publicado", variant: "success", state: "published" }
	}
	if (state === "ready") {
		return { label: "Listo", variant: "info", state: "ready" }
	}
	return { label: "Borrador", variant: "warning", state: "draft" }
}

function emptySummary(): CatalogSummary {
	return { total: 0, published: 0, ready: 0, draft: 0 }
}

function summarizeProducts(products: CatalogProductRow[]): CatalogSummary {
	const summary = emptySummary()
	for (const product of products) {
		summary.total += 1
		if (product.status.state === "published") summary.published += 1
		else if (product.status.state === "ready") summary.ready += 1
		else summary.draft += 1
	}
	return summary
}

export async function getProviderCatalogSummary(
	providerId: string,
	productType?: ProductTypeStorage | null
): Promise<ProviderCatalogSummary> {
	const rows = await db
		.select({
			id: Product.id,
			name: Product.name,
			productType: Product.productType,
		})
		.from(Product)
		.where(
			productType
				? and(
						eq(Product.providerId, providerId),
						sql`lower(${Product.productType}) = ${productType.toLowerCase()}`
					)
				: eq(Product.providerId, providerId)
		)

	const productIds = rows.map((product) => product.id)
	const roomRows = productIds.length
		? await db
				.select({
					productId: Variant.productId,
					variantId: Variant.id,
					isActive: Variant.isActive,
				})
				.from(Variant)
				.where(inArray(Variant.productId, productIds))
		: []
	const roomCounts = new Map<string, { total: number; active: number }>()
	for (const room of roomRows) {
		const productId = String(room.productId)
		const current = roomCounts.get(productId) ?? { total: 0, active: 0 }
		current.total += 1
		if (room.isActive !== false) current.active += 1
		roomCounts.set(productId, current)
	}
	const statuses = productIds.length
		? await db
				.select({
					productId: ProductStatus.productId,
					state: ProductStatus.state,
				})
				.from(ProductStatus)
				.where(inArray(ProductStatus.productId, productIds))
		: []
	const statusMap = new Map(
		statuses.map((status) => [status.productId, String(status.state ?? "draft")])
	)

	const products = rows.map((product) => {
		const rooms = roomCounts.get(String(product.id)) ?? { total: 0, active: 0 }
		return {
			id: product.id,
			name: product.name,
			productType: product.productType,
			roomCount: rooms.total,
			activeRoomCount: rooms.active,
			status: getCatalogStatusMeta(statusMap.get(product.id)),
		}
	})

	const allRows = productType
		? await db
				.select({
					id: Product.id,
					name: Product.name,
					productType: Product.productType,
				})
				.from(Product)
				.where(eq(Product.providerId, providerId))
		: rows
	const allProductIds = allRows.map((product) => product.id)
	const allStatuses = allProductIds.length
		? await db
				.select({
					productId: ProductStatus.productId,
					state: ProductStatus.state,
				})
				.from(ProductStatus)
				.where(inArray(ProductStatus.productId, allProductIds))
		: []
	const allStatusMap = new Map(
		allStatuses.map((status) => [status.productId, String(status.state ?? "draft")])
	)
	const allProducts = allRows.map((product) => ({
		id: product.id,
		name: product.name,
		productType: product.productType,
		roomCount: 0,
		activeRoomCount: 0,
		status: getCatalogStatusMeta(allStatusMap.get(product.id)),
	}))

	const verticals = PRODUCT_VERTICAL_OPTIONS.map((vertical) => {
		const verticalProducts = allProducts.filter(
			(product) =>
				String(product.productType ?? "").toLowerCase() === vertical.storageType.toLowerCase()
		)
		return {
			storageType: vertical.storageType,
			label: vertical.labels.plural,
			singularLabel: productTypeLabel(vertical.storageType),
			createCta: vertical.labels.createCta,
			listHref: vertical.providerRoutes.list,
			createHref: vertical.providerRoutes.create,
			summary: summarizeProducts(verticalProducts),
		}
	})

	return {
		products,
		summary: summarizeProducts(products),
		verticals,
	}
}
