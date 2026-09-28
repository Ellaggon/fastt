import { normalizeProductVertical } from "@/lib/catalog/productVerticalRegistry"
import { and, db, eq, ProviderCommercialLine } from "@/shared/infrastructure/db/compat"

export const commercialLines = ["lodging", "tour"] as const
export type CommercialLine = (typeof commercialLines)[number]
export const commercialLineCollectionModels = [
	"undecided",
	"property_collect",
	"platform_collect",
] as const
export type CommercialLineCollectionModel = (typeof commercialLineCollectionModels)[number]
export const commercialLineSources = ["onboarding", "product", "admin"] as const
export type CommercialLineSource = (typeof commercialLineSources)[number]

export type CommercialLineRecord = {
	id: string
	providerId: string
	line: CommercialLine
	source: CommercialLineSource
	collectionModel: CommercialLineCollectionModel
	collectionDeclaredByUserId: string | null
	collectionDeclaredAt: Date | null
	originProductId: string | null
	enrolledByUserId: string | null
	enrolledAt: Date
}

const lineOrder: CommercialLine[] = ["lodging", "tour"]

function isMissingLineTable(error: unknown) {
	return String(error).includes('relation "ProviderCommercialLine" does not exist')
}

export function commercialLineForProductType(value: unknown): CommercialLine | null {
	const vertical = normalizeProductVertical(value)
	if (vertical === "tour") return "tour"
	if (vertical === "hotel" || vertical === "rental") return "lodging"
	return null
}

export function commercialLineForOnboardingVertical(value: unknown): CommercialLine | null {
	const vertical = String(value ?? "")
		.trim()
		.toLowerCase()
	if (vertical === "tour") return "tour"
	if (
		vertical === "hotel" ||
		vertical === "lodging" ||
		vertical === "whole_home" ||
		vertical === "rental" ||
		vertical === "alojamiento"
	) {
		return "lodging"
	}
	return null
}

/** Reads a normalized onboarding destination. A cookie is not an input. */
export function commercialLineFromOnboardingDestination(
	destination: string
): CommercialLine | null {
	let url: URL
	try {
		url = new URL(destination, "http://fastt.local")
	} catch {
		return null
	}
	const fromQuery = commercialLineForOnboardingVertical(
		url.searchParams.get("vertical") ?? url.searchParams.get("type")
	)
	if (fromQuery) return fromQuery
	if (url.searchParams.get("playbook") === "launch-tour") return "tour"
	if (url.searchParams.get("playbook") === "launch") return "lodging"
	return null
}

export function commercialLinesForProductTypes(productTypes: readonly unknown[]): CommercialLine[] {
	const lines = new Set<CommercialLine>()
	for (const productType of productTypes) {
		const line = commercialLineForProductType(productType)
		if (line) lines.add(line)
	}
	return sortCommercialLines([...lines])
}

export function sortCommercialLines(lines: readonly CommercialLine[]): CommercialLine[] {
	return lineOrder.filter((line) => lines.includes(line))
}

/**
 * Removing products does not remove the account line. Callers keep the
 * enrollment even when the product list for that line becomes empty.
 */
export function linesAfterRemovingProducts<T extends { line: CommercialLine }>(
	lines: readonly T[]
): T[] {
	return [...lines]
}

function record(row: typeof ProviderCommercialLine.$inferSelect): CommercialLineRecord {
	return {
		id: row.id,
		providerId: row.providerId,
		line: row.line as CommercialLine,
		source: row.source as CommercialLineSource,
		collectionModel: row.collectionModel as CommercialLineCollectionModel,
		collectionDeclaredByUserId: row.collectionDeclaredByUserId,
		collectionDeclaredAt: row.collectionDeclaredAt,
		originProductId: row.originProductId,
		enrolledByUserId: row.enrolledByUserId,
		enrolledAt: row.enrolledAt,
	}
}

