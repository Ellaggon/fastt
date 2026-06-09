import { and, db, eq, inArray, PriceRule, Product, RatePlan, Variant } from "astro:db"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"

import {
	formatPricingRuleEligibilityLabel,
	type PricingRuleEligibility,
} from "@/modules/pricing/public"
import { routes } from "@/lib/routes"
import { formatHumanDateLabel } from "@/lib/rates/calendarRangeOperations"

export type PricingAutomationKind =
	| "manual_override"
	| "percentage_discount"
	| "fixed_discount"
	| "percentage_markup"
	| "fixed_markup"
	| "early_bird"
	| "last_minute"
	| "los_discount"
	| "markup"
	| "other"

export type PricingAutomationTemplate = {
	kind: Exclude<PricingAutomationKind, "markup" | "other">
	label: string
	shortLabel: string
	description: string
	internalType: "fixed_override" | "percentage_discount" | "percentage_markup" | "fixed_adjustment"
	defaultValue: number
	valueSuffix: string
	contextKey: string
	defaultEligibility?: PricingRuleEligibility
	eligibilityHint?: string
}

export type PricingAutomationSurfaceRule = {
	id: string
	ratePlanId: string
	ratePlanName: string
	productName: string
	variantName: string
	type: string
	kind: PricingAutomationKind
	kindLabel: string
	status: "active" | "inactive"
	statusLabel: string
	valueLabel: string
	validityLabel: string
	eligibilityLabel: string
	priority: number
	summary: string
	createdAt: Date
	quickLinks: {
		ratePlan: string
	}
}

export type PricingAutomationSurface = {
	rules: PricingAutomationSurfaceRule[]
	templates: PricingAutomationTemplate[]
	ratePlanOptions: Array<{
		id: string
		label: string
		productName: string
		variantName: string
		ratePlanName: string
	}>
	stats: {
		totalRules: number
		activeRules: number
		inactiveRules: number
		discountRules: number
		overrideRules: number
		ratePlansWithRules: number
	}
}

export const PRICING_AUTOMATION_TEMPLATES: PricingAutomationTemplate[] = [
	{
		kind: "manual_override",
		label: "Precio programado por fechas",
		shortLabel: "Precio programado por fechas",
		description:
			"Fija un precio final solo cuando una ventana de fechas lo necesita de forma recurrente.",
		internalType: "fixed_override",
		defaultValue: 100,
		valueSuffix: "precio final",
		contextKey: "manual_override",
	},
	{
		kind: "percentage_discount",
		label: "Descuento por porcentaje",
		shortLabel: "Descuento por porcentaje",
		description: "Baja un porcentaje durante una ventana definida.",
		internalType: "percentage_discount",
		defaultValue: 10,
		valueSuffix: "% de descuento",
		contextKey: "percentage_discount",
	},
	{
		kind: "fixed_discount",
		label: "Descuento por monto",
		shortLabel: "Descuento por monto",
		description:
			"Resta un monto concreto durante fechas recurrentes o una ventana comercial clara.",
		internalType: "fixed_adjustment",
		defaultValue: 10,
		valueSuffix: "de descuento",
		contextKey: "fixed_discount",
	},
	{
		kind: "percentage_markup",
		label: "Aumento por porcentaje",
		shortLabel: "Aumento por porcentaje",
		description: "Sube un porcentaje durante fechas de mayor demanda.",
		internalType: "percentage_markup",
		defaultValue: 10,
		valueSuffix: "% de aumento",
		contextKey: "percentage_markup",
	},
	{
		kind: "fixed_markup",
		label: "Aumento por monto",
		shortLabel: "Aumento por monto",
		description: "Suma un monto concreto durante una ventana definida.",
		internalType: "fixed_adjustment",
		defaultValue: 10,
		valueSuffix: "de aumento",
		contextKey: "fixed_markup",
	},
	{
		kind: "early_bird",
		label: "Reserva anticipada",
		shortLabel: "Reserva anticipada",
		description: "Ayuda a premiar reservas hechas con suficiente anticipación.",
		internalType: "percentage_discount",
		defaultValue: 10,
		valueSuffix: "% de descuento",
		contextKey: "early_bird",
		defaultEligibility: { minLeadDays: 30 },
		eligibilityHint: "Predeterminado: reserva al menos 30 días antes del check-in.",
	},
	{
		kind: "last_minute",
		label: "Último minuto",
		shortLabel: "Último minuto",
		description: "Ayuda a mover noches cercanas cuando todavía hay demanda pendiente.",
		internalType: "percentage_discount",
		defaultValue: 10,
		valueSuffix: "% de descuento",
		contextKey: "last_minute",
		defaultEligibility: { maxLeadDays: 3 },
		eligibilityHint: "Predeterminado: reserva dentro de los 3 días previos al check-in.",
	},
	{
		kind: "los_discount",
		label: "Descuento por estadía",
		shortLabel: "Descuento por estadía",
		description: "Incentiva reservas que cumplen una cantidad mínima de noches.",
		internalType: "percentage_discount",
		defaultValue: 12,
		valueSuffix: "% de descuento",
		contextKey: "los_discount",
		defaultEligibility: { minNights: 5 },
		eligibilityHint: "Predeterminado: estadías de 5 noches o más.",
	},
]

