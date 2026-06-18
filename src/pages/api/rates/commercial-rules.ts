import type { APIRoute } from "astro"

import {
	deleteCommercialRule,
	getCommercialPriceRule,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	loadPricingAutomationSurface,
	type PricingAutomationTemplate,
} from "@/lib/pricing/pricingAutomationSurface"
import {
	createRestrictionsSurfaceRule,
	setRestrictionsSurfaceRuleActive,
} from "@/lib/rates/restrictionsSurface"
import { routes } from "@/lib/routes"
import { POST as createPricingRulePost } from "@/pages/api/pricing/rules/v2/create"

const mapTemplatePayload = (template: PricingAutomationTemplate, rawValue: number) => {
	const value =
		template.kind === "fixed_discount" ? -Math.abs(rawValue) : Math.max(0, Number(rawValue))
	return { type: template.internalType, value, contextKey: template.contextKey }
}

const eligibilityForForm = (kind: string, form: FormData): Record<string, number> => {
	if (kind === "early_bird") {
		const minLeadDays = Number(form.get("minLeadDays") ?? 30)
		if (!Number.isFinite(minLeadDays) || minLeadDays < 1) {
			throw new Error("Reserva anticipada necesita al menos 1 dia de anticipacion")
		}
		return { minLeadDays: Math.trunc(minLeadDays) }
	}
	if (kind === "last_minute") {
		const maxLeadDays = Number(form.get("maxLeadDays") ?? 3)
		if (!Number.isFinite(maxLeadDays) || maxLeadDays < 1) {
			throw new Error("Ultimo minuto necesita una ventana de llegada de al menos 1 dia")
		}
		return { maxLeadDays: Math.trunc(maxLeadDays) }
	}
	if (kind === "los_discount") {
		const minNights = Number(form.get("minNights") ?? 5)
		if (!Number.isFinite(minNights) || minNights < 1) {
			throw new Error("El descuento por estadia necesita al menos 1 noche")
		}
		return { minNights: Math.trunc(minNights) }
	}
	return {}
}

function redirectToMultiCalendar(
	request: Request,
	params: Record<string, string | number | undefined>
) {
	const target = new URL(routes.ratesMultiCalendar(), request.url)
	target.searchParams.set("tab", String(params.tab ?? "rules"))
	for (const [key, value] of Object.entries(params)) {
		if (key === "tab" || value == null || value === "") continue
		target.searchParams.set(key, String(value))
	}
	return Response.redirect(target.toString(), 303)
}

function jsonRequest(request: Request, path: string, body: Record<string, unknown>) {
	const headers = new Headers({ "Content-Type": "application/json" })
	const cookie = request.headers.get("cookie")
	if (cookie) headers.set("cookie", cookie)
	return new Request(new URL(path, request.url), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	})
}

async function deletePriceRuleDirectly(ruleId: string, ratePlanId: string) {
	const existing = await getCommercialPriceRule({ ruleId, ratePlanId })
	if (!existing?.id) throw new Error("La regla de precio ya no existe o pertenece a otra tarifa")
	await deleteCommercialRule(ruleId)
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await requireProvider(request).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (auth instanceof Response) return auth

	const form = await request.formData()
	const action = String(form.get("action") ?? "").trim()

	try {
		if (action === "create") {
			await createRestrictionsSurfaceRule(auth.providerId, form)
			return redirectToMultiCalendar(request, { tab: "rules", success: "sellability-created" })
		}

		if (action === "create-batch") {
			const scope = String(form.get("scope") ?? "rate_plan").trim()
			const scopeIds = String(form.get("scopeIds") ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean)
			if (scope !== "rate_plan") throw new Error("La seleccion multiple solo soporta tarifas")
			if (scopeIds.length === 0) throw new Error("Selecciona al menos una tarifa")

			for (const scopeId of scopeIds) {
				const item = new FormData()
				item.set("scope", scope)
				item.set("scopeId", scopeId)
				item.set("type", String(form.get("type") ?? ""))
				item.set("startDate", String(form.get("startDate") ?? ""))
				item.set("endDate", String(form.get("endDate") ?? ""))
				const value = String(form.get("value") ?? "").trim()
				if (value) item.set("value", value)
				for (const validDay of form.getAll("validDays")) item.append("validDays", validDay)
				await createRestrictionsSurfaceRule(auth.providerId, item)
			}

			return redirectToMultiCalendar(request, {
				tab: "rules",
				success: "sellability-created",
				count: scopeIds.length,
			})
		}

		if (action === "activate" || action === "deactivate") {
			const ruleId = String(form.get("ruleId") ?? "").trim()
			await setRestrictionsSurfaceRuleActive(auth.providerId, ruleId, action === "activate")
			return redirectToMultiCalendar(request, {
				tab: "rules",
				success: action === "activate" ? "sellability-activated" : "sellability-paused",
			})
		}

		if (action === "create-pricing-automation") {
			const automation = await loadPricingAutomationSurface(auth.providerId)
			const ratePlanId = String(form.get("ratePlanId") ?? "").trim()
			const kind = String(form.get("kind") ?? "").trim()
			const template = automation.templates.find((item) => item.kind === kind)
			if (!template) throw new Error("Tipo de regla de precio no soportado")
			if (!automation.ratePlanOptions.some((item) => item.id === ratePlanId)) {
				throw new Error("La tarifa no esta disponible para este proveedor")
			}
			const value = Number(form.get("value") ?? Number.NaN)
			if (!Number.isFinite(value) || value < 0) {
				throw new Error("El valor de la regla debe ser cero o mayor")
			}
			const priority = Number(form.get("priority") ?? 20)
			if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
				throw new Error("La prioridad debe estar entre 0 y 1000")
			}
			const dateFrom = String(form.get("dateFrom") ?? "").trim()
			const dateTo = String(form.get("dateTo") ?? "").trim()
			const mapped = mapTemplatePayload(template, value)
			const body: Record<string, unknown> = {
				ratePlanId,
				type: mapped.type,
				value: mapped.value,
				priority,
				contextKey: mapped.contextKey,
			}
			if (dateFrom) body.dateFrom = dateFrom
			if (dateTo) body.dateTo = dateTo
			Object.assign(body, eligibilityForForm(kind, form))

			const response = await createPricingRulePost({
				request: jsonRequest(request, "/api/pricing/rules/v2/create", body),
				url: new URL("/api/pricing/rules/v2/create", request.url),
			} as any)
			if (!response.ok) {
				const payload = await response.json().catch(() => null)
				throw new Error(String(payload?.error ?? "No se pudo crear la regla de precio"))
			}
			return redirectToMultiCalendar(request, { tab: "rules", success: "price-created" })
		}

		if (action === "delete-pricing-automation") {
			const automation = await loadPricingAutomationSurface(auth.providerId)
			const ruleId = String(form.get("ruleId") ?? "").trim()
			const ratePlanId = String(form.get("ratePlanId") ?? "").trim()
			if (!automation.rules.some((rule) => rule.id === ruleId && rule.ratePlanId === ratePlanId)) {
				throw new Error("La regla de precio no esta disponible para este proveedor")
			}
			await deletePriceRuleDirectly(ruleId, ratePlanId)
			return redirectToMultiCalendar(request, { tab: "rules", success: "price-deleted" })
		}

		throw new Error("Accion de regla no soportada")
	} catch (error) {
		return redirectToMultiCalendar(request, {
			tab: "rules",
			error: error instanceof Error ? error.message : "No se pudo guardar la regla",
		})
	}
}
