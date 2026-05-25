export const pricingOperationCopy = {
	reviewAction: "Revisar cambio manual",
	reviewingAction: "Revisando cambio manual...",
	applyAction: "Guardar cambio manual",
	confirmAction: "Confirmar cambio manual",
	bulkApplyAction: "Extender cambio a planes",
	applyingAction: "Guardando cambio...",
	reviewReady: "Revisión lista",
	resultTitle: "Resultado de aplicación",
	resultReady: "Cambio aplicado",
	resultNeedsReview: "Aplicación con revisión",
	partialFailureTitle: "Planes que necesitan revisión",
	advancedDetail: "Detalle avanzado",
	technicalDetail: "Detalle técnico",
	nextStepLabel: "Qué hacer ahora",
	rangeFallback: "Rango del calendario",
	extension: {
		title: "Extender este cambio",
		drawerTitle: "Extender este cambio",
		advancedModeTitle: "Modo avanzado de extensión",
		advancedModeDescription:
			"Úsalo solo cuando necesites revisar muchos planes o diagnosticar detalle técnico. La operación diaria nace en el calendario.",
		intentSummary:
			"Manual = cambia ahora. Extender = replica este mismo cambio. Ayudas recurrentes = actúan después.",
		contextTitle: "Continuación desde Pricing",
		contextFallback:
			"Vuelve al calendario y selecciona un rango para llegar con fechas y plan preseleccionados.",
		targetsTitle: "Planes donde se replicará",
		changeTitle: "Cambio a replicar",
		reviewTitle: "Revisión de extensión",
		noApplicableTitle: "Aplicación con revisión",
		noApplicableSummary:
			"No encontramos planes aplicables en esta revisión. Ajusta el alcance o abre el detalle avanzado.",
		advancedDetailLink: "Abrir modo avanzado",
		advancedDetailTitle: "Detalle avanzado de extensión",
		technicalTableTitle: "Detalle técnico por plan",
	},
	recovery: {
		validation: {
			title: "Falta ajustar datos",
			summary:
				"El cambio no pudo procesarse porque algún dato del rango, valor o plan necesita revisión.",
			action: "Revisa fechas, valor y planes seleccionados; luego intenta nuevamente.",
		},
		coverage: {
			title: "Alcance incompleto",
			summary:
				"Algunas noches todavía no tienen datos suficientes para calcular el cambio completo.",
			action: "Regenera el rango o reduce el alcance, y vuelve a revisar el impacto.",
		},
		apply: {
			title: "No se pudo aplicar en este plan",
			summary: "La revisión terminó, pero este plan no aceptó la aplicación del cambio.",
			action:
				"Revisa el detalle técnico, confirma que el plan siga activo y vuelve a intentar solo este plan.",
		},
		network: {
			title: "No pudimos completar la operación",
			summary: "La conexión o el servidor interrumpió la operación antes de terminar.",
			action: "Espera unos segundos y vuelve a intentar. Si persiste, revisa el detalle técnico.",
		},
		unknown: {
			title: "Necesita revisión",
			summary: "Este plan no pudo completarse automáticamente.",
			action:
				"Abre el detalle técnico, revisa el plan y vuelve a intentar con un alcance más pequeño.",
		},
	},
} as const

export function nightsLabel(count: number): string {
	return `${count} ${count === 1 ? "noche" : "noches"}`
}

export function buildRangeContextLabel(params: {
	from: string
	to: string
	nights: number
	ratePlanName?: string | null
}): string {
	const suffix = params.ratePlanName ? ` · ${params.ratePlanName}` : ""
	return `${params.from} → ${params.to} · ${nightsLabel(params.nights)}${suffix}`
}
