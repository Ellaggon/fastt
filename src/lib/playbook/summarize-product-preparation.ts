import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import {
	loadTourCommercialContext,
	type LoadedTourContext,
} from "@/lib/tours/loadTourCommercialContext"
import {
	tourContextSelectionHref,
	withTourCommercialContext,
} from "@/lib/tours/resolveTourCommercialContext"
import {
	buildCompleteToPublishEntryHref,
	resolveCompleteToPublishResume,
} from "@/lib/playbook/complete-to-publish"
import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { routes } from "@/lib/routes"

export type ProductPreparationSummary = {
	productId: string
	tourPresentation?: ReturnType<typeof presentTourDiagnostic>
	tourContext?: LoadedTourContext
	status: string
	statusLabel: string
	statusVariant: "success" | "info" | "warning"
	isPublished: boolean
	readinessPercent: number
	blockerCount: number
	blockerPreview: string[]
	readyToPublish: boolean
	completedChecks: number | null
	totalChecks: number | null
	continuePreparationHref: string
	previewHref: string
	nextStepLabel: string | null
	nextStepBody: string | null
	nextStepCta: string | null
	checks: Array<{
		sectionKey: string
		label: string
		detail: string
		complete: boolean
		statusLabel: string
		completedCount?: number
		totalCount?: number
		missingItems?: string[]
	}>
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
	lastPath?: string | null
}): Promise<ProductPreparationSummary | null> {
	const productId = String(params.productId ?? "").trim()
	const providerId = String(params.providerId ?? "").trim()
	if (!productId || !providerId) return null

	const status = normalizeStatus(params.status)
	const presentation = statusPresentation(status)
	let session: { variantId: string | null; ratePlanId: string | null } | undefined
	if (params.lastPath?.startsWith("/") && !params.lastPath.startsWith("//")) {
		try {
			const saved = new URL(params.lastPath, "http://fastt.local")
			session = {
				variantId: saved.searchParams.get("variantId"),
				ratePlanId: saved.searchParams.get("ratePlanId"),
			}
		} catch {
			/* Invalid saved paths never supply a selection. */
		}
	}
	const publishedContext =
		status === "published"
			? await loadTourCommercialContext({
					productId,
					providerId,
					request: params.request,
					url: params.url,
					session,
				})
			: null
	if (status === "published" && publishedContext?.status === "not_tour") {
		return {
			productId,
			tourContext: publishedContext,
			status,
			statusLabel: presentation.label,
			statusVariant: presentation.variant,
			isPublished: true,
			readinessPercent: 100,
			blockerCount: 0,
			blockerPreview: [],
			readyToPublish: false,
			completedChecks: null,
			totalChecks: null,
			continuePreparationHref: routes.productDetail(productId),
			previewHref: routes.productPreview(productId),
			nextStepLabel: null,
			nextStepBody: null,
			nextStepCta: null,
			checks: [],
		}
	}

	const publishState = await loadCompleteToPublishState({
		productId,
		providerId,
		request: params.request,
		url: params.url,
		session,
	})
	if (!publishState) return null
	const tourContext =
		publishState.tourContext ??
		(await loadTourCommercialContext({
			productId,
			providerId,
			request: params.request,
			url: params.url,
			session,
		}))

	const previewHref =
		"options" in tourContext
			? tourContext.status === "unresolved" && tourContext.reason === "selection_required"
				? tourContextSelectionHref(tourContext, routes.productPreview(productId))
				: withTourCommercialContext(routes.productPreview(productId), tourContext)
			: routes.productPreview(productId)

	const blockers = publishState.blockers.filter((check) => check.sectionKey !== "preview")
	const resume = resolveCompleteToPublishResume(productId, publishState.checks, {
		vertical: publishState.tourDiagnostic ? "tour" : undefined,
		lastPath:
			params.lastPath && "options" in tourContext
				? withTourCommercialContext(params.lastPath, tourContext)
				: params.lastPath,
	})
	const tourPresentation = publishState.tourDiagnostic
		? presentTourDiagnostic(publishState.tourDiagnostic, {
				published: status === "published",
				previewHref,
			})
		: undefined
	const resumeCheck =
		publishState.checks.find((check) => check.sectionKey === resume.sectionKey) ??
		blockers[0] ??
		null

	return {
		productId,
		tourContext: publishState.tourContext,
		tourPresentation,
		status,
		statusLabel:
			status === "published"
				? presentation.label
				: tourPresentation
					? tourPresentation.catalogStatus.label
					: publishState.readyToPublish
						? "Listo para publicar"
						: presentation.label,
		statusVariant:
			status === "published"
				? presentation.variant
				: tourPresentation
					? tourPresentation.catalogStatus.variant
					: publishState.readyToPublish
						? "info"
						: presentation.variant,
		isPublished: status === "published",
		readinessPercent: publishState.readinessPercent,
		blockerCount: blockers.length,
		blockerPreview: blockers.slice(0, 3).map((check) => check.label),
		readyToPublish: status !== "published" && publishState.readyToPublish,
		completedChecks: publishState.completedChecks,
		totalChecks: publishState.totalChecks,
		continuePreparationHref: tourPresentation?.primaryAction.href ?? resume.href,
		previewHref: tourPresentation
			? previewHref
			: publishState.readyToPublish
				? resume.href
				: previewHref,
		nextStepLabel: tourPresentation?.nextLabel ?? resume.label ?? resumeCheck?.label ?? null,
		nextStepBody: tourPresentation?.support ?? resumeCheck?.guestImpact ?? null,
		nextStepCta:
			tourPresentation?.primaryAction.label ??
			resumeCheck?.cta ??
			(publishState.readyToPublish ? "Ir a vista previa" : null),
		checks: publishState.checks.map((check) => ({
			sectionKey: check.sectionKey,
			label: check.label,
			detail: check.detail,
			complete: check.complete,
			statusLabel: check.statusLabel,
			completedCount: check.completedCount,
			totalCount: check.totalCount,
			missingItems: check.missingItems,
		})),
	}
}

export function buildPreparationEntryHref(productId: string): string {
	return buildCompleteToPublishEntryHref(productId)
}
