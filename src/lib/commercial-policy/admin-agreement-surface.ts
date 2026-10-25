import { listProviderCommercialLines } from "@/lib/verification/commercial-lines"
import { commercialAgreementStatus } from "@/modules/financial/commercial-agreements"
import { db, desc, eq } from "@/shared/infrastructure/db/compat"
import { ProviderCommercialAgreement } from "@/shared/infrastructure/db/schema/tables"

export function adminAgreementPresentation(
	collectionModel: string,
	state: string,
	status?: string
) {
	if (collectionModel !== "property_collect")
		return {
			label: "Cobro sin confirmar",
			next: "El proveedor debe confirmar cómo cobra al viajero.",
			action: "Consultar acuerdo",
			actionable: false,
		}
	if (status === "requested")
		return {
			label: "Propuesta solicitada",
			next: "Fastt debe preparar y autorizar la propuesta.",
			action: "Preparar propuesta",
			actionable: true,
		}
	if (status === "offered")
		return {
			label: "Pendiente del representante",
			next: "El representante autorizado debe revisar y aceptar esta versión.",
			action: "Consultar propuesta",
			actionable: false,
		}
	const labels: Record<string, [string, string]> = {
		active: ["Acuerdo vigente", "La aceptación está registrada. No requiere otra aprobación."],
		not_started: [
			"Vigencia pendiente",
			"La aceptación está registrada; el acuerdo todavía no entra en vigencia.",
		],
		expired: ["Acuerdo vencido", "Terminó la vigencia del acuerdo aceptado."],
		review_required: [
			"Requiere revisión",
			"Cambió la identidad o la modalidad de cobro; debe revisarse el acuerdo.",
		],
	}
	if (status === "withdrawn" && !labels[state])
		return {
			label: "Propuesta retirada",
			next: "Esta versión ya no puede aceptarse.",
			action: "Consultar historial",
			actionable: false,
		}
	const [label, next] = labels[state] ?? [
		"Sin propuesta",
		"El proveedor todavía no solicitó una propuesta.",
	]
	return {
		label,
		next,
		action: state === "review_required" ? "Revisar acuerdo" : "Consultar acuerdo",
		actionable: false,
	}
}

export async function loadAdminAgreementSurface(providerId: string) {
	const lines = await listProviderCommercialLines(providerId)
	const tour = lines.find((line) => line.line === "tour")
	if (!tour) return null
	const [status, [latest]] = await Promise.all([
		commercialAgreementStatus(providerId),
		db
			.select({ status: ProviderCommercialAgreement.status })
			.from(ProviderCommercialAgreement)
			.where(eq(ProviderCommercialAgreement.providerId, providerId))
			.orderBy(desc(ProviderCommercialAgreement.version))
			.limit(1),
	])
	return {
		providerId,
		collectionModel: tour.collectionModel,
		...adminAgreementPresentation(
			tour.collectionModel,
			status.state,
			latest?.status ?? status.agreement?.status
		),
	}
}
