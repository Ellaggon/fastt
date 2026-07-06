import { loadPricingAutomationSurface } from "@/lib/pricing/pricingAutomationSurface"
import { loadCancellationDateAssignments } from "@/lib/policies/loadCancellationDateAssignments"
import {
	applyCancellationDateAssignments,
	buildRatesMultiCalendarSurface,
	type MultiCalendarSurface,
} from "@/lib/rates/multiCalendarSurface"
import { loadRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { loadRestrictionsSurface } from "@/lib/rates/restrictionsSurface"

export type MultiCalendarAppliedRule = {
	id: string
	category: "price" | "sellability"
	categoryLabel: string
	type: string
	typeLabel: string
	value: number | null
	valueLabel: string
	startDate: string
	endDate: string
	isActive: boolean
	priority: number
	scope: "product" | "variant" | "rate_plan"
	scopeId: string
	ratePlanId: string
	variantId: string
	productId: string
	targetName: string
	contextName: string
	impactLabel: string
	validDays: number[]
	createdAt: string
	contextKey: string | null
}

export type MultiCalendarWorkspace = {
	surface: MultiCalendarSurface
	appliedRules: MultiCalendarAppliedRule[]
}

export async function loadMultiCalendarWorkspace(input: {
	request: Request
	providerId: string
	url: URL
	ratePlanIds?: string[]
}): Promise<MultiCalendarWorkspace> {
	const allRows = await loadRatePlansReadModel({ request: input.request, channel: "web" })
	const requestedIds = new Set((input.ratePlanIds ?? []).filter(Boolean))
	const rows = requestedIds.size
		? allRows.filter((row) => requestedIds.has(String(row.ratePlanId)))
		: allRows

	const baseSurface = await buildRatesMultiCalendarSurface({ rows, url: input.url })
	const cancellationDateAssignments = await loadCancellationDateAssignments({
		ratePlanIds: rows.map((row) => String(row.ratePlanId)),
		from: baseSurface.startDate,
		to: baseSurface.endDate,
	})
	const [sellabilitySurface, pricingAutomationSurface] = await Promise.all([
		loadRestrictionsSurface(input.providerId, { status: "all" }),
		loadPricingAutomationSurface(input.providerId),
	])
	const surface = applyCancellationDateAssignments(baseSurface, cancellationDateAssignments)

	const appliedRules: MultiCalendarAppliedRule[] = [
		...pricingAutomationSurface.rules.map((rule) => ({
			id: rule.id,
			category: "price" as const,
			categoryLabel: "Precio",
			type: rule.type,
			typeLabel: rule.kindLabel,
			value: rule.value,
			valueLabel: rule.valueLabel,
			startDate: rule.dateFrom ?? "",
			endDate: rule.dateTo ?? "",
			isActive: rule.status === "active",
			priority: rule.priority,
			scope: "rate_plan" as const,
			scopeId: rule.ratePlanId,
			ratePlanId: rule.ratePlanId,
			variantId: "",
			productId: "",
			targetName: rule.ratePlanName,
			contextName: `${rule.productName} · ${rule.variantName}`,
			impactLabel: rule.summary,
			validDays: [],
			createdAt: rule.createdAt.toISOString(),
			contextKey: rule.contextKey,
		})),
		...sellabilitySurface.rules.map((rule) => ({
			id: rule.id,
			category: "sellability" as const,
			categoryLabel: rule.category,
			type: rule.type,
			typeLabel: rule.typeLabel,
			value: rule.value,
			valueLabel: rule.valueLabel,
			startDate: rule.startDate,
			endDate: rule.endDate,
			isActive: rule.isActive,
			priority: rule.priority,
			scope: rule.scope,
			scopeId: rule.scopeId,
			ratePlanId: rule.ratePlanId ?? "",
			variantId: rule.variantId ?? "",
			productId: rule.productId,
			targetName: rule.targetName,
			contextName: [rule.productName, rule.variantName].filter(Boolean).join(" · "),
			impactLabel: rule.impactLabel,
			validDays: rule.validDays,
			createdAt: rule.createdAt.toISOString(),
			contextKey: null,
		})),
	]

	return { surface, appliedRules }
}
