import type { APIRoute } from "astro"

import {
	createCommercialPriceRule,
	deleteCommercialRule,
	getCommercialPriceRule,
	listCommercialPriceRulesByRatePlan,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	loadPricingAutomationSurface,
	type PricingAutomationTemplate,
} from "@/lib/pricing/pricingAutomationSurface"
import {
	createRestrictionsSurfaceRule,
	deleteRestrictionsSurfaceRule,
	setRestrictionsSurfaceRuleActive,
	updateRestrictionsSurfaceRule,
} from "@/lib/rates/restrictionsSurface"
import { routes } from "@/lib/routes"
import { POST as createPricingRulePost } from "@/pages/api/pricing/rules/v2/create"
import { POST as deletePricingRulePost } from "@/pages/api/pricing/rules/v2/delete"
import { POST as updatePricingRulePost } from "@/pages/api/pricing/rules/v2/update"

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

async function ownedPriceRule(providerId: string, ruleId: string, ratePlanId: string) {
	const automation = await loadPricingAutomationSurface(providerId)
	if (!automation.rules.some((rule) => rule.id === ruleId && rule.ratePlanId === ratePlanId)) {
		throw new Error("La regla de precio no esta disponible para este proveedor")
	}
	const rule = await getCommercialPriceRule({ ruleId, ratePlanId })
	if (!rule) throw new Error("La regla de precio ya no existe")
	return rule
}

async function runPricingMutation(
	handler: typeof createPricingRulePost,
	request: Request,
	path: string,
	body: Record<string, unknown>
) {
	const response = await handler({
		request: jsonRequest(request, path, body),
		url: new URL(path, request.url),
	} as any)
	if (!response.ok) {
		const payload = await response.json().catch(() => null)
		throw new Error(String(payload?.error ?? "No se pudo actualizar la regla de precio"))
	}
	return response.json().catch(() => ({}))
}

function priceRulePayload(rule: Awaited<ReturnType<typeof ownedPriceRule>>) {
	const dateRange = rule.dateRangeJson ?? {}
	const eligibility =
		dateRange.eligibility && typeof dateRange.eligibility === "object"
			? (dateRange.eligibility as Record<string, unknown>)
			: {}
	return {
		ratePlanId: rule.ratePlanId,
		ruleId: rule.id,
		type: rule.type,
		value: rule.value,
		priority: rule.priority,
		dateFrom: String(dateRange.from ?? ""),
		dateTo: String(dateRange.to ?? ""),
		dayOfWeek: rule.dayOfWeekJson?.join(",") ?? "",
		contextKey: rule.name?.startsWith("ctx:") ? rule.name.slice(4) : "",
		occupancyKey: rule.occupancyKey ?? "",
		...eligibility,
	}
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue)
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, stableValue(entry)])
		)
	}
	return value ?? null
}

function priceRuleSignature(rule: {
	ratePlanId: string
	type: string
	value: number
	dateRangeJson?: Record<string, unknown> | null
	dayOfWeekJson?: number[] | null
	occupancyKey?: string | null
}) {
	return JSON.stringify(
		stableValue({
			ratePlanId: rule.ratePlanId,
			type: rule.type,
			value: rule.value,
			dateRangeJson: rule.dateRangeJson ?? null,
			dayOfWeekJson: [...(rule.dayOfWeekJson ?? [])].sort((left, right) => left - right),
			occupancyKey: rule.occupancyKey ?? null,
		})
	)
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
		if (["update-rule", "toggle-rule", "create-variant", "delete-rule"].includes(action)) {
			const ruleId = String(form.get("ruleId") ?? "").trim()
			const category = String(form.get("category") ?? "").trim()
			const ratePlanId = String(form.get("ratePlanId") ?? "").trim()
			if (!ruleId) throw new Error("Falta la regla seleccionada")

			if (category === "price") {
				const rule = await ownedPriceRule(auth.providerId, ruleId, ratePlanId)
				const basePayload = priceRulePayload(rule)
				if (action === "create-variant") {
					const startDate = String(form.get("startDate") ?? "").trim()
					const endDate = String(form.get("endDate") ?? "").trim()
					const value = Number(form.get("value") ?? rule.value)
					const priority = Number(form.get("priority") ?? rule.priority)
					if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
						throw new Error("La variante necesita una vigencia válida")
					}
					if (endDate < startDate) throw new Error("La vigencia no es válida")
					if (!Number.isFinite(value)) throw new Error("El valor de precio no es válido")
					if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
						throw new Error("La prioridad debe estar entre 0 y 1000")
					}
					const dateRangeJson = {
						...(rule.dateRangeJson ?? {}),
						from: startDate,
						to: endDate,
					}
					const candidate = {
						ratePlanId,
						type: rule.type,
						value,
						dateRangeJson,
						dayOfWeekJson: rule.dayOfWeekJson,
						occupancyKey: rule.occupancyKey,
					}
					const existing = await listCommercialPriceRulesByRatePlan(ratePlanId)
					if (existing.some((item) => priceRuleSignature(item) === priceRuleSignature(candidate))) {
						throw new Error("Cambia la vigencia o el valor antes de guardar la variante")
					}
					await createCommercialPriceRule({
						providerId: auth.providerId,
						ratePlanId,
						name: rule.name,
						type: rule.type,
						value,
						priority,
						dateRangeJson,
						dayOfWeekJson: rule.dayOfWeekJson,
						occupancyKey: rule.occupancyKey,
						isActive: false,
						sourceRuleId: rule.id,
					})
				}
				if (action === "update-rule") {
					const startDate = String(form.get("startDate") ?? "").trim()
					const endDate = String(form.get("endDate") ?? "").trim()
					const value = Number(form.get("value") ?? rule.value)
					const priority = Number(form.get("priority") ?? rule.priority)
					if (!Number.isFinite(value)) throw new Error("El valor de precio no es valido")
					if (startDate && endDate && endDate < startDate)
						throw new Error("La vigencia no es valida")
					await runPricingMutation(updatePricingRulePost, request, "/api/pricing/rules/v2/update", {
						...basePayload,
						value,
						priority,
						dateFrom: startDate,
						dateTo: endDate,
					})
				}
				if (action === "toggle-rule") {
					if (!rule.isActive) {
						const existing = await listCommercialPriceRulesByRatePlan(ratePlanId)
						if (
							existing.some(
								(item) =>
									item.id !== rule.id &&
									item.isActive &&
									priceRuleSignature(item) === priceRuleSignature(rule)
							)
						) {
							throw new Error("Ya existe una regla activa idéntica")
						}
					}
					await runPricingMutation(updatePricingRulePost, request, "/api/pricing/rules/v2/update", {
						...basePayload,
						isActive: !rule.isActive,
					})
				}
				if (action === "delete-rule") {
					await runPricingMutation(deletePricingRulePost, request, "/api/pricing/rules/v2/delete", {
						ratePlanId,
						ruleId,
					})
				}
			} else {
				if (action === "update-rule") await updateRestrictionsSurfaceRule(auth.providerId, form)
				if (action === "toggle-rule") {
					const isActive = String(form.get("isActive") ?? "") !== "true"
					await setRestrictionsSurfaceRuleActive(auth.providerId, ruleId, isActive)
				}
				if (action === "create-variant") {
					throw new Error("Esta regla se crea desde una nueva selección del Multicalendario")
				}
				if (action === "delete-rule") await deleteRestrictionsSurfaceRule(auth.providerId, ruleId)
			}

			return redirectToMultiCalendar(request, { tab: "rules", success: action })
		}

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
