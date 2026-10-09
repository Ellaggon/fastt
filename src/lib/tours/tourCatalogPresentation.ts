import { tourPublicationHref } from "@/lib/playbook/tour-playbook-context"
import type { ProductPreparationSummary } from "@/lib/playbook/summarize-product-preparation"
import { routes } from "@/lib/routes"
import { buildTourProviderPreviewHref } from "@/lib/playbook/launch-tour"
import { buildTourCommercialLinks, contextualizeTourLink } from "./tourProviderNavigation"

/** Shared actions, not shared page composition. Never choose the first option of a tour. */
export function presentTourCatalogItem(
	productId: string,
	preparation?: ProductPreparationSummary | null,
	configuration?: { resumeHref?: string | null; handedOff?: boolean; variantId?: string | null }
) {
	const context = preparation?.tourContext
	const base = buildTourCommercialLinks({
		productId,
		variantId: context?.status === "resolved" ? context.variantId : null,
		ratePlanId: context?.status === "resolved" ? context.ratePlanId : null,
	})
	const contextualize = (href: string) =>
		context && "options" in context ? contextualizeTourLink(href, context) : href
	const links = Object.fromEntries(
		Object.entries(base).map(([key, href]) => [
			key,
			key === "departuresHref" ? href : contextualize(href),
		])
	) as typeof base
	const selection = context?.status === "resolved" ? context : {}
	const publicationHref = tourPublicationHref(productId, selection)
	const previewHref = contextualize(buildTourProviderPreviewHref(productId, selection))
	const presentation = preparation?.tourPresentation
	const unresolved =
		context &&
		(context.status === "read_failed" ||
			context.status === "not_found" ||
			context.status === "not_tour" ||
			(context.status === "unresolved" && context.reason === "invalid_selection"))
	const selectionRequired =
		context?.status === "unresolved" && context.reason === "selection_required"
	const pendingContent = presentation?.stages?.find((stage) => stage.state !== "ready")
	const correction = presentation?.primaryAction
	const verification = correction?.href.startsWith("/provider/settings/verification")
	const primaryAction = !presentation
		? { label: "Reintentar evaluación", href: publicationHref }
		: unresolved
			? presentation.primaryAction
			: preparation.isPublished
				? presentation.blockers.length
					? presentation.primaryAction
					: { label: "Gestionar opciones y horarios", href: links.departuresHref }
				: pendingContent
					? { label: "Continuar ficha", href: pendingContent.href }
					: configuration?.resumeHref &&
						  !configuration.handedOff &&
						  (context?.status !== "resolved" || configuration.variantId === context.variantId)
						? { label: "Continuar configuración", href: configuration.resumeHref }
						: selectionRequired
							? presentation.primaryAction
							: context?.status === "unresolved" && context.reason === "missing_option"
								? {
										label: "Configurar cómo se reserva",
										href: `/product/${encodeURIComponent(productId)}/preparation-complete`,
									}
								: verification
									? {
											...correction!,
											label:
												presentation.nextResponsible === "fastt"
													? correction!.label
													: "Completar verificación",
										}
									: { label: "Revisar publicación", href: publicationHref }
	return {
		links,
		previewHref,
		publicationHref,
		primaryAction,
		detailHref: contextualize(routes.productDetail(productId)),
		statusLabel: presentation?.catalogStatus.label ?? "Evaluación pendiente",
		support: presentation?.support ?? "No pudimos evaluar este tour. Vuelve a intentarlo.",
	}
}
