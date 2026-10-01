import { projectTourPublishingStages } from "@/lib/playbook/tour-publishing-stages"
import {
	TOUR_REQUIREMENTS,
	summarizeTourDiagnostic,
	type TourDiagnostic,
	type TourRequirementId,
} from "./tourDiagnosticContract"

/** Copy and navigation projection only; permission always comes from server evaluation. */
export const TOUR_REQUIREMENT_PRESENTATION = {
	presentation: { section: "content", label: "Presentación", action: "Editar presentación" },
	logistics: { section: "subtype", label: "Itinerario y logística", action: "Completar logística" },
	photos: { section: "photos", label: "Fotos", action: "Editar fotos" },
	participants: { section: "tickets", label: "Participantes", action: "Configurar participantes" },
	activities: { section: "categories", label: "Actividades", action: "Elegir actividades" },
	option_profile: { section: "departure", label: "Perfil de la opción", action: "Editar opción" },
	group_capacity: {
		section: "departure",
		label: "Capacidad del grupo",
		action: "Definir capacidad",
	},
	price: { section: "rate", label: "Precio", action: "Configurar precio" },
	conditions: { section: "bookingPolicies", label: "Condiciones", action: "Revisar condiciones" },
	calendar_configuration: {
		section: "calendar",
		label: "Fechas programadas",
		action: "Programar fechas",
	},
	provider_authorization: {
		section: "identity",
		label: "Habilitación del proveedor",
		action: "Revisar verificación",
	},
	experience_authorization: {
		section: "identity",
		label: "Habilitación de la experiencia",
		action: "Revisar experiencia",
	},
	option_activation: {
		section: "calendar",
		label: "Activación de la opción",
		action: "Revisar y activar",
	},
	rate_activation: {
		section: "calendar",
		label: "Activación de la tarifa",
		action: "Revisar y activar",
	},
	current_availability: {
		section: "calendar",
		label: "Disponibilidad actual",
		action: "Revisar disponibilidad",
	},
} as const satisfies Record<TourRequirementId, { section: string; label: string; action: string }>

export function presentTourDiagnostic(
	diagnosis: TourDiagnostic,
	options: { published?: boolean; previewHref: string }
) {
	const summary = summarizeTourDiagnostic(diagnosis)
	const blockers = (Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[]).flatMap((id) => {
		const result = diagnosis.requirements[id].result
		return "action" in result
			? [
					{
						id,
						axis: TOUR_REQUIREMENTS[id].axis,
						label: TOUR_REQUIREMENT_PRESENTATION[id].label,
						...result,
					},
				]
			: []
	})
	const publicationBlockers = blockers.filter((blocker) => blocker.axis !== "operation")
	const relevant = options.published ? blockers : publicationBlockers
	const next = relevant[0]
	const primaryAction = next?.action ?? {
		label: options.published ? "Revisar ficha" : "Revisar y publicar",
		href: options.previewHref,
	}
	return {
		stages: projectTourPublishingStages(diagnosis),
		preparation: summary.preparation,
		primaryAction,
		nextRequirementId: next?.id ?? null,
		message: options.published
			? next
				? `Publicado · ${next.label.toLowerCase()} pendiente.`
				: "Publicado y visible para viajeros."
			: !summary.preparation.complete
				? `${summary.preparation.readyCount} de ${summary.preparation.totalCount} requisitos preparados.`
				: !summary.authorization.complete
					? "Ficha preparada. Habilitación para publicar pendiente."
					: !summary.activation.complete
						? "Ficha preparada. Activación comercial pendiente."
						: "Preparación completa. Revisa la ficha antes de publicar.",
		support:
			next?.reason.message ??
			(options.published
				? "Gestiona opciones, precios y fechas desde sus herramientas."
				: "Verifica la opción y tarifa elegidas en la vista previa."),
		nextLabel: next?.label ?? "Revisión final",
		nextResponsible: next?.responsible ?? null,
		publicationBlockers,
		blockers,
	}
}