/** A missing or unassigned line never inherits the account or another line's model. */
export function collectionModelForCommercialLine(
	lines: readonly CommercialLineRecord[],
	line: CommercialLine | null | undefined
): CommercialLineCollectionModel {
	return lines.find((entry) => entry.line === line)?.collectionModel ?? "undecided"
}

async function selectProviderCommercialLines(providerId: string): Promise<CommercialLineRecord[]> {
	const rows = await db
		.select()
		.from(ProviderCommercialLine)
		.where(eq(ProviderCommercialLine.providerId, providerId))
	return sortCommercialLines(rows.map((row) => row.line as CommercialLine))
		.map((line) => rows.find((row) => row.line === line))
		.filter((row): row is NonNullable<typeof row> => Boolean(row))
		.map(record)
}

export async function listProviderCommercialLines(
	providerId: string
): Promise<CommercialLineRecord[]> {
	try {
		return await selectProviderCommercialLines(providerId)
	} catch (error) {
		if (isMissingLineTable(error)) return []
		throw error
	}
}

/**
 * Distinguishes a missing table from an account that simply has no lines.
 * The resolver keeps today's document list until the table exists.
 */
export async function readProviderCommercialLineState(providerId: string): Promise<{
	available: boolean
	lines: CommercialLineRecord[]
}> {
	try {
		return { available: true, lines: await selectProviderCommercialLines(providerId) }
	} catch (error) {
		if (isMissingLineTable(error)) return { available: false, lines: [] }
		throw error
	}
}

/**
 * Inserts a line once. A later product, onboarding step or admin action does
 * not replace the original source and cannot delete the row.
 */
export async function enrollProviderCommercialLine(params: {
	providerId: string
	line: CommercialLine
	source: CommercialLineSource
	originProductId?: string | null
	enrolledByUserId?: string | null
	required?: boolean
}): Promise<CommercialLineRecord | null> {
	try {
		const inserted = await db
			.insert(ProviderCommercialLine)
			.values({
				id: crypto.randomUUID(),
				providerId: params.providerId,
				line: params.line,
				source: params.source,
				originProductId: params.originProductId ?? null,
				enrolledByUserId: params.enrolledByUserId ?? null,
			})
			.onConflictDoNothing({
				target: [ProviderCommercialLine.providerId, ProviderCommercialLine.line],
			})
			.returning({ id: ProviderCommercialLine.id })
		const row = await db
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, params.providerId),
					eq(ProviderCommercialLine.line, params.line)
				)
			)
			.then((rows) => rows[0] ?? null)
		if (!row) return null
		if (inserted.length === 0) return record(row)
		return record(row)
	} catch (error) {
		if (isMissingLineTable(error)) {
			if (params.required) throw new Error("COMMERCIAL_LINE_STORAGE_MIGRATION_REQUIRED")
			return null
		}
		throw error
	}
}

export async function declareProviderCommercialLineCollectionModel(params: {
	providerId: string
	line: CommercialLine
	collectionModel: CommercialLineCollectionModel
	declaredByUserId: string
}): Promise<CommercialLineRecord | null> {
	if (!commercialLineCollectionModels.includes(params.collectionModel)) {
		throw new Error("COMMERCIAL_LINE_COLLECTION_MODEL_INVALID")
	}
	try {
		const updated = await db
			.update(ProviderCommercialLine)
			.set({
				collectionModel: params.collectionModel,
				collectionDeclaredByUserId: params.declaredByUserId,
				collectionDeclaredAt: new Date(),
			})
			.where(
				and(
					eq(ProviderCommercialLine.providerId, params.providerId),
					eq(ProviderCommercialLine.line, params.line)
				)
			)
			.returning()
		return updated[0] ? record(updated[0]) : null
	} catch (error) {
		if (isMissingLineTable(error)) throw new Error("COMMERCIAL_LINE_STORAGE_MIGRATION_REQUIRED")
		throw error
	}
}
