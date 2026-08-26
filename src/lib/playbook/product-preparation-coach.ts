const NEXT_STEP_COPY: Record<string, { body: string; cta: string }> = {
	"Contenido visible para huéspedes": {
		body: "Lo que el huésped lee en la ficha.",
		cta: "Editar contenido",
	},
	"Fotos": {
		body: "Imágenes que generan confianza al reservar.",
		cta: "Editar fotos",
	},
	"Ubicación": {
		body: "Dónde está y cómo llegar.",
		cta: "Editar ubicación",
	},
	"Habitaciones": {
		body: "Espacios donde descansará el huésped.",
		cta: "Ver habitaciones",
	},
	"Reglas para huéspedes": {
		body: "Qué esperar durante la estadía.",
		cta: "Revisar reglas",
	},
	"Condiciones de reserva": {
		body: "Cancelación, pago y reglas de reserva.",
		cta: "Revisar tarifas",
	},
	"Itinerario del tour": {
		body: "Secuencia de actividades del tour.",
		cta: "Editar itinerario",
	},
	"Modalidades y tickets": {
		body: "Modalidades que puede seleccionar el viajero.",
		cta: "Configurar tickets",
	},
	"Primera salida": {
		body: "La primera salida reservable del tour.",
		cta: "Crear salida",
	},
	"Precio de la salida": {
		body: "El precio de venta de la salida.",
		cta: "Configurar precio",
	},
	"Cupo y disponibilidad": {
		body: "El cupo disponible para reservar.",
		cta: "Configurar disponibilidad",
	},
	"Incluye / No incluye": {
		body: "Qué incluye y qué no incluye el paquete.",
		cta: "Editar inclusiones",
	},
	"Vista previa y publicar": {
		body: "Revisión final antes de recibir reservas.",
		cta: "Ir a vista previa",
	},
}

function asSentence(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return trimmed
	return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function copyForLabel(label: string): { body: string; cta: string } | null {
	const mapped = NEXT_STEP_COPY[label]
	if (mapped) return mapped
	if (/^Detalles del /u.test(label)) {
		return {
			body: "Tipo y características visibles de la oferta.",
			cta: "Editar detalles",
		}
	}
	return null
}

export type ProductPreparationCoach = {
	badge: "En curso" | "Lista"
	ready: boolean
	label: string
	body: string
	cta: string
	href: string
}

export function resolveProductPreparationCoach(input: {
	readyToPublish: boolean
	nextStepLabel?: string | null
	nextStepBody?: string | null
	nextStepCta?: string | null
	continuePreparationHref: string
	previewHref: string
}): ProductPreparationCoach {
	if (input.readyToPublish) {
		return {
			badge: "Lista",
			ready: true,
			label: "Listo para publicar",
			body: "Revisa la vista previa y confirma la publicación.",
			cta: input.nextStepCta?.trim() || "Ir a vista previa",
			href: input.previewHref,
		}
	}

	const label = String(input.nextStepLabel ?? "").trim() || "Completa el próximo paso"
	const mapped = copyForLabel(label)
	return {
		badge: "En curso",
		ready: false,
		label,
		body: asSentence(
			String(input.nextStepBody ?? "").trim() ||
				mapped?.body ||
				"Un requisito de la ficha a la vez. El detalle permanece en su propia pantalla."
		),
		cta: String(input.nextStepCta ?? "").trim() || mapped?.cta || "Continuar",
		href: input.continuePreparationHref,
	}
}
