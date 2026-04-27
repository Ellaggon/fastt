import type { APIRoute } from "astro"
import {
	and,
	db,
	DailyInventory,
	EffectiveAvailability,
	eq,
	inArray,
	Product,
	sql,
	Variant,
} from "astro:db"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

type VariantAudit = {
	variantId: string
	productId: string
	name: string
	dailyDays: number
	effectiveDays: number
	coverageGaps: number
	consistencyIssues: number
	sellableDays: number
	lastRecomputeAt: string | null
	status: "SELLABLE" | "NOT_READY"
	alerts: string[]
}

export const GET: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const endpointName = "inventory-audit"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variants = await db
			.select({
				variantId: Variant.id,
				productId: Variant.productId,
				name: Variant.name,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(Product.providerId, providerId))
			.all()

		if (variants.length === 0) {
			logEndpoint()
			return new Response(
				JSON.stringify({
					generatedAt: new Date().toISOString(),
					summary: {
						totalVariants: 0,
						sellableVariants: 0,
						notReadyVariants: 0,
						totalCoverageGaps: 0,
						totalConsistencyIssues: 0,
					},
					variants: [] as VariantAudit[],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		}

		const variantIds = variants.map((row) => String(row.variantId))

		const [dailyCounts, effectiveStats, gapCounts, consistencyCounts] = await Promise.all([
			db
				.select({
					variantId: DailyInventory.variantId,
					dailyDays: sql<number>`count(*)`,
				})
				.from(DailyInventory)
				.where(inArray(DailyInventory.variantId, variantIds))
				.groupBy(DailyInventory.variantId)
				.all(),
			db
				.select({
					variantId: EffectiveAvailability.variantId,
					effectiveDays: sql<number>`count(*)`,
					sellableDays: sql<number>`sum(case when ${EffectiveAvailability.isSellable} = 1 then 1 else 0 end)`,
					lastRecomputeAt: sql<string | null>`max(${EffectiveAvailability.computedAt})`,
				})
				.from(EffectiveAvailability)
				.where(inArray(EffectiveAvailability.variantId, variantIds))
				.groupBy(EffectiveAvailability.variantId)
				.all(),
			db
				.select({
					variantId: DailyInventory.variantId,
					coverageGaps: sql<number>`sum(case when ${EffectiveAvailability.id} is null then 1 else 0 end)`,
				})
				.from(DailyInventory)
				.leftJoin(
					EffectiveAvailability,
					and(
						eq(EffectiveAvailability.variantId, DailyInventory.variantId),
						eq(EffectiveAvailability.date, DailyInventory.date)
					)
				)
				.where(inArray(DailyInventory.variantId, variantIds))
				.groupBy(DailyInventory.variantId)
				.all(),
			db
				.select({
					variantId: EffectiveAvailability.variantId,
					consistencyIssues: sql<number>`sum(case when (${EffectiveAvailability.availableUnits} + ${EffectiveAvailability.heldUnits} + ${EffectiveAvailability.bookedUnits}) <> ${EffectiveAvailability.totalUnits} then 1 else 0 end)`,
				})
				.from(EffectiveAvailability)
				.where(inArray(EffectiveAvailability.variantId, variantIds))
				.groupBy(EffectiveAvailability.variantId)
				.all(),
		])

		const dailyByVariant = new Map(
			dailyCounts.map((row) => [String(row.variantId), Number(row.dailyDays ?? 0)])
		)
		const effectiveByVariant = new Map(
			effectiveStats.map((row) => [
				String(row.variantId),
				{
					effectiveDays: Number(row.effectiveDays ?? 0),
					sellableDays: Number(row.sellableDays ?? 0),
					lastRecomputeAt: row.lastRecomputeAt ? String(row.lastRecomputeAt) : null,
				},
			])
		)
		const gapsByVariant = new Map(
			gapCounts.map((row) => [String(row.variantId), Number(row.coverageGaps ?? 0)])
		)
		const consistencyByVariant = new Map(
			consistencyCounts.map((row) => [String(row.variantId), Number(row.consistencyIssues ?? 0)])
		)

		const variantAudit: VariantAudit[] = variants.map((variant) => {
			const variantId = String(variant.variantId)
			const dailyDays = Number(dailyByVariant.get(variantId) ?? 0)
			const effective = effectiveByVariant.get(variantId)
			const effectiveDays = Number(effective?.effectiveDays ?? 0)
			const sellableDays = Number(effective?.sellableDays ?? 0)
			const coverageGaps = Number(gapsByVariant.get(variantId) ?? dailyDays)
			const consistencyIssues = Number(consistencyByVariant.get(variantId) ?? 0)

			const alerts: string[] = []
			if (dailyDays === 0) alerts.push("No DailyInventory generado")
			if (coverageGaps > 0) alerts.push(`Faltan ${coverageGaps} día(s) en EffectiveAvailability`)
			if (consistencyIssues > 0) alerts.push(`${consistencyIssues} día(s) con desbalance`)
			if (effectiveDays > 0 && sellableDays === 0) alerts.push("Sin días vendibles")

			const status: "SELLABLE" | "NOT_READY" =
				dailyDays > 0 && coverageGaps === 0 && consistencyIssues === 0 && sellableDays > 0
					? "SELLABLE"
					: "NOT_READY"

			return {
				variantId,
				productId: String(variant.productId),
				name: String(variant.name ?? ""),
				dailyDays,
				effectiveDays,
				coverageGaps,
				consistencyIssues,
				sellableDays,
				lastRecomputeAt: effective?.lastRecomputeAt ?? null,
				status,
				alerts,
			}
		})

		const summary = {
			totalVariants: variantAudit.length,
			sellableVariants: variantAudit.filter((row) => row.status === "SELLABLE").length,
			notReadyVariants: variantAudit.filter((row) => row.status === "NOT_READY").length,
			totalCoverageGaps: variantAudit.reduce((sum, row) => sum + row.coverageGaps, 0),
			totalConsistencyIssues: variantAudit.reduce((sum, row) => sum + row.consistencyIssues, 0),
		}

		logEndpoint()
		return new Response(
			JSON.stringify({
				generatedAt: new Date().toISOString(),
				summary,
				variants: variantAudit,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error) {
		logEndpoint()
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
