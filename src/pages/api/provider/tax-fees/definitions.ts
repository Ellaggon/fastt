import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	createTaxFeeDefinitionUseCase,
	listTaxFeeDefinitionsByProviderUseCase,
	updateTaxFeeDefinitionUseCase,
} from "@/container/taxes-fees.container"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"

const createSchema = z.object({
	id: z.string().optional().nullable(),
	code: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(["tax", "fee"]),
	calculationType: z.enum(["percentage", "fixed"]),
	value: z.coerce.number(),
	currency: z.string().optional().nullable(),
	inclusionType: z.enum(["included", "excluded"]),
	appliesPer: z.enum(["stay", "night", "guest", "guest_night"]),
	priority: z.coerce.number().optional().default(0),
	effectiveFrom: z.string().optional().nullable(),
	effectiveTo: z.string().optional().nullable(),
	status: z.enum(["active", "archived"]).optional().default("active"),
})

function parseDate(value?: string | null) {
	if (!value) return null
	const d = new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

function buildWarningDefinition(
	providerId: string,
	parsed: z.infer<typeof createSchema>,
	id: string
) {
	const now = new Date()
	return {
		id,
		providerId,
		code: parsed.code,
		name: parsed.name,
		kind: parsed.kind,
		calculationType: parsed.calculationType,
		value: parsed.value,
		currency: parsed.currency ?? null,
		inclusionType: parsed.inclusionType,
		appliesPer: parsed.appliesPer,
		priority: parsed.priority ?? 0,
		jurisdictionJson: null,
		effectiveFrom: parseDate(parsed.effectiveFrom),
		effectiveTo: parseDate(parsed.effectiveTo),
		status: parsed.status,
		createdAt: now,
		updatedAt: now,
	}
}

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const { definitions } = await listTaxFeeDefinitionsByProviderUseCase({ providerId })
	const warnings = buildTaxFeeWarnings(definitions)
	const payload = definitions.map((d) => ({
		id: d.id,
		code: d.code,
		name: d.name,
		kind: d.kind,
		calculationType: d.calculationType,
		value: d.value,
		currency: d.currency,
		inclusionType: d.inclusionType,
		appliesPer: d.appliesPer,
		priority: d.priority,
		effectiveFrom: d.effectiveFrom,
		effectiveTo: d.effectiveTo,
		status: d.status,
	}))

	return new Response(JSON.stringify({ definitions: payload, warnings }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = createSchema.parse({
			code: form.get("code"),
			name: form.get("name"),
			kind: form.get("kind"),
			calculationType: form.get("calculationType"),
			value: form.get("value"),
			currency: form.get("currency"),
			inclusionType: form.get("inclusionType"),
			appliesPer: form.get("appliesPer"),
			priority: form.get("priority"),
			effectiveFrom: form.get("effectiveFrom"),
			effectiveTo: form.get("effectiveTo"),
			status: form.get("status") ?? undefined,
		})

		const result = await createTaxFeeDefinitionUseCase({
			providerId,
			code: parsed.code,
			name: parsed.name,
			kind: parsed.kind,
			calculationType: parsed.calculationType,
			value: parsed.value,
			currency: parsed.currency ?? null,
			inclusionType: parsed.inclusionType,
			appliesPer: parsed.appliesPer,
			priority: parsed.priority ?? 0,
			effectiveFrom: parseDate(parsed.effectiveFrom),
			effectiveTo: parseDate(parsed.effectiveTo),
			status: parsed.status,
		})

		const warnings = buildTaxFeeWarnings([buildWarningDefinition(providerId, parsed, result.id)])

		return new Response(JSON.stringify({ id: result.id, warnings }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status = msg.includes("Duplicate") ? 409 : 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const PUT: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = createSchema.parse({
			id: form.get("id"),
			code: form.get("code"),
			name: form.get("name"),
			kind: form.get("kind"),
			calculationType: form.get("calculationType"),
			value: form.get("value"),
			currency: form.get("currency"),
			inclusionType: form.get("inclusionType"),
			appliesPer: form.get("appliesPer"),
			priority: form.get("priority"),
			effectiveFrom: form.get("effectiveFrom"),
			effectiveTo: form.get("effectiveTo"),
			status: form.get("status") ?? undefined,
		})

		if (!parsed.id) {
			return new Response(JSON.stringify({ error: "validation_error", message: "Missing id" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await updateTaxFeeDefinitionUseCase({
			id: parsed.id,
			providerId,
			code: parsed.code,
			name: parsed.name,
			kind: parsed.kind,
			calculationType: parsed.calculationType,
			value: parsed.value,
			currency: parsed.currency ?? null,
			inclusionType: parsed.inclusionType,
			appliesPer: parsed.appliesPer,
			priority: parsed.priority ?? 0,
			effectiveFrom: parseDate(parsed.effectiveFrom),
			effectiveTo: parseDate(parsed.effectiveTo),
			status: parsed.status,
		})

		const warnings = buildTaxFeeWarnings([buildWarningDefinition(providerId, parsed, result.id)])

		return new Response(JSON.stringify({ id: result.id, warnings }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status = msg.includes("Duplicate") ? 409 : msg === "Not found" ? 404 : 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
