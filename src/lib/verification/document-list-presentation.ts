import { isProviderDocumentExpired, type ProviderDocumentRecord } from "@/lib/provider-documents"
import {
	diagnoseVerificationEvidence,
	type VerificationEvidenceOperation,
} from "./evidence-diagnosis"
import type { VerificationRequirement } from "./requirement-resolver"
import { tourOperatingTerritory } from "@/lib/tours/tour-operating-territories"
import { tourComplianceActivityLabels } from "@/lib/tours/tour-compliance-context"

export type DocumentListPresentation = {
	fileLabel: string
	applicability: "applicable" | "review_scope" | "history"
	applicabilityLabel: string
	detail: string
	scopeLabel: string
	subjectLabel: string
}
export function presentExperienceDocument(input: {
	document: ProviderDocumentRecord
	requirements: readonly VerificationRequirement[]
	operation: VerificationEvidenceOperation
	products: readonly { id: string; name: string | null }[]
	resources: readonly { id: string; name: string }[]
}): DocumentListPresentation {
	const { document: doc, operation } = input
	const expired = isProviderDocumentExpired(doc.expiresAt, operation.at)
	const fileLabel =
		doc.status === "superseded"
			? "Reemplazado"
			: expired
				? "Vencido"
				: doc.status === "verified"
					? "Aprobado"
					: doc.status === "rejected"
						? "Rechazado"
						: "Enviado"
	const productScopes = doc.scopes.filter((scope) => scope.scopeType === "product")
	const history =
		doc.status === "superseded" ||
		expired ||
		(productScopes.length > 0 &&
			!productScopes.some((scope) => scope.productId === operation.productId))
	const diagnoses = input.requirements
		.filter((requirement) => requirement.documentType === doc.type)
		.map((requirement) => diagnoseVerificationEvidence({ requirement, evidence: [doc], operation }))
	const ready = diagnoses.some((diagnosis) => diagnosis.state === "ready")
	const scopeMatches = diagnoses.some((diagnosis) =>
		["satisfied", "pending_review", "rejected"].includes(diagnosis.reason)
	)
	const applicability = history ? "history" : scopeMatches ? "applicable" : "review_scope"
	return {
		fileLabel,
		applicability,
		applicabilityLabel: history
			? "Historial · no habilita esta experiencia"
			: ready
				? "Sirve para esta experiencia"
				: scopeMatches
					? "Alcance coincidente · aún no habilita"
					: "Requiere revisión de alcance",
		detail: history
			? "Se conserva como antecedente; no cuenta como respaldo vigente de esta selección."
			: ready
				? "Cumple un requisito documental de esta selección. No acredita por sí solo la habilitación para vender."
				: scopeMatches
					? doc.status === "rejected"
						? "Corrige el motivo de rechazo antes de volver a enviarlo."
						: "El archivo debe aprobarse antes de completar el requisito."
					: "Su aprobación documental no acredita titular, territorio y actividad para esta selección.",
		subjectLabel:
			input.resources.find((resource) => resource.id === doc.subjectReference)?.name ??
			(doc.subjectReference && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(doc.subjectReference)
				? doc.subjectReference
				: null) ??
			(doc.subjectType === "provider"
				? "Titular del negocio"
				: doc.subjectType === "legal_entity"
					? "Entidad legal"
					: "Titular sin identificar"),
		scopeLabel:
			doc.scopes
				.map((scope) =>
					scope.productId
						? input.products.find((product) => product.id === scope.productId)?.name ||
							"Oferta no disponible en esta línea"
						: scope.resourceId
							? input.resources.find((resource) => resource.id === scope.resourceId)?.name ||
								"Recurso no disponible"
							: scope.territoryLabel ||
								tourOperatingTerritory(scope.territoryCode)?.label ||
								scope.territoryCode ||
								(scope.activityClass
									? tourComplianceActivityLabels[
											scope.activityClass as keyof typeof tourComplianceActivityLabels
										] || scope.activityClass
									: "Alcance pendiente de identificar")
				)
				.join(" · ") || "Sin alcance declarado",
	}
}
