import {
	and,
	db,
	eq,
	inArray,
	first,
	Product,
	ProductOperationalSurface,
} from "@/shared/infrastructure/db/compat"
import { routes } from "@/lib/routes"
import {
	summarizeProductPreparation,
	type ProductPreparationSummary,
} from "@/lib/playbook/summarize-product-preparation"

export type { ProductPreparationSummary }
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import {
	derivePolicySummaryFromResolvedPolicies,
	REQUIRED_POLICY_CATEGORIES,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { listRatePlansByProvider } from "@/modules/pricing/public"

const SURFACE_MAX_AGE_MS = Number(process.env.FASTT_PRODUCT_SURFACE_MAX_AGE_MS ?? 10 * 60 * 1000)

export type ProductPolicyCoverageState = {
	totalCategories: number
	coveredCategories: number
	missingCategories: string[]
	isComplete: boolean
	summary: string
	ratePlanId: string | null
	updatedAt: string
}

export type ProductOperationalSurfaceRead = {
	productId: string
	providerId: string
	productName: string
	productType: string
	status: string
	readiness: ProductPreparationSummary | null
	subtypeSummary: string
	imagePreviews: Array<{ id: string; url: string }>
	coverImage: { id: string; url: string } | null
	variantCount: number
	activeVariantCount: number
	defaultRatePlanIds: string[]
	policyCoverageState: ProductPolicyCoverageState | null
	conditionsHref: string
	updatedAt: Date
}

type SurfaceRatePlanRow = {
	ratePlanId?: unknown
	productId?: unknown
	variantId?: unknown
	isDefault?: unknown
}

function isFresh(updatedAt: unknown, maxAgeMs: number): boolean {
	const time = updatedAt ? new Date(updatedAt as any).getTime() : 0
	return Number.isFinite(time) && Date.now() - time <= maxAgeMs
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function normalizeBlockerPreview(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function normalizePreparationVariant(value: unknown): "success" | "info" | "warning" {
	return value === "success" || value === "info" || value === "warning" ? value : "warning"
}

function preparationFromRow(row: any): ProductPreparationSummary {
	const productId = String(row.productId ?? "")
	const status = String(row.status ?? "draft")
		.trim()
		.toLowerCase()
	return {
		productId,
		status,
		statusLabel: String(row.preparationStatusLabel ?? "En preparación"),
		statusVariant: normalizePreparationVariant(row.preparationStatusVariant),
		isPublished: Boolean(row.isPublished),
		readinessPercent: Math.max(0, Math.min(100, Number(row.readinessPercent ?? 0))),
		blockerCount: Math.max(0, Number(row.blockerCount ?? 0)),
		blockerPreview: normalizeBlockerPreview(row.blockerPreviewJson),
		readyToPublish: Boolean(row.readyToPublish),
		completedChecks: null,
		totalChecks: null,
		continuePreparationHref: String(
			row.continuePreparationHref ?? `/product/${productId}/complete-to-publish`
		),
		previewHref: String(row.previewHref ?? routes.productPreview(productId)),
		nextStepLabel: row.nextStepLabel ? String(row.nextStepLabel) : null,
		nextStepBody: null,
		nextStepCta: null,
		checks: [],
	}
}

function normalizeImagePreviews(value: unknown): Array<{ id: string; url: string }> {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => {
			const raw = item as { id?: unknown; url?: unknown }
			const id = String(raw?.id ?? "").trim()
			const url = String(raw?.url ?? "").trim()
			return id && url ? { id, url } : null
		})
		.filter(Boolean) as Array<{ id: string; url: string }>
}

function normalizeCoverImage(value: unknown): { id: string; url: string } | null {
	const raw = value as { id?: unknown; url?: unknown } | null
	const id = String(raw?.id ?? "").trim()
	const url = String(raw?.url ?? "").trim()
	return id && url ? { id, url } : null
}

function normalizePolicyCoverage(value: unknown): ProductPolicyCoverageState | null {
	if (!value || typeof value !== "object") return null
	const raw = value as Partial<ProductPolicyCoverageState>
	return {
		totalCategories: Number(raw.totalCategories ?? REQUIRED_POLICY_CATEGORIES.length),
		coveredCategories: Number(raw.coveredCategories ?? 0),
		missingCategories: asStringArray(raw.missingCategories),
		isComplete: Boolean(raw.isComplete),
		summary: String(raw.summary ?? "Sin condiciones configuradas"),
		ratePlanId: raw.ratePlanId ? String(raw.ratePlanId) : null,
		updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
	}
}

function surfaceFromRow(row: any): ProductOperationalSurfaceRead {
	return {
		productId: String(row.productId),
		providerId: String(row.providerId),
		productName: String(row.productName ?? ""),
		productType: String(row.productType ?? ""),
		status: String(row.status ?? "draft"),
		readiness: preparationFromRow(row),
		subtypeSummary: String(row.subtypeSummary ?? ""),
		imagePreviews: normalizeImagePreviews(row.imagePreviewJson),
		coverImage: normalizeCoverImage(row.coverImageJson),
		variantCount: Number(row.variantCount ?? 0),
		activeVariantCount: Number(row.activeVariantCount ?? 0),
		defaultRatePlanIds: asStringArray(row.defaultRatePlanIdsJson),
		policyCoverageState: normalizePolicyCoverage(row.policyCoverageStateJson),
		conditionsHref: String(row.conditionsHref ?? routes.rates()),
		updatedAt: new Date(row.updatedAt),
	}
}

async function readSurface(params: {
	productId: string
	providerId: string
	allowStale?: boolean
}): Promise<ProductOperationalSurfaceRead | null> {
	const table = ProductOperationalSurface as any
	if (!table?.productId) return null
	const row = await db
		.select()
		.from(ProductOperationalSurface)
		.where(
			and(
				eq(ProductOperationalSurface.productId, params.productId),
				eq(ProductOperationalSurface.providerId, params.providerId)
			)
		)
		.then(first)
		.catch(() => null)
	if (!row) return null
	if (!params.allowStale && !isFresh(row.updatedAt, SURFACE_MAX_AGE_MS)) return null
	return surfaceFromRow(row)
}

export async function listProductOperationalPreparation(
	providerId: string,
	productIds: string[]
): Promise<Map<string, ProductPreparationSummary>> {
	const ids = Array.from(new Set(productIds.map((id) => String(id ?? "").trim()).filter(Boolean)))
	if (!providerId || ids.length === 0) return new Map()
	const rows = await db
		.select()
		.from(ProductOperationalSurface)
		.where(
			and(
				eq(ProductOperationalSurface.providerId, providerId),
				inArray(ProductOperationalSurface.productId, ids)
			)
		)
	const result = new Map<string, ProductPreparationSummary>()
	for (const row of rows) result.set(String(row.productId), preparationFromRow(row))
	return result
}

async function resolvePolicyCoverageState(params: {
	productId: string
	providerId: string
	defaultRatePlanIds: string[]
}): Promise<ProductPolicyCoverageState | null> {
	const requiredCategories = [...REQUIRED_POLICY_CATEGORIES]
	const ratePlanRows = (await listRatePlansByProvider(params.providerId)) as SurfaceRatePlanRow[]
	const target =
		ratePlanRows.find(
			(row) => String(row.productId) === params.productId && Boolean(row.isDefault)
		) ??
		ratePlanRows.find((row) => String(row.productId) === params.productId) ??
		null
	const ratePlanId = String(target?.ratePlanId ?? params.defaultRatePlanIds[0] ?? "").trim()
	if (!ratePlanId) {
		return {
			totalCategories: requiredCategories.length,
			coveredCategories: 0,
			missingCategories: requiredCategories,
			isComplete: false,
			summary: "Sin tarifa para configurar condiciones",
			ratePlanId: null,
			updatedAt: new Date().toISOString(),
		}
	}
	try {
		const today = new Date()
		const checkIn = today.toISOString().slice(0, 10)
		const checkOut = new Date(today.getTime() + 86400000).toISOString().slice(0, 10)
		const resolved = await resolveEffectivePolicies({
			productId: params.productId,
			variantId: target?.variantId ? String(target.variantId) : undefined,
			ratePlanId,
			checkIn,
			checkOut,
			channel: "web",
			requiredCategories,
			onMissingCategory: "return_null",
		})
		const missingCategories = resolved.missingCategories
		return {
			totalCategories: requiredCategories.length,
			coveredCategories: Math.max(requiredCategories.length - missingCategories.length, 0),
			missingCategories,
			isComplete: missingCategories.length === 0,
			summary: derivePolicySummaryFromResolvedPolicies(resolved),
			ratePlanId,
			updatedAt: new Date().toISOString(),
		}
	} catch {
		return {
			totalCategories: requiredCategories.length,
			coveredCategories: 0,
			missingCategories: requiredCategories,
			isComplete: false,
			summary: "Sin condiciones configuradas",
			ratePlanId,
			updatedAt: new Date().toISOString(),
		}
	}
}

function subtypeSummary(aggregate: any): string {
	if (aggregate.subtype?.kind === "hotel") {
		return `Hotel · ${aggregate.subtype.stars ? `${aggregate.subtype.stars}★` : "Sin estrellas"}`
	}
	if (aggregate.subtype?.kind === "tour") {
		return `Tour · ${aggregate.subtype.duration || "Duración no definida"}`
	}
	if (aggregate.subtype?.kind === "package") {
		return `Paquete · ${aggregate.subtype.days ?? 0} días / ${aggregate.subtype.nights ?? 0} noches`
	}
	return "Subtipo no configurado"
}

export async function refreshProductOperationalSurface(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
	source?: string
}): Promise<ProductOperationalSurfaceRead | null> {
	const [aggregate, variantsAggregate, statusRow] = await Promise.all([
		getProductFullAggregate(params.productId, params.providerId),
		getProductVariantsAggregate(params.productId, params.providerId),
		db
			.select({ state: Product.publicationState })
			.from(Product)
			.where(eq(Product.id, params.productId))
			.then(first),
	])
	if (!aggregate) return null

	const status = String(statusRow?.state ?? "draft")
		.trim()
		.toLowerCase()
	const readiness = await summarizeProductPreparation({
		productId: params.productId,
		providerId: params.providerId,
		status,
		request: params.request,
		url: params.url,
	})

	const variants = Array.isArray(variantsAggregate?.variants) ? variantsAggregate.variants : []
	const activeVariants = variants.filter(
		(variant: any) => String(variant.lifecycleState ?? "") !== "archived"
	)
	const defaultRatePlanIds = [
		...new Set(
			variants.map((variant: any) => String(variant.defaultRatePlanId ?? "").trim()).filter(Boolean)
		),
	]
	const policyCoverageState = await resolvePolicyCoverageState({
		productId: params.productId,
		providerId: params.providerId,
		defaultRatePlanIds,
	})
	const conditionsHref = policyCoverageState?.ratePlanId
		? routes.ratePlanPolicies(policyCoverageState.ratePlanId)
		: routes.rates()
	const imagePreviews = aggregate.images.slice(0, 3).map((image: any) => ({
		id: String(image.id),
		url: String(image.url),
	}))
	const cover =
		aggregate.images.find((image: any) => image.isPrimary) ?? aggregate.images[0] ?? null
	const coverImage = cover ? { id: String(cover.id), url: String(cover.url) } : null

	const now = new Date()
	const builtSurface: ProductOperationalSurfaceRead = {
		productId: params.productId,
		providerId: params.providerId,
		productName: aggregate.displayName,
		productType: aggregate.productType,
		status,
		readiness,
		subtypeSummary: subtypeSummary(aggregate),
		imagePreviews,
		coverImage,
		variantCount: variants.length,
		activeVariantCount: activeVariants.length,
		defaultRatePlanIds,
		policyCoverageState,
		conditionsHref,
		updatedAt: now,
	}

	await db
		.insert(ProductOperationalSurface)
		.values({
			productId: params.productId,
			providerId: params.providerId,
			productName: aggregate.displayName,
			productType: aggregate.productType,
			status,
			preparationStatusLabel: readiness?.statusLabel ?? "En preparación",
			preparationStatusVariant: readiness?.statusVariant ?? "warning",
			isPublished: readiness?.isPublished ?? false,
			readinessPercent: readiness?.readinessPercent ?? 0,
			blockerCount: readiness?.blockerCount ?? 0,
			blockerPreviewJson: readiness?.blockerPreview ?? [],
			readyToPublish: readiness?.readyToPublish ?? false,
			continuePreparationHref:
				readiness?.continuePreparationHref ?? routes.productDetail(params.productId),
			previewHref: readiness?.previewHref ?? routes.productPreview(params.productId),
			nextStepLabel: readiness?.nextStepLabel ?? null,
			preparationUpdatedAt: now,
			subtypeSummary: subtypeSummary(aggregate),
			imagePreviewJson: imagePreviews,
			coverImageJson: coverImage,
			variantCount: variants.length,
			activeVariantCount: activeVariants.length,
			defaultRatePlanIdsJson: defaultRatePlanIds,
			policyCoverageStateJson: policyCoverageState,
			conditionsHref,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [ProductOperationalSurface.productId],
			set: {
				providerId: params.providerId,
				productName: aggregate.displayName,
				productType: aggregate.productType,
				status,
				preparationStatusLabel: readiness?.statusLabel ?? "En preparación",
				preparationStatusVariant: readiness?.statusVariant ?? "warning",
				isPublished: readiness?.isPublished ?? false,
				readinessPercent: readiness?.readinessPercent ?? 0,
				blockerCount: readiness?.blockerCount ?? 0,
				blockerPreviewJson: readiness?.blockerPreview ?? [],
				readyToPublish: readiness?.readyToPublish ?? false,
				continuePreparationHref:
					readiness?.continuePreparationHref ?? routes.productDetail(params.productId),
				previewHref: readiness?.previewHref ?? routes.productPreview(params.productId),
				nextStepLabel: readiness?.nextStepLabel ?? null,
				preparationUpdatedAt: now,
				subtypeSummary: subtypeSummary(aggregate),
				imagePreviewJson: imagePreviews,
				coverImageJson: coverImage,
				variantCount: variants.length,
				activeVariantCount: activeVariants.length,
				defaultRatePlanIdsJson: defaultRatePlanIds,
				policyCoverageStateJson: policyCoverageState,
				conditionsHref,
				updatedAt: now,
			},
		})
		.catch(() => null)

	return (
		(await readSurface({
			productId: params.productId,
			providerId: params.providerId,
			allowStale: true,
		})) ?? builtSurface
	)
}

export async function getProductOperationalSurface(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
}): Promise<ProductOperationalSurfaceRead | null> {
	const productId = String(params.productId ?? "").trim()
	const providerId = String(params.providerId ?? "").trim()
	if (!productId || !providerId) return null
	return (
		(await readSurface({ productId, providerId })) ??
		(await refreshProductOperationalSurface({
			productId,
			providerId,
			request: params.request,
			url: params.url,
			source: "surface_miss",
		}))
	)
}

export async function refreshProductOperationalSurfaceAfterMutation(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
	source: string
}): Promise<void> {
	try {
		await refreshProductOperationalSurface(params)
	} catch (error) {
		console.warn("product operational surface refresh failed", {
			source: params.source,
			productId: params.productId,
			providerId: params.providerId,
			error: error instanceof Error ? error.message : String(error),
		})
	}
}

export async function refreshProductOperationalSurfaceByProductId(params: {
	productId: string
	source: string
}): Promise<void> {
	const productId = String(params.productId ?? "").trim()
	if (!productId) return
	const row = await db
		.select({ providerId: Product.providerId })
		.from(Product)
		.where(eq(Product.id, productId))
		.then(first)
		.catch(() => null)
	const providerId = String(row?.providerId ?? "").trim()
	if (!providerId) return
	await refreshProductOperationalSurfaceAfterMutation({
		productId,
		providerId,
		source: params.source,
	})
}
