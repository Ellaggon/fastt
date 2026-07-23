import { desc, eq } from "drizzle-orm"

import { db, SearchMaterializationLog } from "@/shared/infrastructure/db/compat"

export type SearchMaterializationStatus = "running" | "completed" | "failed" | "partial"

export type SearchMaterializationLogInput = {
	runId: string
	trigger: string
	status: SearchMaterializationStatus
	variantId?: string | null
	productId?: string | null
	fromDate?: string | null
	toDate?: string | null
	horizonDays?: number | null
	currency?: string | null
	variantsScanned?: number | null
	rowsMaterialized?: number | null
	purgedRows?: number | null
	durationMs?: number | null
	errorMessage?: string | null
	metadataJson?: unknown
	startedAt?: Date
	finishedAt?: Date | null
}

function isMissingTableError(error: unknown): boolean {
	const code = (error as { code?: string } | null)?.code
	const message = error instanceof Error ? error.message : String(error)
	return code === "42P01" || message.includes("SearchMaterializationLog")
}

function asInt(value: number | null | undefined): number {
	const normalized = Number(value ?? 0)
	return Number.isFinite(normalized) ? Math.max(0, Math.trunc(normalized)) : 0
}

export async function recordSearchMaterializationLog(
	input: SearchMaterializationLogInput
): Promise<void> {
	try {
		await db
			.insert(SearchMaterializationLog)
			.values({
				id: input.runId,
				runId: input.runId,
				trigger: input.trigger,
				status: input.status,
				variantId: input.variantId ?? null,
				productId: input.productId ?? null,
				fromDate: input.fromDate ?? null,
				toDate: input.toDate ?? null,
				horizonDays:
					input.horizonDays == null ? null : Math.max(1, Math.trunc(Number(input.horizonDays))),
				currency: input.currency ?? null,
				variantsScanned: asInt(input.variantsScanned),
				rowsMaterialized: asInt(input.rowsMaterialized),
				purgedRows: asInt(input.purgedRows),
				durationMs:
					input.durationMs == null ? null : Math.max(0, Math.trunc(Number(input.durationMs))),
				errorMessage: input.errorMessage ?? null,
				metadataJson: input.metadataJson ?? null,
				startedAt: input.startedAt ?? new Date(),
				finishedAt: input.finishedAt ?? null,
			})
			.onConflictDoUpdate({
				target: SearchMaterializationLog.runId,
				set: {
					status: input.status,
					variantId: input.variantId ?? null,
					productId: input.productId ?? null,
					fromDate: input.fromDate ?? null,
					toDate: input.toDate ?? null,
					horizonDays:
						input.horizonDays == null ? null : Math.max(1, Math.trunc(Number(input.horizonDays))),
					currency: input.currency ?? null,
					variantsScanned: asInt(input.variantsScanned),
					rowsMaterialized: asInt(input.rowsMaterialized),
					purgedRows: asInt(input.purgedRows),
					durationMs:
						input.durationMs == null ? null : Math.max(0, Math.trunc(Number(input.durationMs))),
					errorMessage: input.errorMessage ?? null,
					metadataJson: input.metadataJson ?? null,
					finishedAt: input.finishedAt ?? null,
				},
			})
	} catch (error) {
		if (isMissingTableError(error)) return
		throw error
	}
}

export async function listRecentSearchMaterializationLogs(limit = 5) {
	try {
		return await db
			.select({
				runId: SearchMaterializationLog.runId,
				trigger: SearchMaterializationLog.trigger,
				status: SearchMaterializationLog.status,
				variantId: SearchMaterializationLog.variantId,
				productId: SearchMaterializationLog.productId,
				fromDate: SearchMaterializationLog.fromDate,
				toDate: SearchMaterializationLog.toDate,
				horizonDays: SearchMaterializationLog.horizonDays,
				currency: SearchMaterializationLog.currency,
				variantsScanned: SearchMaterializationLog.variantsScanned,
				rowsMaterialized: SearchMaterializationLog.rowsMaterialized,
				purgedRows: SearchMaterializationLog.purgedRows,
				durationMs: SearchMaterializationLog.durationMs,
				errorMessage: SearchMaterializationLog.errorMessage,
				startedAt: SearchMaterializationLog.startedAt,
				finishedAt: SearchMaterializationLog.finishedAt,
				createdAt: SearchMaterializationLog.createdAt,
			})
			.from(SearchMaterializationLog)
			.orderBy(desc(SearchMaterializationLog.createdAt))
			.limit(Math.max(1, Math.min(25, Math.trunc(limit))))
	} catch (error) {
		if (isMissingTableError(error)) return []
		throw error
	}
}

export async function getLatestSearchMaterializationLog() {
	const [row] = await listRecentSearchMaterializationLogs(1)
	return row ?? null
}

export async function getSearchMaterializationLogByRunId(runId: string) {
	try {
		const [row] = await db
			.select()
			.from(SearchMaterializationLog)
			.where(eq(SearchMaterializationLog.runId, runId))
			.limit(1)
		return row ?? null
	} catch (error) {
		if (isMissingTableError(error)) return null
		throw error
	}
}
