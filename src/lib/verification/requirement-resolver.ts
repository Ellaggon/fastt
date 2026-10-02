/**
 * Phase 3 — one resolver for account evidence.
 *
 * Identity, entity registration and the tax id are decided once for the
 * account. Each enrolled commercial line adds its own pack. Inside tours,
 * activity, territory and departure narrow that pack. Lodging evidence never
 * enters the hotel publish checks: those stay on the account gates.
 */

import type { CommercialLine } from "@/lib/verification/commercial-lines"
import { mayEnforceRequirement } from "@/lib/verification/policy-annex"
import type { ProviderDocumentType, RequiredKycDocumentType } from "@/lib/provider-documents"
import { requiredKycDocumentTypes } from "@/lib/provider-documents"

export const verificationRequirementLayers = ["shared", "lodging", "tour"] as const
export type VerificationRequirementLayer = (typeof verificationRequirementLayers)[number]

export const tourCredentialRoles = ["operator", "guide", "intermediary"] as const
export type TourCredentialRole = (typeof tourCredentialRoles)[number]

/** Activities that need a liability policy. Urban, nature and food tours do not. */
export const tourInsuranceActivityClasses = ["adventure", "transport", "water_air"] as const

const knownActivityClasses = [
	"urban_cultural",
	"guided_nature",
	"adventure",
	"transport",
	"water_air",
	"gastronomic",
] as const

export type VerificationRequirementScopes = {
	productIds: string[]
	territoryCodes: string[]
	activityClasses: string[]
	resourceIds: string[]
}

export type VerificationPresentationArea = "activity" | "safety"

export type VerificationRequirement = {
	/** Tour UI placement; never creates or enforces a requirement. */
	presentationArea: VerificationPresentationArea | null
	id: string
	layer: VerificationRequirementLayer
	label: string
	documentType: ProviderDocumentType | null
	/** Posted by the upload form. Two requirements can share a stored type. */
	uploadValue: string | null
	/** Payments and integrations only. Publish does not read this flag. */
	accountDocuments: boolean
	appliesBecause: string
	scopes: VerificationRequirementScopes
}

export type TourVerificationContext = {
	productId: string
	operatingRole: TourCredentialRole | null
	activityClasses: readonly string[]
	jurisdictionCode: string | null
	departureResourceIds: readonly string[]
}

export type VerificationResolutionInput = {
	lines: readonly CommercialLine[]
	holderType: "persona_natural" | "entidad" | null
	holderCountry: string | null
	taxResidenceCountry: string | null
	collectionModel: "undecided" | "property_collect" | "platform_collect" | null
	tours: readonly TourVerificationContext[]
}

export type VerificationResolution = {
	requirements: VerificationRequirement[]
}

const emptyScopes = (): VerificationRequirementScopes => ({
	productIds: [],
	territoryCodes: [],
	activityClasses: [],
	resourceIds: [],
})

function unique(values: readonly (string | null | undefined)[], maximum: number): string[] {
	const seen = new Set<string>()
	const result: string[] = []
	for (const value of values) {
		const text = String(value ?? "").trim()
		if (!text || seen.has(text)) continue
		seen.add(text)
		result.push(text)
		if (result.length >= maximum) break
	}
	return result
}

function requirement(
	input: {
		id: string
		label: string
		documentType?: ProviderDocumentType | null
		uploadValue?: string | null
		accountDocuments?: boolean
		appliesBecause: string
		scopes?: VerificationRequirementScopes
	} & (
		| { layer: "tour"; presentationArea: VerificationPresentationArea }
		| { layer: "shared" | "lodging"; presentationArea?: never }
	)
): VerificationRequirement {
	const documentType = input.documentType ?? null
	return {
		presentationArea: input.presentationArea ?? null,
		id: input.id,
		layer: input.layer,
		label: input.label,
		documentType,
		uploadValue: input.uploadValue ?? documentType,
		accountDocuments: input.accountDocuments ?? false,
		appliesBecause: input.appliesBecause,
		scopes: input.scopes ?? emptyScopes(),
	}
}

function sharedDocument(
	id: string,
	label: string,
	documentType: ProviderDocumentType,
	appliesBecause: string,
	accountDocuments = true
): VerificationRequirement {
	return requirement({
		id,
		layer: "shared",
		label,
		documentType,
		accountDocuments,
		appliesBecause,
	})
}

function normalizeRole(value: unknown): TourCredentialRole | null {
	const role = String(value ?? "").trim()
	return tourCredentialRoles.includes(role as TourCredentialRole)
		? (role as TourCredentialRole)
		: null
}

function normalizeActivities(values: readonly string[]): string[] {
	return unique(
		values.filter((item) =>
			knownActivityClasses.includes(item as (typeof knownActivityClasses)[number])
		),
		12
	)
}

function mergeTourScopes(tours: readonly TourVerificationContext[]): VerificationRequirementScopes {
	return {
		productIds: unique(
			tours.map((tour) => tour.productId),
			50
		),
		territoryCodes: unique(
			tours.map((tour) => tour.jurisdictionCode),
			20
		),
		activityClasses: unique(
			tours.flatMap((tour) => normalizeActivities(tour.activityClasses)),
			12
		),
		resourceIds: unique(
			tours.flatMap((tour) => tour.departureResourceIds),
			50
		),
	}
}

