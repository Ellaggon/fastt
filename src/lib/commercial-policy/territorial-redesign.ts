import { EXPERIENCE_FORMATS } from "@/shared/domain/experience-format"
import { tourOperatingRoles, tourComplianceActivityClasses } from "@/shared/domain/tour-operation"
import { documentDefinitionDraftSchema } from "@/shared/domain/document-definition"
import type { CommercialPolicyVersion, CommercialPolicyRequirement } from "./evaluate"

type Version = CommercialPolicyVersion & { policySetId: string }
export interface TerritorialDraft {
	baseVersionId: string
	policySetId: string
	domain: "verification" | "fiscal" | "documents"
	label: string
	context: NonNullable<CommercialPolicyVersion["context"]>
	requirements: CommercialPolicyRequirement[]
	retireAfterPublication: string[]
}
const evidenceKeys = {
	identity: "bo.holder.personal_identity",
	existence: "bo.holder.entity_existence",
	representation: "bo.holder.entity_representation",
	fiscal: "bo.holder.tax_registration",
} as const

export function territorialRedesignDefinitions() {
	return [
		{
			key: evidenceKeys.identity,
			label: "Identidad personal del titular",
			family: "identity",
			subjects: ["person"],
		},
		{
			key: evidenceKeys.existence,
			label: "Existencia de la entidad titular",
			family: "identity",
			subjects: ["legal_entity"],
		},
		{
			key: evidenceKeys.representation,
			label: "Representación vigente de la entidad",
			family: "identity",
			subjects: ["legal_entity"],
		},
		{
			key: evidenceKeys.fiscal,
			label: "Identificación fiscal del titular en Bolivia",
			family: "fiscal",
			subjects: ["person", "legal_entity", "provider"],
		},
	].map((item) =>
		documentDefinitionDraftSchema.parse({
			key: item.key,
			label: item.label,
			family: item.family,
			description:
				item.key === evidenceKeys.representation
					? "Propuesta Fastt Bolivia. Revisar identidad del representante, vínculo con la entidad y facultades suficientes. No basta el carné ni la matrícula. No concede habilitación turística."
					: "Propuesta Fastt Bolivia. Verificar sujeto, autenticidad, estado y fechas del respaldo. Reutilizable por titular; no acredita habilitación de una actividad ni determina el régimen tributario.",
			capture: {
				version: 1,
				issuer: "required",
				issuedAt: "required",
				expiresAt: "optional",
				allowedSubjectTypes: item.subjects,
				issuerCountries: [],
				requiredScopes: [],
			},
		})
	)
}

