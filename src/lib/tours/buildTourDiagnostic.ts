import {
	TOUR_REQUIREMENTS,
	summarizeTourDiagnostic,
	tourDiagnosticSchema,
	type TourDiagnostic,
	type TourCapabilityDecision,
	type TourCapability,
	type TourRequirementId,
	type TourRequirementResult,
} from "./tourDiagnosticContract"
import { TOUR_REQUIREMENT_PRESENTATION } from "./tourDiagnosticPresentation"
import type { LoadedTourContext } from "./loadTourCommercialContext"
import { completeToPublishStepHref } from "@/lib/playbook/complete-to-publish"
import { tourContextSelectionHref } from "./resolveTourCommercialContext"

export type TourObservation = {
	ready: boolean
	message: string
	code?: string
	responsible?: "provider" | "fastt"
	action?: { label: string; href: string }
}
export type TourObservations = Record<TourRequirementId, TourObservation>
/** Projects authoritative observations; contains no price, policy or evidence rules. */
export function buildTourDiagnostic(input: {
	providerId: string
	productId: string
	context: LoadedTourContext
	observations: TourObservations
	timezone?: string
	observedAt?: Date
}): TourDiagnostic {
	const { context, observations, productId } = input
	const resolved = context.status === "resolved" && context.option.bookingMode !== null
	const selection: TourDiagnostic["context"]["selection"] =
		resolved && context.status === "resolved"
			? {
					state: "resolved",
					variantId: context.variantId!,
					ratePlanId: context.ratePlanId!,
					bookingMode: context.option.bookingMode!,
					source: context.source,
				}
			: {
					state: "unresolved",
					reason: context.status === "unresolved" ? context.reason : "read_failed",
				}
	const requirements = {} as TourDiagnostic["requirements"]
	for (const id of Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[]) {
		const definition = TOUR_REQUIREMENTS[id]
		const scope =
			definition.scope === "product"
				? { kind: "product" as const, productId }
				: definition.scope === "option"
					? {
							kind: "option" as const,
							productId,
							variantId: selection.state === "resolved" ? selection.variantId : null,
						}
					: {
							kind: "rate" as const,
							productId,
							variantId: selection.state === "resolved" ? selection.variantId : null,
							ratePlanId: selection.state === "resolved" ? selection.ratePlanId : null,
						}
		const observation = observations[id]
		const href =
			definition.axis === "authorization"
				? `/provider/settings/verification?line=tour&experience=${encodeURIComponent(productId)}`
				: completeToPublishStepHref(
						productId,
						TOUR_REQUIREMENT_PRESENTATION[id].section,
						context.status === "resolved" ? context : {}
					)
		let result: TourRequirementResult = observation.ready
			? {
					state: "ready",
					evidence: { source: "tour-server-evaluation", reference: `${productId}:${id}` },
				}
			: {
					state:
						observation.code === "read_failed"
							? "not_evaluable"
							: definition.axis === "authorization"
								? "blocked"
								: "pending",
					reason: { code: observation.code ?? id, message: observation.message },
					responsible:
						observation.responsible ?? (observation.code === "read_failed" ? "fastt" : "provider"),
					action:
						observation.code === "read_failed"
							? {
									label: "Volver a intentar",
									href: completeToPublishStepHref(
										productId,
										"preview",
										context.status === "resolved" ? context : {}
									),
								}
							: (observation.action ?? { label: TOUR_REQUIREMENT_PRESENTATION[id].action, href }),
				}
		if (definition.axis === "authorization" && "action" in result) {
			const target = new URL(result.action.href, "http://fastt.local")
			if (target.pathname.startsWith("/provider/settings/verification")) {
				target.searchParams.set("line", "tour")
				target.searchParams.set("experience", productId)
				target.searchParams.set(
					"returnTo",
					completeToPublishStepHref(
						productId,
						"preview",
						context.status === "resolved" ? context : {}
					)
				)
				result.action = { ...result.action, href: target.pathname + target.search + target.hash }
			}
		}
		if (!resolved && definition.scope !== "product") {
			result = {
				state: "not_evaluable",
				reason: {
					code: selection.state === "unresolved" ? selection.reason : "read_failed",
					message:
						context.status === "unresolved" && context.reason === "missing_option"
							? "Crea una opción para configurar horario, idioma y modalidad."
							: context.status === "unresolved" && context.reason === "missing_rate"
								? "Crea una tarifa para esta opción."
								: context.status === "resolved"
									? "Completa el perfil de esta opción para evaluar su oferta."
									: context.status === "read_failed"
										? "No se pudo cargar la oferta. Vuelve a intentar."
										: "Selecciona la opción y tarifa que deseas revisar.",
				},
				responsible: context.status === "read_failed" ? "fastt" : "provider",
				action: {
					label:
						context.status === "resolved"
							? "Editar opción"
							: context.status === "read_failed"
								? "Volver a intentar"
								: context.status === "unresolved" && context.reason === "missing_option"
									? "Crear opción"
									: context.status === "unresolved" && context.reason === "missing_rate"
										? "Crear tarifa"
										: "Elegir oferta",
					href:
						context.status === "resolved"
							? completeToPublishStepHref(productId, "departure", context)
							: context.status === "read_failed"
								? completeToPublishStepHref(productId, "preview")
								: context.status === "unresolved" && context.reason === "missing_option"
									? completeToPublishStepHref(productId, "departure")
									: context.status === "unresolved" && context.reason === "missing_rate"
										? completeToPublishStepHref(productId, "rate", context)
										: "options" in context
											? tourContextSelectionHref(
													context,
													`/product/${encodeURIComponent(productId)}/preview`
												)
											: `/product/${encodeURIComponent(productId)}`,
				},
			}
		}
		requirements[id] = { scope, result }
	}
	return tourDiagnosticSchema.parse({
		version: 1,
		context: {
			providerId: input.providerId,
			productId,
			selection,
			timezone: input.timezone ?? "UTC",
			observedAt: (input.observedAt ?? new Date()).toISOString(),
		},
		requirements,
	})
}

