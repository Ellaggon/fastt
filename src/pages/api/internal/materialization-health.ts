import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import {
	buildInventoryCalendarSurface,
	buildPricingCalendarSurface,
} from "@/lib/rates/calendarSurfaces"
import { loadRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { resolvePolicyDateRange } from "@/modules/policies/public"
import {
	evaluateMaterializationReadiness,
	type MaterializationFreshness,
	type MaterializationReadiness,
	type MaterializationReadinessIssue,
} from "@/lib/rates/materializationFreshness"

function stateRank(state: MaterializationFreshness["state"]): number {
	if (state === "missing") return 3
	if (state === "stale") return 2
	if (state === "delayed") return 1
	return 0
}

function statusFrom(items: MaterializationFreshness[]): "healthy" | "degraded" | "stale" {
	const worst = Math.max(...items.map((item) => stateRank(item.state)), 0)
	if (worst >= 2) return "stale"
	if (worst === 1) return "degraded"
	return "healthy"
}

function compact(item: MaterializationFreshness) {
	return {
		label: item.label,
		state: item.state,
		lastMaterializedAt: item.lastMaterializedAt,
		ageMinutes: item.ageMinutes,
		coveragePercent: item.coveragePercent,
		coveredRows: item.coveredRows,
		expectedRows: item.expectedRows,
		missingRows: item.missingRows,
		summary: item.summary,
	}
}

function compactReadiness(readiness: MaterializationReadiness) {
	return {
		status: readiness.status,
		statusLabel: readiness.statusLabel,
		score: readiness.score,
		summary: readiness.summary,
		coveragePercent: readiness.coveragePercent,
		totalExpectedRows: readiness.totalExpectedRows,
		totalCoveredRows: readiness.totalCoveredRows,
		totalMissingRows: readiness.totalMissingRows,
		issues: uniqueIssues(readiness.issues),
	}
}

function uniqueIssues(issues: MaterializationReadinessIssue[]): MaterializationReadinessIssue[] {
	const byKey = new Map<string, MaterializationReadinessIssue>()
	for (const issue of issues) {
		const key = `${issue.code}:${issue.label}:${issue.message}`
		if (!byKey.has(key)) byKey.set(key, issue)
	}
	return [...byKey.values()]
}

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireProvider(request).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (auth instanceof Response) return auth

	const { checkIn, checkOut } = resolvePolicyDateRange(url)
	const rows = await loadRatePlansReadModel({
		request,
		checkIn,
		checkOut,
		channel: "web",
	})
	const month = url.searchParams.get("month")
	const pricing = await buildPricingCalendarSurface({
		rows,
		ratePlanId: url.searchParams.get("ratePlanId"),
		month,
	})
	const inventory = await buildInventoryCalendarSurface({
		rows,
		variantId: url.searchParams.get("variantId"),
		month,
	})
	const items = [
		pricing.freshness.pricing,
		pricing.freshness.restrictions,
		pricing.freshness.search,
		inventory.freshness.availability,
		inventory.freshness.restrictions,
		inventory.freshness.search,
	]
	const degraded = items.filter((item) => item.state !== "fresh")
	const pricingItems = [
		pricing.freshness.pricing,
		pricing.freshness.restrictions,
		pricing.freshness.search,
	]
	const inventoryItems = [
		inventory.freshness.availability,
		inventory.freshness.restrictions,
		inventory.freshness.search,
	]
	const readiness = evaluateMaterializationReadiness(items)
	const pricingReadiness = evaluateMaterializationReadiness(pricingItems)
	const inventoryReadiness = evaluateMaterializationReadiness(inventoryItems)
	const diagnosticIssues = uniqueIssues(readiness.issues)

	return new Response(
		JSON.stringify({
			ok: true,
			status: statusFrom(items),
			readiness: compactReadiness(readiness),
			generatedAt: new Date().toISOString(),
			scope: {
				month: pricing.month,
				from: pricing.startDate,
				to: pricing.endDate,
				ratePlanId: pricing.selectedRatePlan?.ratePlanId ?? null,
				variantId: inventory.selectedVariant?.variantId ?? null,
			},
			surfaces: {
				pricing: {
					status: statusFrom(pricingItems),
					readiness: compactReadiness(pricingReadiness),
					overall: compact(pricing.freshness.overall),
					materializations: {
						pricing: compact(pricing.freshness.pricing),
						restrictions: compact(pricing.freshness.restrictions),
						search: compact(pricing.freshness.search),
					},
				},
				inventory: {
					status: statusFrom(inventoryItems),
					readiness: compactReadiness(inventoryReadiness),
					overall: compact(inventory.freshness.overall),
					materializations: {
						availability: compact(inventory.freshness.availability),
						restrictions: compact(inventory.freshness.restrictions),
						search: compact(inventory.freshness.search),
					},
				},
			},
			diagnostics: {
				coverage: {
					expectedRows: readiness.totalExpectedRows,
					coveredRows: readiness.totalCoveredRows,
					missingRows: readiness.totalMissingRows,
					coveragePercent: readiness.coveragePercent,
				},
				critical: diagnosticIssues.filter((issue) => issue.severity === "critical"),
				warnings: diagnosticIssues.filter((issue) => issue.severity === "warning"),
				supportHint:
					readiness.status === "ready"
						? "Las materializaciones del rango estan listas."
						: "Revisar materializaciones stale, faltantes o con cobertura parcial antes de confiar en el rango.",
			},
			degraded: degraded.map(compact),
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