const TEMPLATE_BY_CONTEXT = new Map(
	PRICING_AUTOMATION_TEMPLATES.map((item) => [item.contextKey, item])
)

function contextKeyFromRule(rule: { contextKey?: string | null; name?: string | null }): string {
	const direct = String(rule.contextKey ?? "").trim()
	if (direct) return direct
	const name = String(rule.name ?? "").trim()
	return name.startsWith("ctx:") ? name.slice(4).trim() : ""
}

export function resolvePricingAutomationKind(rule: {
	type: string
	value: number
	contextKey?: string | null
	name?: string | null
}): PricingAutomationKind {
	const contextKey = contextKeyFromRule(rule)
	const byContext = TEMPLATE_BY_CONTEXT.get(contextKey)
	if (byContext) return byContext.kind

	const type = String(rule.type ?? "").trim()
	if (type === "fixed_override") return "manual_override"
	if (type === "percentage_discount") return "percentage_discount"
	if (type === "fixed_adjustment" && Number(rule.value) < 0) return "fixed_discount"
	if (type === "fixed_adjustment" && Number(rule.value) > 0) return "fixed_markup"
	if (type === "percentage_markup") return "percentage_markup"
	if (type === "percentage_markup" || (type === "fixed_adjustment" && Number(rule.value) > 0)) {
		return "markup"
	}
	return "other"
}

export function pricingAutomationKindLabel(kind: PricingAutomationKind): string {
	switch (kind) {
		case "manual_override":
			return "Precio programado por fechas"
		case "percentage_discount":
			return "Descuento por porcentaje"
		case "fixed_discount":
			return "Descuento por monto"
		case "percentage_markup":
			return "Aumento por porcentaje"
		case "fixed_markup":
			return "Aumento por monto"
		case "early_bird":
			return "Reserva anticipada"
		case "last_minute":
			return "Último minuto"
		case "los_discount":
			return "Descuento por estadía"
		case "markup":
			return "Incremento"
		default:
			return "Regla automática"
	}
}

function formatValue(rule: { type: string; value: number }, kind: PricingAutomationKind): string {
	const value = Number(rule.value)
	if (kind === "manual_override") return `precio final ${formatNumber(value)}`
	if (kind === "fixed_discount") return `${formatNumber(Math.abs(value))} de descuento`
	if (kind === "fixed_markup") return `${formatNumber(Math.abs(value))} de aumento`
	if (kind === "percentage_markup") return `${formatNumber(Math.abs(value))}% de aumento`
	if (String(rule.type).includes("percentage"))
		return `${formatNumber(Math.abs(value))}% de descuento`
	if (kind === "markup") return `ajuste ${formatSigned(value)}`
	return formatSigned(value)
}

function formatNumber(value: number): string {
	return Number(value || 0).toLocaleString("en-US", {
		maximumFractionDigits: 2,
	})
}

function formatSigned(value: number): string {
	const formatted = formatNumber(Math.abs(value))
	return `${value >= 0 ? "+" : "-"}${formatted}`
}

function formatValidity(rule: { dateFrom?: string | null; dateTo?: string | null }): string {
	const from = String(rule.dateFrom ?? "").trim()
	const to = String(rule.dateTo ?? "").trim()
	if (from && to) return `${formatHumanDateLabel(from)} a ${formatHumanDateLabel(to)}`
	if (from) return `Desde ${formatHumanDateLabel(from)}`
	if (to) return `Hasta ${formatHumanDateLabel(to)}`
	return "Siempre activa"
}

function buildSummary(
	rule: {
		type: string
		value: number
		dateFrom?: string | null
		dateTo?: string | null
		dayOfWeek?: number[]
		eligibility?: PricingRuleEligibility | null
	},
	kind: PricingAutomationKind
): string {
	const dayLabel = rule.dayOfWeek?.length ? ` · ${rule.dayOfWeek.length} días de semana` : ""
	const eligibilityLabel = formatPricingRuleEligibilityLabel(rule.eligibility)
	const eligibility =
		eligibilityLabel === "Sin elegibilidad adicional" ? "" : ` · elegibilidad: ${eligibilityLabel}`
	return `${pricingAutomationKindLabel(kind)} actúa automáticamente: ${formatValue(rule, kind)} · ${formatValidity(rule).toLowerCase()}${dayLabel}${eligibility}.`
}

