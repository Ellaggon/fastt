import {
	buildCompleteToPublishEntryHref,
	buildCompleteToPublishResumeHref,
} from "@/lib/playbook/complete-to-publish"
import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { routes } from "@/lib/routes"

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

export function buildPreparationEntryHref(productId: string): string {
	return buildCompleteToPublishEntryHref(productId)
}
