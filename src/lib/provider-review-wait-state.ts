/**
 * Host-facing wait-state for domains that require Fastt review
 * (fiscal identity, compliance documents, verification). Honest ETAs only
 * when ops published a real SLA assignment (mirrored without assignee).
 */

import {
	buildProviderComplianceSlaMirror,
	type ProviderComplianceSlaMirror,
} from "@/lib/provider-compliance-ops"

export type ProviderReviewWaitDomain = "fiscal" | "document" | "verification" | "payment"

export type ProviderReviewWaitState = {
	label: string
	title: string
	body: string
	footnote: string
	sla: ProviderComplianceSlaMirror
}

export const PROVIDER_REVIEW_WAIT_LABEL = "En revisión"

const domainCopy: Record<ProviderReviewWaitDomain, { body: string }> = {
	fiscal: {
		body: "Tu registro fiscal fue enviado. El equipo Fastt lo está revisando antes de habilitar cobros y liquidaciones.",
	},
	document: {
		body: "El documento fue enviado. El equipo Fastt lo está revisando; el resultado (verificado o rechazado) aparecerá aquí.",
	},
	verification: {
		body: "La cuenta está en revisión de cumplimiento. El resultado aparecerá en esta página.",
	},
	payment: {
		body: "Tu cuenta de payout fue enviada. Fastt está esperando/revisando los depósitos de prueba antes de habilitar liquidaciones.",
	},
}

export function buildProviderReviewWaitState(
	domain: ProviderReviewWaitDomain,
	options?: {
		assignment?: {
			slaDueAt: Date | string | null
			slaState: "ok" | "due_soon" | "overdue" | "done"
		} | null
	}
): ProviderReviewWaitState {
	const sla = buildProviderComplianceSlaMirror(options?.assignment ?? null)
	return {
		label: PROVIDER_REVIEW_WAIT_LABEL,
		title: PROVIDER_REVIEW_WAIT_LABEL,
		body: domainCopy[domain].body,
		footnote: sla.footnote,
		sla,
	}
}
