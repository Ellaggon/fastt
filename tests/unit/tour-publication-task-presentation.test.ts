import { expect, it } from "vitest"
import {
	tourPublicationTaskHeadline,
	tourPublicationTaskImpact,
	tourPublicationTaskStatus,
} from "@/lib/tours/tourPublicationTaskPresentation"

it("maps provider authorization review tasks to settings-style labels", () => {
	const task = {
		key: "fastt:/x",
		ids: ["provider_authorization" as const],
		label: "Habilitación del proveedor",
		messages: ["Requisitos pendientes: Aprobación de la cuenta"],
		href: null,
		responsible: "fastt" as const,
		unknown: false,
		code: "in_review",
	}
	expect(tourPublicationTaskHeadline(task)).toBe("Cuenta en revisión")
	expect(tourPublicationTaskImpact(task)).toContain("Bloquea publicación")
	expect(tourPublicationTaskStatus(task)).toEqual({ label: "En revisión", variant: "info" })
	expect(tourPublicationTaskStatus({ ...task, code: "policy_context_unsupported_holder" })).toEqual(
		{
			label: "Pendiente de Fastt",
			variant: "warning",
		}
	)
})
