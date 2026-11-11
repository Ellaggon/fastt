import { documentDefinitionDraftSchema } from "@/shared/domain/document-definition"

const source = "docs/domains/tours/compliance-policy-composition.md"

/** Preparation only: no database writes, signatures or publication. */
export function prepareLaPazReviewPackage() {
	const definitions = [
		{
			key: "bo.tour.liability_insurance",
			label: "Responsabilidad civil de la actividad",
			description:
				"Estandar Fastt propuesto. Revisar titular, personas cubiertas, actividad, territorio, limites, franquicias y exclusiones. No sustituye accidentes personales.",
			family: "platform_standards",
			capture: {
				version: 1,
				issuer: "required",
				issuedAt: "required",
				expiresAt: "required",
				allowedSubjectTypes: ["provider", "legal_entity", "person"],
				issuerCountries: [],
				requiredScopes: ["product", "territory", "activity"],
			},
		},
		{
			key: "bo.tour.route_applicability_review",
			label: "Revision de permisos del itinerario",
			description:
				"Registro Fastt de revision por municipio y sitio. Requerido exige permiso vigente y alcance; no aplica exige fundamento verificable; pendiente bloquea. Este registro no es un permiso.",
			family: "regulated_place",
			capture: {
				version: 1,
				issuer: "required",
				issuedAt: "required",
				expiresAt: "optional",
				allowedSubjectTypes: ["provider", "legal_entity", "person"],
				issuerCountries: [],
				requiredScopes: ["product", "territory"],
			},
		},
	].map((definition) => documentDefinitionDraftSchema.parse(definition))
	for (const [key, label, family, personal, scoped] of [
		["bo.tour.holder_identity", "Identidad y representacion del titular", "identity", false, false],
		["bo.tour.holder_fiscal", "Identificacion fiscal del titular", "fiscal", false, false],
		[
			"bo.tour.operator_authorization",
			"Habilitacion turistica del operador",
			"tourism",
			false,
			true,
		],
		[
			"bo.tour.guide_credential",
			"Credencial personal del guia",
			"operational_resources",
			true,
			true,
		],
		[
			"bo.tour.operational_safety",
			"Protocolo de seguridad y emergencias",
			"platform_standards",
			false,
			true,
		],
	] as const) {
		definitions.push(
			documentDefinitionDraftSchema.parse({
				key,
				label,
				family,
				description: `Propuesta Fastt para La Paz: ${label}. Verificar sujeto y alcance; no presume autenticidad, exenciones ni habilitacion legal.`,
				capture: {
					version: 1,
					issuer: "required",
					issuedAt: "required",
					expiresAt: "optional",
					allowedSubjectTypes: personal ? ["person"] : ["provider", "legal_entity", "person"],
					issuerCountries: [],
					requiredScopes: scoped ? ["territory", "activity"] : [],
				},
			})
		)
	}
	return {
		status: "prepared_for_review" as const,
		activationAuthorized: false as const,
		sourceKind: "fastt_policy" as const,
		sourceReference: source,
		definitions,
		ruleDefinitions: {
			identity: ["bo.tour.holder_identity"],
			fiscal: ["bo.tour.holder_fiscal"],
			tourismOperator: ["bo.tour.operator_authorization"],
			tourismGuide: ["bo.tour.guide_credential"],
			operational_resources: ["bo.tour.guide_credential"],
			regulated_place: ["bo.tour.route_applicability_review"],
			platform_standards: ["bo.tour.operational_safety", "bo.tour.liability_insurance"],
		},
		humanReview: {
			insurance: [
				"insured_holder_and_assigned_guides",
				"activity_territory_and_all_offered_dates",
				"per_person_event_and_aggregate_limits",
				"deductibles_exclusions_and_applicable_legal_minima",
				"risk_based_sufficiency_rationale",
				"separate_accident_assistance_applicability",
			],
			route: ["each_municipality_and_site", "required_valid_permit_or_reasoned_non_applicability"],
			audit: ["reviewer", "reviewed_at", "evidence_reference", "rationale", "next_review"],
			uncertainty: "pending_blocks_new_sales",
			changesRequireReview: true,
		},
		limitations: [
			"human_review_not_automatically_enforced_by_capture_schema",
			"not_ratified_or_loaded",
			"reuse_existing_equivalent_definitions_before_administrative_load",
		],
	}
}