function readEligibility(value: unknown): PricingRuleEligibility | null {
	if (!value || typeof value !== "object") return null
	const raw = (value as { eligibility?: unknown }).eligibility
	if (!raw || typeof raw !== "object") return null
	const record = raw as Record<string, unknown>
	const eligibility: PricingRuleEligibility = {
		minLeadDays: Number.isFinite(Number(record.minLeadDays))
			? Math.trunc(Number(record.minLeadDays))
			: undefined,
		maxLeadDays: Number.isFinite(Number(record.maxLeadDays))
			? Math.trunc(Number(record.maxLeadDays))
			: undefined,
		minNights: Number.isFinite(Number(record.minNights))
			? Math.trunc(Number(record.minNights))
			: undefined,
	}
	return eligibility.minLeadDays || eligibility.maxLeadDays || eligibility.minNights
		? eligibility
		: null
}

async function loadProviderRatePlans(providerId: string) {
	const ratePlanName = await resolveRatePlanNameColumn()
	return db
		.select({
			ratePlanId: RatePlan.id,
			ratePlanName,
			productName: Product.name,
			variantName: Variant.name,
			productId: Product.id,
			variantId: Variant.id,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(RatePlan.variantId, Variant.id))
		.innerJoin(Product, eq(Variant.productId, Product.id))
		.where(and(eq(Product.providerId, providerId), eq(RatePlan.isActive, true)))
		.all()
}

export async function loadPricingAutomationSurface(
	providerId: string
): Promise<PricingAutomationSurface> {
	const ratePlans = await loadProviderRatePlans(providerId)
	const byRatePlan = new Map(ratePlans.map((row) => [String(row.ratePlanId), row]))
	const ratePlanIds = ratePlans.map((row) => String(row.ratePlanId)).filter(Boolean)

	const ruleRows = ratePlanIds.length
		? await db.select().from(PriceRule).where(inArray(PriceRule.ratePlanId, ratePlanIds)).all()
		: []

	const rules = ruleRows
		.map((row) => {
			const dateRange =
				row.dateRangeJson && typeof row.dateRangeJson === "object"
					? (row.dateRangeJson as { from?: string | null; to?: string | null })
					: null
			const rule = {
				id: String(row.id),
				ratePlanId: String(row.ratePlanId),
				name: row.name == null ? null : String(row.name),
				type: String(row.type),
				value: Number(row.value),
				priority: Number(row.priority ?? 10),
				dateFrom: String(dateRange?.from ?? "").trim() || null,
				dateTo: String(dateRange?.to ?? "").trim() || null,
				eligibility: readEligibility(row.dateRangeJson),
				dayOfWeek: Array.isArray(row.dayOfWeekJson)
					? (row.dayOfWeekJson as unknown[])
							.map((item) => Number(item))
							.filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
					: [],
				contextKey:
					typeof row.name === "string" && row.name.startsWith("ctx:") ? row.name.slice(4) : null,
				isActive: Boolean(row.isActive),
				createdAt: row.createdAt,
			}
			const context = byRatePlan.get(String(rule.ratePlanId))
			const kind = resolvePricingAutomationKind(rule)
			return {
				id: rule.id,
				ratePlanId: rule.ratePlanId,
				ratePlanName: String(context?.ratePlanName ?? "Rate plan"),
				productName: String(context?.productName ?? "Product"),
				variantName: String(context?.variantName ?? "Variant"),
				type: rule.type,
				kind,
				kindLabel: pricingAutomationKindLabel(kind),
				status: rule.isActive ? "active" : "inactive",
				statusLabel: rule.isActive ? "Activa" : "Inactiva",
				valueLabel: formatValue(rule, kind),
				validityLabel: formatValidity(rule),
				eligibilityLabel: formatPricingRuleEligibilityLabel(rule.eligibility),
				priority: Number(rule.priority ?? 10),
				summary: buildSummary(rule, kind),
				createdAt: rule.createdAt,
				quickLinks: {
					ratePlan: routes.ratePlansList(),
				},
			} satisfies PricingAutomationSurfaceRule
		})
		.sort((a, b) => {
			if (a.status !== b.status) return a.status === "active" ? -1 : 1
			if (a.priority !== b.priority) return a.priority - b.priority
			return b.createdAt.getTime() - a.createdAt.getTime()
		})

	const ratePlansWithRules = new Set(rules.map((rule) => rule.ratePlanId)).size
	return {
		rules,
		templates: PRICING_AUTOMATION_TEMPLATES,
		ratePlanOptions: ratePlans.map((row) => ({
			id: String(row.ratePlanId),
			label: `${row.productName} · ${row.variantName} · ${row.ratePlanName}`,
			productName: String(row.productName),
			variantName: String(row.variantName),
			ratePlanName: String(row.ratePlanName),
		})),
		stats: {
			totalRules: rules.length,
			activeRules: rules.filter((rule) => rule.status === "active").length,
			inactiveRules: rules.filter((rule) => rule.status === "inactive").length,
			discountRules: rules.filter((rule) =>
				[
					"percentage_discount",
					"fixed_discount",
					"early_bird",
					"last_minute",
					"los_discount",
				].includes(rule.kind)
			).length,
			overrideRules: rules.filter((rule) => rule.kind === "manual_override").length,
			ratePlansWithRules,
		},
	}
}