function tourContexts(input: VerificationResolutionInput): TourVerificationContext[] {
	return input.tours
		.map((tour) => ({
			productId: String(tour.productId ?? "").trim(),
			operatingRole: normalizeRole(tour.operatingRole),
			activityClasses: normalizeActivities(tour.activityClasses ?? []),
			jurisdictionCode: String(tour.jurisdictionCode ?? "").trim() || null,
			departureResourceIds: unique(tour.departureResourceIds ?? [], 50),
		}))
		.filter((tour) => tour.productId.length > 0)
}

/**
 * Resolves the account once, then appends one pack per enrolled line.
 * Callers that still lack a holder and a line keep today's list instead of
 * this result.
 */
export function resolveVerificationRequirements(
	input: VerificationResolutionInput
): VerificationResolution {
	const lines = new Set(input.lines)
	const requirements: VerificationRequirement[] = [
		requirement({
			id: "shared.legal_name",
			layer: "shared",
			label: "Nombre legal y nombre comercial",
			appliesBecause: "La identidad de la cuenta se resuelve una vez, sea cual sea la línea.",
		}),
		sharedDocument(
			"shared.government_id",
			"Documento de identidad",
			"government_id",
			"Toda cuenta presenta un documento de identidad. No se repite por línea."
		),
	]

	if (input.holderType === "entidad") {
		requirements.push(
			sharedDocument(
				"shared.business_registration",
				"Registro de la entidad",
				"business_registration",
				"El titular es una entidad. Una persona natural no presenta registro mercantil."
			)
		)
		// shared.representative_power stays withheld until annex.tour.bo.v1 is signed.
	}

	const taxable =
		lines.size > 0 ||
		Boolean(String(input.taxResidenceCountry ?? "").trim()) ||
		Boolean(String(input.holderCountry ?? "").trim())
	if (taxable) {
		requirements.push(
			sharedDocument(
				"shared.tax_document",
				"NIT o identificación fiscal",
				"tax_document",
				"El identificador fiscal se pide una vez cuando hay una línea dada de alta o un país declarado."
			)
		)
	}

	if (input.collectionModel === "platform_collect") {
		requirements.push(
			sharedDocument(
				"shared.address_proof",
				"Comprobante de domicilio",
				"address_proof",
				"Fastt liquida el cobro, así que el domicilio se respalda una vez para el pago.",
				false
			)
		)
	}

	if (lines.has("lodging")) {
		requirements.push(
			requirement({
				id: "lodging.ownership_proof",
				layer: "lodging",
				label: "Prueba de titularidad del inmueble",
				documentType: "ownership_proof",
				appliesBecause:
					"La línea de alojamiento está dada de alta. Un guía no presenta este documento.",
			}),
			requirement({
				id: "lodging.establishment_license",
				layer: "lodging",
				label: "Licencia del establecimiento",
				documentType: "operating_license",
				uploadValue: "operating_license::lodging.establishment_license",
				appliesBecause:
					"La licencia del establecimiento pertenece al alojamiento, no a la credencial de un guía.",
			})
		)
	}

	if (lines.has("tour")) {
		requirements.push(...tourPack(tourContexts(input)))
	}

	return {
		requirements: requirements.filter((item) => {
			const line = item.layer === "lodging" || item.layer === "tour" ? item.layer : null
			if (item.layer === "shared") return mayEnforceRequirement(line, item.id)
			return line ? mayEnforceRequirement(line, item.id) : true
		}),
	}
}