export function tourPublicationBlockers(diagnosis: TourDiagnostic) {
	return (Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[])
		.filter((id) => TOUR_REQUIREMENTS[id].axis !== "operation")
		.flatMap((id) => {
			const result = diagnosis.requirements[id].result
			return result.state === "ready" || result.state === "not_applicable"
				? []
				: [{ id, ...result }]
		})
}
export { summarizeTourDiagnostic }

/** Eligibility for an action; booking still needs its live quote and hold checks. */
export function evaluateTourCapabilities(
	diagnosis: TourDiagnostic
): Record<Exclude<TourCapability, "prepare">, TourCapabilityDecision> {
	const all = Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[]
	const publication = all.filter((id) => TOUR_REQUIREMENTS[id].axis !== "operation")
	const activation: TourRequirementId[] = [
		"option_profile",
		"group_capacity",
		"price",
		"conditions",
		"calendar_configuration",
		"provider_authorization",
		"experience_authorization",
		...(diagnosis.context.selection.state === "resolved" &&
		diagnosis.context.selection.bookingMode === "private"
			? []
			: ["current_availability" as const]),
	]
	const decide = (
		capability: TourCapability,
		ids: TourRequirementId[],
		expectedMode?: "shared" | "private"
	): TourCapabilityDecision => {
		const blockers = ids.flatMap((id) => {
			const result = diagnosis.requirements[id].result
			return result.state === "ready" || result.state === "not_applicable"
				? []
				: [{ requirementId: id, reason: result.reason }]
		})
		if (
			expectedMode &&
			(diagnosis.context.selection.state !== "resolved" ||
				diagnosis.context.selection.bookingMode !== expectedMode)
		)
			blockers.push({
				requirementId: "option_profile",
				reason: {
					code: "unsupported_transaction",
					message:
						expectedMode === "shared"
							? "La modalidad privada recibe solicitudes, no reservas inmediatas."
							: "Esta opción no admite solicitudes privadas.",
				},
			})
		const source = "tour-diagnostic-v1"
		return blockers.length
			? {
					capability,
					source,
					allowed: false,
					blockers: blockers as [(typeof blockers)[number], ...(typeof blockers)[number][]],
				}
			: { capability, source, allowed: true, evaluatedRequirementIds: ids }
	}
	return {
		activate: decide("activate", activation),
		publish: decide("publish", publication),
		book: decide("book", [...publication, "current_availability"], "shared"),
		receive_request: decide("receive_request", publication, "private"),
	}
}
