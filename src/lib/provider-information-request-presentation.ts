import { routes } from "@/lib/routes"

export function informationRequestPresentation(item: {
	domain: string
	status: string
	response: string | null
}) {
	const closed = item.status === "resolved"
	const pending = !closed && !item.response && item.status === "waiting_information"
	const destinations: Record<string, { label: string; href: string }> = {
		verification: {
			label: "Revisar identidad y negocio",
			href: routes.providerSettingsVerification(),
		},
		fiscal: { label: "Revisar datos fiscales", href: routes.providerSettingsVerificationFiscal() },
		documents: {
			label: "Revisar documentos",
			href: routes.providerSettingsVerificationDocuments(),
		},
		payments: {
			label: "Revisar datos de pago",
			href: routes.providerSettingsVerificationPayments(),
		},
	}
	return {
		group: closed ? ("closed" as const) : pending ? ("pending" as const) : ("follow_up" as const),
		label: closed
			? "Revisión finalizada"
			: item.response
				? "Respuesta enviada"
				: pending
					? "Por responder"
					: "En seguimiento",
		variant: pending ? ("warning" as const) : closed ? ("neutral" as const) : ("info" as const),
		canRespond: pending,
		destination: destinations[item.domain] ?? null,
	}
}
