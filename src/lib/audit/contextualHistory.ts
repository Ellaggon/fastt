import {
	and,
	db,
	desc,
	eq,
	inArray,
	PolicyAuditLog,
	PolicyGroup,
	Product,
	RatePlan,
	Variant,
} from "astro:db"
import {
	listCommercialPriceRulesByRatePlans,
	listCommercialSellabilityRulesForScopes,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"

export type ContextualHistoryItem = {
	id: string
	title: string
	description: string
	meta: string
	objectType: "tarifa" | "habitacion" | "fecha" | "condicion" | "hotel" | "operacion"
	objectLabel: string
	beforeLabel?: string
	afterLabel?: string
	createdAt: string
	tone: "neutral" | "success" | "warning" | "info"
}

type RatePlanContext = {
	ratePlanId: string
	ratePlanName?: string
	productId?: string
	productName?: string
	variantId?: string
	variantName?: string
}

function toIso(value: unknown): string {
	if (value instanceof Date) return value.toISOString()
	if (typeof value === "string" && value.trim()) return value
	return ""
}

export function formatHistoryDate(value: unknown): string {
	const raw = toIso(value)
	if (!raw) return "Sin fecha"
	const date = new Date(raw)
	if (Number.isNaN(date.getTime())) return raw
	return new Intl.DateTimeFormat("es-BO", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "America/La_Paz",
	}).format(date)
}

function sortHistory(items: ContextualHistoryItem[], limit: number) {
	return [...items]
		.sort((a, b) => {
			const da = new Date(a.createdAt).getTime()
			const db = new Date(b.createdAt).getTime()
			return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0)
		})
		.slice(0, Math.max(0, limit))
}

function ratePlanLabel(map: Map<string, RatePlanContext>, ratePlanId: unknown) {
	const row = map.get(String(ratePlanId ?? ""))
	return row?.ratePlanName || String(ratePlanId ?? "Tarifa")
}

function restrictionTypeLabel(type: unknown) {
	const key = String(type ?? "")
	const labels: Record<string, string> = {
		stop_sell: "cierre de venta",
		min_los: "estadía mínima",
		max_los: "estadía máxima",
		cta: "no llegada",
		ctd: "no salida",
		min_lead_time: "anticipación mínima",
		max_lead_time: "anticipación máxima",
	}
	return labels[key] ?? (key || "restricción")
}

function priceRuleLabel(type: unknown) {
	const key = String(type ?? "")
	const labels: Record<string, string> = {
		percentage: "ajuste porcentual",
		fixed: "ajuste fijo",
		fixed_adjustment: "ajuste fijo",
		fixed_override: "precio fijo",
		percentage_discount: "descuento porcentual",
		percentage_markup: "recargo porcentual",
		modifier: "modificador",
		absolute: "precio absoluto",
		override: "sobrescritura",
	}
	return labels[key] ?? (key || "regla de precio")
}

function priceRuleNameLabel(name: unknown, type: unknown) {
	const value = String(name ?? "").trim()
	if (!value || value.startsWith("ctx:")) return priceRuleLabel(type)
	return value.replaceAll("_", " ")
}

function dateRangeLabel(value: unknown) {
	if (!value || typeof value !== "object") return ""
	const record = value as Record<string, unknown>
	const from = String(record.from ?? record.startDate ?? "").trim()
	const to = String(record.to ?? record.endDate ?? "").trim()
	if (from && to) return `${from} a ${to}`
	if (from) return `desde ${from}`
	if (to) return `hasta ${to}`
	return ""
}

function policyEventLabel(type: unknown) {
	const key = String(type ?? "")
	const labels: Record<string, string> = {
		policy_created: "Condición creada",
		policy_version_created: "Nueva versión",
		policy_published: "Condición publicada",
		policy_archived: "Condición archivada",
		assignment_created: "Asignación creada",
		assignment_replaced: "Asignación reemplazada",
		override_created: "Excepción registrada",
		snapshot_created: "Resumen contractual creado",
	}
	return labels[key] ?? (key || "Evento de condición")
}

