import {
	and,
	db,
	desc,
	eq,
	inArray,
	PolicyAuditLog,
	PolicyGroup,
	PriceRule,
	Product,
	RatePlan,
	RatePlanTemplate,
	Restriction,
	Variant,
} from "astro:db"

export type ContextualHistoryItem = {
	id: string
	title: string
	description: string
	meta: string
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
		modifier: "modificador",
		absolute: "precio absoluto",
		override: "sobrescritura",
	}
	return labels[key] ?? (key || "regla de precio")
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

export async function loadRatesContextualHistory(params: {
	providerId: string
	ratePlans: RatePlanContext[]
	limit?: number
}): Promise<ContextualHistoryItem[]> {
	const limit = params.limit ?? 8
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

	const ratePlanRows = await db
		.select({
			id: RatePlan.id,
			createdAt: RatePlan.createdAt,
			templateName: RatePlanTemplate.name,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.innerJoin(RatePlanTemplate, eq(RatePlanTemplate.id, RatePlan.templateId))
		.where(and(eq(Product.providerId, params.providerId), inArray(RatePlan.id, ratePlanIds)))
		.orderBy(desc(RatePlan.createdAt))
		.limit(limit)
		.all()

	const priceRules = await db
		.select({
			id: PriceRule.id,
			ratePlanId: PriceRule.ratePlanId,
			name: PriceRule.name,
			type: PriceRule.type,
			value: PriceRule.value,
			isActive: PriceRule.isActive,
			createdAt: PriceRule.createdAt,
		})
		.from(PriceRule)
		.where(inArray(PriceRule.ratePlanId, ratePlanIds))
		.orderBy(desc(PriceRule.createdAt))
		.limit(limit)
		.all()

	const restrictionQueries: Promise<any[]>[] = [
		db
			.select()
			.from(Restriction)
			.where(and(eq(Restriction.scope, "rate_plan"), inArray(Restriction.scopeId, ratePlanIds)))
			.orderBy(desc(Restriction.createdAt))
			.limit(limit)
			.all(),
	]
	if (variantIds.length) {
		restrictionQueries.push(
			db
				.select()
				.from(Restriction)
				.where(and(eq(Restriction.scope, "variant"), inArray(Restriction.scopeId, variantIds)))
				.orderBy(desc(Restriction.createdAt))
				.limit(limit)
				.all()
		)
	}
	if (productIds.length) {
		restrictionQueries.push(
			db
				.select()
				.from(Restriction)
				.where(and(eq(Restriction.scope, "product"), inArray(Restriction.scopeId, productIds)))
				.orderBy(desc(Restriction.createdAt))
				.limit(limit)
				.all()
		)
	}
	const restrictions = (await Promise.all(restrictionQueries)).flat()

	return sortHistory(
		[
			...ratePlanRows.map((row) => ({
				id: `rate_plan:${row.id}`,
				title: "Tarifa creada",
				description: `${ratePlanLabel(ratePlanMap, row.id)} quedó disponible para operación comercial.`,
				meta: row.templateName ? `Plantilla: ${row.templateName}` : "Origen: tarifa",
				createdAt: toIso(row.createdAt),
				tone: "success" as const,
			})),
			...priceRules.map((rule) => ({
				id: `price_rule:${rule.id}`,
				title: "Regla de precio creada",
				description: `${rule.name || priceRuleLabel(rule.type)} sobre ${ratePlanLabel(ratePlanMap, rule.ratePlanId)}.`,
				meta: `${priceRuleLabel(rule.type)} · ${Number(rule.value ?? 0)} · ${rule.isActive ? "activa" : "inactiva"}`,
				createdAt: toIso(rule.createdAt),
				tone: "info" as const,
			})),
			...restrictions.map((rule) => ({
				id: `restriction:${rule.id}`,
				title: "Regla de venta creada",
				description: `${restrictionTypeLabel(rule.type)} aplicada a ${scopeLabel(rule.scope)}.`,
				meta: `${String(rule.startDate ?? "sin inicio")} a ${String(rule.endDate ?? "sin fin")} · ${rule.isActive ? "activa" : "inactiva"}`,
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
		description: `${String(row.category ?? "Condición")} actualizada en la biblioteca contractual.`,
		meta: `${scopeLabel(row.scope ?? "global")} · ${String(row.scopeId ?? row.policyGroupId ?? "sin alcance")} · ${String(row.channel ?? "todos los canales")}`,
		createdAt: toIso(row.createdAt),
		tone: "info",
	}))
}