/** Produces unsigned proposals only. It never expands an active admission. */
export function prepareTerritorialRedesign(input: {
	versions: Version[]
	countryTerritoryId: string
	definitionIds: Record<string, string>
}) {
	if (!input.countryTerritoryId) throw new Error("national_territory_required")
	for (const key of Object.values(evidenceKeys))
		if (!input.definitionIds[key]) throw new Error("national_definition_mapping_incomplete")
	const versions = input.versions.filter(
		(v) => v.status === "published" && v.country === "BO" && v.vertical === "tour"
	)
	const drafts: TerritorialDraft[] = []
	for (const holderType of ["persona_natural", "entidad"] as const) {
		for (const role of ["holder", "tax"] as const) {
			const candidates = versions.filter(
				(v) => v.holderType === holderType && v.jurisdictionRole === role
			)
			if (candidates.length !== 1) throw new Error("national_base_requires_manual_reconciliation")
			const base = candidates[0]
			if (
				base.requirements.length !== 1 ||
				base.requirements[0].sourceKind !== "fastt_policy" ||
				base.requirements[0].condition?.evidenceScope !== "provider"
			)
				throw new Error("national_base_contract_changed")
			const requiredKeys =
				role === "tax"
					? [evidenceKeys.fiscal]
					: holderType === "persona_natural"
						? [evidenceKeys.identity]
						: [evidenceKeys.existence, evidenceKeys.representation]
			const template = base.requirements[0]
			const requirements = requiredKeys.map(
				(key): CommercialPolicyRequirement => ({
					...template,
					key: `national.${holderType}.${key.split(".").slice(2).join(".")}`,
					acceptedEvidence: [],
					requiredSubjectReferences: undefined,
					condition: { evidenceScope: "provider", evidenceSubjectSelector: "holder" },
					documentAcceptance: {
						version: 1,
						alternatives: [
							{
								id: "verified-holder-document",
								allOf: [{ definitionVersionId: input.definitionIds[key] }],
							},
						],
					},
					blockingAction: `Revisar ${territorialRedesignDefinitions()
						.find((d) => d.key === key)!
						.label.toLocaleLowerCase()} y solicitar correcciones si no acredita el requisito.`,
				})
			)
			drafts.push({
				baseVersionId: base.id,
				policySetId: base.policySetId,
				domain: role === "tax" ? "fiscal" : "verification",
				label:
					role === "tax"
						? "Identificación fiscal nacional"
						: holderType === "persona_natural"
							? "Identidad personal nacional"
							: "Identidad y representación empresarial nacional",
				context: {
					contextVersion: 2,
					jurisdictionCodes: [input.countryTerritoryId],
					operatingRoles: [...tourOperatingRoles],
					activityClasses: tourComplianceActivityClasses.filter(
						(activity) => activity !== "water_air"
					),
					experienceFormats: [...EXPERIENCE_FORMATS],
					legalFormCodes: [],
					executionModes: [],
					foodHandlingModes: [],
					transportProviders: [],
				},
				requirements,
				retireAfterPublication: [base.id],
			})
		}
		const standards = versions.filter(
			(v) =>
				v.holderType === holderType &&
				v.context?.composition?.family === "platform_standards" &&
				v.context.composition.kind === "requirements"
		)
		if (standards.length !== 1) throw new Error("standards_base_requires_manual_reconciliation")
		const base = standards[0],
			rule = base.requirements[0]
		const parts = rule?.documentAcceptance?.alternatives
		if (
			base.requirements.length !== 1 ||
			parts?.length !== 1 ||
			parts[0].allOf.length !== 2 ||
			rule.sourceKind !== "fastt_policy"
		)
			throw new Error("standards_contract_changed")
		drafts.push({
			baseVersionId: base.id,
			policySetId: base.policySetId,
			domain: "documents",
			label: "Seguridad y seguro: controles separados",
			context: {
				...base.context!,
				composition: { ...base.context!.composition!, replacesVersionIds: [base.id] },
			},
			requirements: parts[0].allOf.map((part, index) => ({
				...rule,
				key: `${rule.key}.${index === 0 ? "safety" : "insurance"}`,
				blockingAction:
					index === 0
						? "Revisar el protocolo de seguridad y emergencias del recorrido."
						: "Revisar asegurados, actividad, territorio, vigencia y condiciones de la cobertura de responsabilidad civil.",
				documentAcceptance: {
					version: 1,
					alternatives: [{ id: index === 0 ? "safety" : "insurance", allOf: [part] }],
				},
			})),
			retireAfterPublication: [],
		})
	}
	const guide = versions.filter(
		(v) => v.holderType === "persona_natural" && v.jurisdictionRole === "product"
	)
	const admissions = guide.filter((v) => v.context?.composition?.kind === "admission")
	const replaced = new Set(admissions.flatMap((v) => v.context!.composition!.replacesVersionIds))
	const active = admissions.filter((v) => !replaced.has(v.id))
	const tourism = guide.filter(
		(v) =>
			v.context?.composition?.kind === "requirements" && v.context.composition.family === "tourism"
	)
	const resources = guide.filter(
		(v) =>
			v.context?.composition?.kind === "requirements" &&
			v.context.composition.family === "operational_resources"
	)
	if (active.length !== 1 || tourism.length !== 1 || resources.length !== 1)
		throw new Error("guide_base_requires_manual_reconciliation")
	const { key: _a, blockingAction: _actionA, ...a } = tourism[0].requirements[0] ?? {}
	const { key: _b, blockingAction: _actionB, ...b } = resources[0].requirements[0] ?? {}
	if (!a.documentAcceptance || JSON.stringify(a) !== JSON.stringify(b))
		throw new Error("guide_rules_not_equivalent")
	const admission = active[0]
	const composition = admission.context!.composition!
	if (
		!composition.requiredFamilies.includes("tourism") ||
		!composition.requiredFamilies.includes("operational_resources")
	)
		throw new Error("guide_admission_contract_changed")
	drafts.push({
		baseVersionId: admission.id,
		policySetId: admission.policySetId,
		domain: "documents",
		label: "Admisión local: una sola comprobación de credencial",
		context: {
			...admission.context!,
			composition: {
				...composition,
				requiredFamilies: composition.requiredFamilies.filter((f) => f !== "tourism"),
				replacesVersionIds: [admission.id],
			},
		},
		requirements: admission.requirements,
		retireAfterPublication: [tourism[0].id],
	})
	return {
		drafts,
		definitions: territorialRedesignDefinitions(),
		publicationAuthorized: false as const,
		preserved: [
			"Admisión territorial de La Paz",
			"Habilitación del operador",
			"Permisos por itinerario",
			"Evidencia operativa por actividad y territorio",
		],
		pendingReview: [
			"Evidencia empresarial y facultades de representación",
			"Clasificación fiscal y excepciones",
			"Cobertura documental nacional y departamental",
			"Ratificación y transición coordinada de versiones",
			"Admisión de Santa Cruz y otros departamentos no habilitada",
		],
	}
}