function policyCategoryLabel(category: unknown) {
	const key = String(category ?? "")
	const labels: Record<string, string> = {
		cancellation: "Cancelación",
		payment: "Pago",
		no_show: "No presentación",
		check_in: "Ingreso y salida",
		checkin: "Ingreso y salida",
	}
	return labels[key] ?? (key || "Condición")
}

function scopeLabel(scope: unknown) {
	const key = String(scope ?? "")
	const labels: Record<string, string> = {
		rate_plan: "tarifa",
		variant: "habitación",
		product: "hotel",
		channel: "canal",
		global: "biblioteca",
	}
	return labels[key] ?? (key || "alcance")
}

function stringifyValue(value: unknown): string {
	if (value == null || value === "") return "sin dato"
	if (typeof value === "boolean") return value ? "activo" : "inactivo"
	if (typeof value === "number") return String(value)
	if (typeof value === "string") return value
	if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? "" : "s"}`
	if (typeof value === "object") return "detalle actualizado"
	return String(value)
}

function summarizeAuditPayload(value: unknown, fallback: string): string {
	if (!value || typeof value !== "object") return fallback
	const record = value as Record<string, unknown>
	const preferredKeys = [
		"status",
		"state",
		"category",
		"scope",
		"channel",
		"policyId",
		"policyGroupId",
		"assignmentId",
	]
	const parts = preferredKeys
		.filter((key) => record[key] !== undefined && record[key] !== null && record[key] !== "")
		.slice(0, 3)
		.map((key) => `${key}: ${stringifyValue(record[key])}`)
	if (parts.length) return parts.join(" · ")
	const keys = Object.keys(record).slice(0, 3)
	if (!keys.length) return fallback
	return keys.map((key) => `${key}: ${stringifyValue(record[key])}`).join(" · ")
}

export async function loadRatesContextualHistory(params: {
	providerId: string
	ratePlans: RatePlanContext[]
	limit?: number
	context?: "rate_plans" | "calendar"
}): Promise<ContextualHistoryItem[]> {
	const limit = params.limit ?? 8
	const context = params.context ?? "rate_plans"
	const ratePlans = params.ratePlans.filter((row) => row.ratePlanId)
	const ratePlanIds = [...new Set(ratePlans.map((row) => String(row.ratePlanId)))]
	if (!params.providerId || !ratePlanIds.length) return []

	const ratePlanMap = new Map(ratePlans.map((row) => [String(row.ratePlanId), row]))
	const variantIds = [
		...new Set(ratePlans.map((row) => String(row.variantId ?? "")).filter(Boolean)),
	]
	const productIds = [
		...new Set(ratePlans.map((row) => String(row.productId ?? "")).filter(Boolean)),
	]

	const ratePlanName = await resolveRatePlanNameColumn()
	const ratePlanRows = await db
		.select({
			id: RatePlan.id,
			createdAt: RatePlan.createdAt,
			ratePlanName,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Product.providerId, params.providerId), inArray(RatePlan.id, ratePlanIds)))
		.orderBy(desc(RatePlan.createdAt))
		.limit(limit)
		.all()

	const priceRules = (await listCommercialPriceRulesByRatePlans(ratePlanIds))
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, limit)
	const restrictions = (
		await listCommercialSellabilityRulesForScopes({
			scopeIds: [...ratePlanIds, ...variantIds, ...productIds],
		})
	)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, limit)

	return sortHistory(
		[
			...(context === "calendar" ? [] : ratePlanRows).map((row) => ({
				id: `rate_plan:${row.id}`,
				title: "Tarifa creada",
				description: `${ratePlanLabel(ratePlanMap, row.id)} quedó disponible para operación comercial.`,
				meta: row.ratePlanName ? `Tarifa: ${row.ratePlanName}` : "Origen: tarifa",
				objectType: "tarifa" as const,
				objectLabel: ratePlanLabel(ratePlanMap, row.id),
				beforeLabel: "No existía en la operación comercial",
				afterLabel: row.ratePlanName ? `Tarifa ${row.ratePlanName}` : "Tarifa disponible",
				createdAt: toIso(row.createdAt),
				tone: "success" as const,
			})),
			...priceRules.map((rule) => ({
				id: `price_rule:${rule.id}`,
				title: context === "calendar" ? "Cambio de precio creado" : "Regla de precio creada",
				description:
					context === "calendar"
						? `${priceRuleNameLabel(rule.name, rule.type)} para ${dateRangeLabel(rule.dateRangeJson) || "el calendario seleccionado"}.`
						: `${priceRuleNameLabel(rule.name, rule.type)} en ${ratePlanLabel(ratePlanMap, rule.ratePlanId)}.`,
				meta:
					context === "calendar"
						? `${ratePlanLabel(ratePlanMap, rule.ratePlanId)} · ${priceRuleLabel(rule.type)} · ${rule.isActive ? "activa" : "inactiva"}`
						: `${priceRuleLabel(rule.type)} · ${Number(rule.value ?? 0)} · ${rule.isActive ? "activa" : "inactiva"}`,
				objectType: context === "calendar" ? ("fecha" as const) : ("tarifa" as const),
				objectLabel:
					context === "calendar"
						? dateRangeLabel(rule.dateRangeJson) || "Calendario"
						: ratePlanLabel(ratePlanMap, rule.ratePlanId),
				beforeLabel: "Sin esta regla de precio",
				afterLabel: `${priceRuleLabel(rule.type)} · ${Number(rule.value ?? 0)} · ${rule.isActive ? "activa" : "inactiva"}`,
				createdAt: toIso(rule.createdAt),
				tone: "info" as const,
			})),
			...(context === "rate_plans" ? [] : restrictions).map((rule) => ({
				id: `restriction:${rule.id}`,
				title: "Regla de venta creada",
				description: `${restrictionTypeLabel(rule.type)} aplicada a ${scopeLabel(rule.scope)}.`,
				meta: `${String(rule.startDate ?? "sin inicio")} a ${String(rule.endDate ?? "sin fin")} · ${rule.isActive ? "activa" : "inactiva"}`,
				objectType: "fecha" as const,
				objectLabel: `${String(rule.startDate ?? "sin inicio")} a ${String(rule.endDate ?? "sin fin")}`,
				beforeLabel: "Venta sin esta regla",
				afterLabel: `${restrictionTypeLabel(rule.type)} · ${rule.isActive ? "activa" : "inactiva"}`,
				createdAt: toIso(rule.createdAt),
				tone: rule.isActive ? ("warning" as const) : ("neutral" as const),
			})),
		],
		limit
	)
}

export async function loadPolicyContextualHistory(params: {
	providerId: string
	limit?: number
}): Promise<ContextualHistoryItem[]> {
	const limit = params.limit ?? 8
	if (!params.providerId) return []
	const rows = await db
		.select({
			id: PolicyAuditLog.id,
			eventType: PolicyAuditLog.eventType,
			scope: PolicyAuditLog.scope,
			scopeId: PolicyAuditLog.scopeId,
			channel: PolicyAuditLog.channel,
			createdAt: PolicyAuditLog.createdAt,
			policyGroupId: PolicyAuditLog.policyGroupId,
			beforeJson: PolicyAuditLog.beforeJson,
			afterJson: PolicyAuditLog.afterJson,
			category: PolicyGroup.category,
		})
		.from(PolicyAuditLog)
		.innerJoin(PolicyGroup, eq(PolicyGroup.id, PolicyAuditLog.policyGroupId))
		.where(eq(PolicyGroup.ownerProviderId, params.providerId))
		.orderBy(desc(PolicyAuditLog.createdAt))
		.limit(limit)
		.all()

	return rows.map((row) => ({
		id: `policy_audit:${row.id}`,
		title: policyEventLabel(row.eventType),
		description: `${policyCategoryLabel(row.category)} actualizada en la biblioteca contractual.`,
		meta: `${scopeLabel(row.scope ?? "global")} · ${String(row.channel ?? "todos los canales")}`,
		objectType: "condicion",
		objectLabel: policyCategoryLabel(row.category),
		beforeLabel: summarizeAuditPayload(row.beforeJson, "Estado anterior no registrado"),
		afterLabel: summarizeAuditPayload(row.afterJson, "Cambio registrado"),
		createdAt: toIso(row.createdAt),
		tone: "info",
	}))
}
