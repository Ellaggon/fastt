import {
	buildCompleteToPublishEntryHref,
	buildCompleteToPublishResumeHref,
} from "@/lib/playbook/complete-to-publish"
import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { routes } from "@/lib/routes"
import {
	first,
	and,
	db,
	eq,
	inArray,
	ProductPreparationSnapshot,
	ProductStatus,
} from "@/shared/infrastructure/db/compat"

export type ProductPreparationSummary = {
	productId: string
	status: string
	statusLabel: string
	statusVariant: "success" | "info" | "warning"
	isPublished: boolean
	readinessPercent: number
	blockerCount: number
	blockerPreview: string[]
	readyToPublish: boolean
	continuePreparationHref: string
	previewHref: string
	nextStepLabel: string | null
}

function normalizeStatus(raw: string | undefined): string {
	return String(raw ?? "draft")
		.trim()
		.toLowerCase()
}

function statusPresentation(status: string): {
	label: string
	variant: "success" | "info" | "warning"
} {
	if (status === "published") return { label: "Publicado", variant: "success" }
	if (status === "ready") return { label: "Listo para publicar", variant: "info" }
	return { label: "En preparación", variant: "warning" }
}

function normalizeBlockerPreview(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	return raw.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function normalizeStatusVariant(raw: unknown): "success" | "info" | "warning" {
	if (raw === "success" || raw === "info" || raw === "warning") return raw
	return "warning"
}

function productPreparationSnapshotTable(): any | null {
	const table = ProductPreparationSnapshot as any
	return table?.productId && table?.providerId ? table : null
}

export function productPreparationSummaryFromSnapshot(row: {
	productId: string
	status: string | null
	statusLabel: string | null
	statusVariant: string | null
	isPublished: boolean | null
	readinessPercent: number | null
	blockerCount: number | null
	blockerPreviewJson: unknown
	readyToPublish: boolean | null
	continuePreparationHref: string | null
	previewHref: string | null
	nextStepLabel: string | null
}): ProductPreparationSummary {
	const productId = String(row.productId)
	const status = normalizeStatus(row.status ?? undefined)
	const presentation = statusPresentation(status)
	return {
		productId,
		status,
		statusLabel: String(row.statusLabel ?? presentation.label),
		statusVariant: normalizeStatusVariant(row.statusVariant),
		isPublished: Boolean(row.isPublished),
		readinessPercent: Math.max(0, Math.min(100, Number(row.readinessPercent ?? 0))),
		blockerCount: Math.max(0, Number(row.blockerCount ?? 0)),
		blockerPreview: normalizeBlockerPreview(row.blockerPreviewJson),
		readyToPublish: Boolean(row.readyToPublish),
		continuePreparationHref: String(
			row.continuePreparationHref ?? buildCompleteToPublishEntryHref(productId)
		),
		previewHref: String(row.previewHref ?? routes.productPreview(productId)),
		nextStepLabel: row.nextStepLabel ? String(row.nextStepLabel) : null,
	}
}

export async function listProductPreparationSnapshots(
	providerId: string,
	productIds: string[]
): Promise<Map<string, ProductPreparationSummary>> {
	const normalizedProviderId = String(providerId ?? "").trim()
	const normalizedProductIds = Array.from(
		new Set(productIds.map((id) => String(id ?? "").trim()).filter(Boolean))
	)
	if (!normalizedProviderId || normalizedProductIds.length === 0) return new Map()

	const snapshot = productPreparationSnapshotTable()
	if (!snapshot) return new Map()

	const rows = await db
		.select({
			productId: snapshot.productId,
			status: snapshot.status,
			statusLabel: snapshot.statusLabel,
			statusVariant: snapshot.statusVariant,
			isPublished: snapshot.isPublished,
			readinessPercent: snapshot.readinessPercent,
			blockerCount: snapshot.blockerCount,
			blockerPreviewJson: snapshot.blockerPreviewJson,
			readyToPublish: snapshot.readyToPublish,
			continuePreparationHref: snapshot.continuePreparationHref,
			previewHref: snapshot.previewHref,
			nextStepLabel: snapshot.nextStepLabel,
		})
		.from(snapshot)
		.where(
			and(
				eq(snapshot.providerId, normalizedProviderId),
				inArray(snapshot.productId, normalizedProductIds)
			)
		)

	const summaries = new Map<string, ProductPreparationSummary>()
	for (const row of rows) {
		summaries.set(String(row.productId), productPreparationSummaryFromSnapshot(row))
	}
	return summaries
}

export async function summarizeProductPreparation(params: {
	productId: string
	providerId: string
	status?: string
	request?: Request
	url?: URL
}): Promise<ProductPreparationSummary | null> {
	const productId = String(params.productId ?? "").trim()
	const providerId = String(params.providerId ?? "").trim()
	if (!productId || !providerId) return null

	const status = normalizeStatus(params.status)
	const presentation = statusPresentation(status)
	const previewHref = routes.productPreview(productId)

	if (status === "published") {
		return {
			productId,
			status,
			statusLabel: presentation.label,
			statusVariant: presentation.variant,
			isPublished: true,
			readinessPercent: 100,
			blockerCount: 0,
			blockerPreview: [],
			readyToPublish: false,
			continuePreparationHref: routes.productDetail(productId),
			previewHref,
			nextStepLabel: null,
		}
	}

	const publishState = await loadCompleteToPublishState({
		productId,
		providerId,
		request: params.request,
		url: params.url,
	})
	if (!publishState) return null

	const blockers = publishState.blockers.filter((check) => check.sectionKey !== "preview")
	const nextBlocker = blockers[0] ?? null

	return {
		productId,
		status,
		statusLabel: publishState.readyToPublish ? "Listo para publicar" : presentation.label,
		statusVariant: publishState.readyToPublish ? "info" : presentation.variant,
		isPublished: false,
		readinessPercent: publishState.readinessPercent,
		blockerCount: blockers.length,
		blockerPreview: blockers.slice(0, 3).map((check) => check.label),
		readyToPublish: publishState.readyToPublish,
		continuePreparationHref: buildCompleteToPublishResumeHref(productId, publishState.checks),
		previewHref,
		nextStepLabel: nextBlocker?.label ?? null,
	}
}

export async function refreshProductPreparationSnapshot(params: {
	productId: string
	providerId: string
	status?: string
	request?: Request
	url?: URL
}): Promise<ProductPreparationSummary | null> {
	const summary = await summarizeProductPreparation(params)
	if (!summary) return null

	const snapshot = productPreparationSnapshotTable()
	if (!snapshot) return summary

	const now = new Date()
	await db
		.insert(snapshot)
		.values({
			productId: summary.productId,
			providerId: params.providerId,
			status: summary.status,
			statusLabel: summary.statusLabel,
			statusVariant: summary.statusVariant,
			isPublished: summary.isPublished,
			readinessPercent: summary.readinessPercent,
			blockerCount: summary.blockerCount,
			blockerPreviewJson: summary.blockerPreview,
			readyToPublish: summary.readyToPublish,
			continuePreparationHref: summary.continuePreparationHref,
			previewHref: summary.previewHref,
			nextStepLabel: summary.nextStepLabel,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [snapshot.productId],
			set: {
				providerId: params.providerId,
				status: summary.status,
				statusLabel: summary.statusLabel,
				statusVariant: summary.statusVariant,
				isPublished: summary.isPublished,
				readinessPercent: summary.readinessPercent,
				blockerCount: summary.blockerCount,
				blockerPreviewJson: summary.blockerPreview,
				readyToPublish: summary.readyToPublish,
				continuePreparationHref: summary.continuePreparationHref,
				previewHref: summary.previewHref,
				nextStepLabel: summary.nextStepLabel,
				updatedAt: now,
			},
		})

	return summary
}

export async function refreshProductPreparationSnapshotForProduct(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
}): Promise<ProductPreparationSummary | null> {
	const productId = String(params.productId ?? "").trim()
	const providerId = String(params.providerId ?? "").trim()
	if (!productId || !providerId) return null

	const status = await db
		.select({ state: ProductStatus.state })
		.from(ProductStatus)
		.where(eq(ProductStatus.productId, productId))
		.then(first)

	return refreshProductPreparationSnapshot({
		productId,
		providerId,
		status: status?.state,
		request: params.request,
		url: params.url,
	})
}

export async function refreshProductPreparationSnapshotAfterMutation(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
	source: string
}): Promise<void> {
	try {
		await refreshProductPreparationSnapshotForProduct(params)
	} catch (error) {
		console.warn("product preparation snapshot refresh failed", {
			source: params.source,
			productId: params.productId,
			providerId: params.providerId,
			error: error instanceof Error ? error.message : String(error),
		})
	}
}

export function buildPreparationEntryHref(productId: string): string {
	return buildCompleteToPublishEntryHref(productId)
}
