export const insuranceReviewFields = {
	insuredAndGuides: "Titular y guias cubiertos",
	activityTerritoryDates: "Actividad, territorio y fechas",
	limitsAndDeductibles: "Limites por persona, siniestro, agregado y franquicias",
	exclusionsAndLegalMinima: "Exclusiones y minimos legales aplicables",
	accidentAssistanceApplicability: "Aplicabilidad de accidentes y asistencia",
	sufficiencyRationale: "Justificacion de suficiencia segun riesgos",
	evidenceReference: "Referencia del expediente y poliza",
}

export function coverageReviewKind(key: string): "insurance" | "route" | null {
	return key.endsWith("bo.tour.liability_insurance")
		? "insurance"
		: key.endsWith("bo.tour.route_applicability_review")
			? "route"
			: null
}
