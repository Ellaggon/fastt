/**
 * Shared reject categories for compliance review.
 * Admin selects a template; host sees the same category label + body
 * (never free-text-only when a known template was used).
 */

export type ProviderRejectDomain = "documents" | "fiscal" | "payments" | "verification"

export type ProviderRejectCategory = {
	id: string
	domain: ProviderRejectDomain
	label: string
	body: string
}

export const providerComplianceRejectCategories = [
	{
		id: "doc_illegible",
		domain: "documents" as const,
		label: "Documento ilegible / incompleto",
		body: "El archivo no permite validar la identidad o el registro. Sube una copia nítida y completa.",
	},
	{
		id: "doc_mismatch",
		domain: "documents" as const,
		label: "Datos no coinciden con el perfil",
		body: "El documento no coincide con la razón social o identidad declarada en el perfil del proveedor.",
	},
	{
		id: "tax_incomplete",
		domain: "fiscal" as const,
		label: "Identidad fiscal incompleta",
		body: "Faltan país de residencia fiscal y/o número de registro válidos para completar la validación.",
	},
	{
		id: "tax_mismatch",
		domain: "fiscal" as const,
		label: "Registro fiscal no verificable",
		body: "No pudimos validar el número de registro fiscal con los datos enviados. Corrige e intenta de nuevo.",
	},
	{
		id: "payout_invalid",
		domain: "payments" as const,
		label: "Datos bancarios inválidos",
		body: "La cuenta o el SWIFT/IBAN no es válido o no coincide con el titular. Envía una cuenta corregida.",
	},
	{
		id: "verification_policy",
		domain: "verification" as const,
		label: "No cumple política de cumplimiento",
		body: "La cuenta no cumple los requisitos de cumplimiento de Fastt en este momento. Revisa la documentación pendiente.",
	},
] as const satisfies ReadonlyArray<ProviderRejectCategory>

/** @deprecated Prefer providerComplianceRejectCategories — kept for admin imports. */
export const adminComplianceRejectTemplates = providerComplianceRejectCategories

export type ResolvedProviderReject = {
	id: string | null
	label: string | null
	body: string
	matched: boolean
}

/**
 * Map free-text review notes back to a known category when ops used a template.
 */
export function resolveProviderRejectCategory(
	notes: string | null | undefined,
	domain?: ProviderRejectDomain
): ResolvedProviderReject {
	const body = String(notes ?? "").trim()
	if (!body) {
		return { id: null, label: null, body: "", matched: false }
	}
	const pool = domain
		? providerComplianceRejectCategories.filter((item) => item.domain === domain)
		: [...providerComplianceRejectCategories]
	const hit =
		pool.find((item) => item.body === body) ??
		providerComplianceRejectCategories.find((item) => item.body === body) ??
		null
	if (hit) {
		return { id: hit.id, label: hit.label, body: hit.body, matched: true }
	}
	return { id: null, label: null, body, matched: false }
}

export function listProviderRejectCategories(
	domain: ProviderRejectDomain
): ProviderRejectCategory[] {
	return providerComplianceRejectCategories.filter((item) => item.domain === domain)
}