function tourPack(tours: readonly TourVerificationContext[]): VerificationRequirement[] {
	if (tours.length === 0) {
		return [
			requirement({
				id: "tour.context_missing",
				presentationArea: "activity",
				layer: "tour",
				label: "Actividad, territorio y papel de la experiencia",
				appliesBecause:
					"La línea de tours está dada de alta, pero todavía no hay una experiencia que afine licencia o seguro.",
			}),
		]
	}

	const pack: VerificationRequirement[] = []
	const guides = tours.filter((tour) => tour.operatingRole === "guide")
	const operators = tours.filter(
		(tour) => tour.operatingRole === "operator" || tour.operatingRole === "intermediary"
	)
	const missingRole = tours.filter((tour) => !tour.operatingRole)
	const missingOperationContext = tours.filter(
		(tour) => !tour.jurisdictionCode || tour.activityClasses.length === 0
	)
	const insured = tours.filter((tour) =>
		tour.activityClasses.some((activity) =>
			tourInsuranceActivityClasses.includes(
				activity as (typeof tourInsuranceActivityClasses)[number]
			)
		)
	)
	const food = tours.filter((tour) => tour.activityClasses.includes("gastronomic"))

	if (missingOperationContext.length > 0) {
		pack.push(
			requirement({
				id: "tour.context_missing",
				presentationArea: "activity",
				layer: "tour",
				label: "Actividad y territorio de la experiencia",
				appliesBecause:
					"Sin actividad y territorio no se puede decidir qué licencia, seguro o permiso específico corresponde.",
				scopes: mergeTourScopes(missingOperationContext),
			})
		)
	}

	if (guides.length > 0) {
		pack.push(
			requirement({
				id: "tour.guide_credential",
				presentationArea: "activity",
				layer: "tour",
				label: "Credencial de guía",
				documentType: "operating_license",
				uploadValue: "operating_license::tour.guide_credential",
				appliesBecause:
					"Hay experiencias operadas como guía. El territorio y la salida acotan esta credencial.",
				scopes: mergeTourScopes(guides),
			})
		)
	}
	if (operators.length > 0) {
		const roles = unique(
			operators.map((tour) => tour.operatingRole),
			2
		)
		pack.push(
			requirement({
				id: "tour.operator_license",
				presentationArea: "activity",
				layer: "tour",
				label: "Habilitación de operador o intermediario",
				documentType: "operating_license",
				uploadValue: "operating_license::tour.operator_license",
				appliesBecause: `Hay experiencias con papel ${roles.join(" y ")}. Se pide una habilitación para todas.`,
				scopes: mergeTourScopes(operators),
			})
		)
	}
	if (missingRole.length > 0) {
		pack.push(
			requirement({
				id: "tour.operating_role_missing",
				presentationArea: "activity",
				layer: "tour",
				label: "Papel operativo de la experiencia",
				appliesBecause: "Sin papel de guía, operador o intermediario no se pide una credencial.",
				scopes: mergeTourScopes(missingRole),
			})
		)
	}
	if (insured.length > 0) {
		pack.push(
			requirement({
				id: "tour.insurance",
				presentationArea: "safety",
				layer: "tour",
				label: "Seguro de la actividad",
				documentType: "insurance",
				appliesBecause:
					"Solo aventura, transporte o agua y aire piden seguro. Un recorrido urbano no lo arrastra.",
				scopes: mergeTourScopes(insured),
			})
		)
	}
	if (food.length > 0) {
		pack.push(
			requirement({
				id: "tour.food_handling_pending",
				presentationArea: "safety",
				layer: "tour",
				label: "Manipulación de alimentos",
				appliesBecause:
					"La actividad gastronómica no pide el seguro de aventura. Todavía no hay un documento propio para alimentos.",
				scopes: mergeTourScopes(food),
			})
		)
	}
	return pack
}

/** Shared identity slots that can block payments and integrations. Never publish. */
export function accountGateDocumentTypes(
	resolution: VerificationResolution
): RequiredKycDocumentType[] {
	const wanted = new Set(
		resolution.requirements
			.filter((item) => item.accountDocuments && item.documentType)
			.map((item) => item.documentType)
	)
	return requiredKycDocumentTypes.filter((type) => wanted.has(type))
}

export type HolderTypeForRegistration = "persona_natural" | "entidad" | null

export function holderRequiresBusinessRegistration(holderType: HolderTypeForRegistration): boolean {
	return holderType === "entidad"
}

/**
 * KYC slots for the verification workspace. Persona natural never includes
 * business_registration, even when legacy rows remain in storage.
 */
export function accountKycDocumentTypes(params: {
	enforced: boolean
	resolution: VerificationResolution | null
	holderType: HolderTypeForRegistration
}): readonly RequiredKycDocumentType[] | undefined {
	if (params.enforced && params.resolution) {
		return accountGateDocumentTypes(params.resolution)
	}
	if (params.holderType === "persona_natural") {
		return requiredKycDocumentTypes.filter((type) => type !== "business_registration")
	}
	if (params.holderType === "entidad") {
		return requiredKycDocumentTypes
	}
	return undefined
}

export function packUploadOptions(resolution: VerificationResolution): Array<{
	value: string
	label: string
	description: string
}> {
	return resolution.requirements
		.filter((item) => item.documentType && !item.accountDocuments && item.uploadValue)
		.map((item) => ({
			value: item.uploadValue as string,
			label: item.label,
			description: item.appliesBecause,
		}))
}

export function packDocumentTypes(resolution: VerificationResolution): ProviderDocumentType[] {
	return unique(
		resolution.requirements
			.filter((item) => item.documentType && !item.accountDocuments)
			.map((item) => item.documentType),
		12
	) as ProviderDocumentType[]
}

export function matchUpload(
	resolution: VerificationResolution,
	raw: string
): VerificationRequirement | null {
	const value = String(raw ?? "").trim()
	if (!value) return null
	const exact = resolution.requirements.find(
		(item) => item.uploadValue === value && item.documentType
	)
	if (exact) return exact
	const byType = resolution.requirements.filter(
		(item) => item.documentType === value && item.uploadValue
	)
	return byType.length === 1 ? byType[0] : null
}

/** A document request belongs on the line pack page, not on the identity slots. */
export function requestedTypeRoutesToPack(
	resolution: VerificationResolution,
	raw: string
): boolean {
	const value = String(raw ?? "").trim()
	if (!value) return false
	return resolution.requirements.some(
		(item) =>
			!item.accountDocuments &&
			Boolean(item.uploadValue) &&
			(item.uploadValue === value || item.documentType === value)
	)
}
