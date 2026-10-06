import {
	resolveTourPlaybookContext,
	tourPublicationHref,
} from "@/lib/playbook/tour-playbook-context"
import type { ProductPreparationSummary } from "@/lib/playbook/summarize-product-preparation"
import { routes } from "@/lib/routes"
import { buildTourCommercialLinks, contextualizeTourLink } from "./tourProviderNavigation"

/** Shared actions, not shared page composition. Never choose the first option of a tour. */
export function presentTourCatalogItem(
	productId: string,
	preparation?: ProductPreparationSummary | null
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
		Object.entries(base).map(([key, href]) => [key, contextualize(href)])
	) as typeof base
	const previewHref = preparation?.previewHref ?? routes.productPreview(productId)
	const selection = context?.status === "resolved" ? context : {}
	const publicationHref =
		context?.status === "resolved" ? tourPublicationHref(productId, selection) : previewHref
	const rawContinue = preparation?.continuePreparationHref ?? routes.productDetail(productId)
	const canonicalContinue = resolveTourPlaybookContext(
		new URL(rawContinue, "http://fastt.local"),
		productId
	)
	const continueHref = canonicalContinue
		? canonicalContinue.canonical.pathname + canonicalContinue.canonical.search
		: rawContinue
	const presentation = preparation?.tourPresentation
	const unresolved =
		context &&
		(context.status === "read_failed" ||
			context.status === "not_found" ||
			context.status === "not_tour" ||
			(context.status === "unresolved" &&
				["selection_required", "invalid_selection"].includes(context.reason)))
	const primaryAction = !presentation
		? { label: "Reintentar evaluación", href: previewHref }
		: unresolved || preparation.isPublished
			? presentation.primaryAction
			: presentation.preparation.complete
				? { label: "Revisar publicación", href: publicationHref }
				: { label: "Continuar preparación", href: continueHref }
	return {
		links,
		previewHref,
		primaryAction,
		detailHref: contextualize(routes.productDetail(productId)),
		statusLabel: presentation?.catalogStatus.label ?? "Evaluación pendiente",
		support: presentation?.support ?? "No pudimos evaluar este tour. Vuelve a intentarlo.",
	}
}
