import { z } from "zod"

export const agreementTermsSchema = z
	.object({
		commissionPercent: z.preprocess(
			(value) => (value === "" || value == null ? undefined : value),
			z.coerce.number().min(0).max(100)
		),
		commissionBase: z.string().trim().min(20).max(2000),
		currency: z.string().regex(/^[A-Z]{3}$/),
		effectiveFrom: z.iso.date(),
		effectiveTo: z.iso.date(),
		paymentTiming: z.string().trim().min(10).max(1000),
		cancellationTerms: z.string().trim().min(20).max(3000),
		settlementTerms: z.string().trim().min(20).max(3000),
		fiscalResponsibilities: z.string().trim().min(20).max(3000),
		fullTerms: z.string().trim().min(100).max(30000),
		documentReference: z.string().trim().min(8).max(500),
	})
	.refine((terms) => terms.effectiveFrom <= terms.effectiveTo, {
		message: "La vigencia final debe ser posterior al inicio.",
		path: ["effectiveTo"],
	})
export type AgreementTerms = z.infer<typeof agreementTermsSchema>
export const agreementStateLabels = {
	requested: "Propuesta solicitada",
	offered: "Propuesta disponible",
	accepted: "Acuerdo aceptado",
	withdrawn: "Propuesta retirada",
} as const

export function agreementValidity(input: {
	status: string
	acceptedAt: Date | null
	effectiveFrom?: string
	effectiveTo?: string
	identityMatches: boolean
	collectionModel: string
	timeZone?: string
	now?: Date
}) {
	if (input.status !== "accepted" || !input.acceptedAt) return "acceptance_required" as const
	if (!input.identityMatches || input.collectionModel !== "property_collect")
		return "review_required" as const
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: input.timeZone ?? "America/La_Paz",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(input.now ?? new Date())
	const part = (type: string) => parts.find((value) => value.type === type)!.value
	const today = `${part("year")}-${part("month")}-${part("day")}`
	if (!input.effectiveFrom || !input.effectiveTo || today > input.effectiveTo)
		return "expired" as const
	if (today < input.effectiveFrom) return "not_started" as const
	return "active" as const
}

/** Return only to owned workspace routes; all other input is discarded. */
export function agreementReturnTo(value: unknown): string | null {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\")
	)
		return null
	try {
		const url = new URL(value, "https://fastt.local")
		if (
			url.origin !== "https://fastt.local" ||
			!/^\/provider\/settings\/verification$|^\/product\/[a-zA-Z0-9-]+(?:\/[^/]*)?$|^\/catalog\/tours$|^\/financial(?:\/[^/]*)?$/.test(
				url.pathname
			)
		)
			return null
		url.searchParams.delete("result")
		url.searchParams.delete("error")
		return url.pathname + url.search + url.hash
	} catch {
		return null
	}
}
