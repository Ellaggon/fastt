import { buildPlaybookHref } from "@/lib/playbook/launch-accommodation"
import { buildTourPlaybookHref } from "@/lib/playbook/launch-tour"
import {
	and,
	db,
	desc,
	eq,
	Product,
	ProviderPreparationSession,
} from "@/shared/infrastructure/db/compat"

export type PreparationPlaybookId = "launch" | "launch-tour"
export type PreparationVertical = "hotel" | "tour"

export type PreparationSessionInput = {
	providerId: string
	userId: string
	productId: string
	playbookId: PreparationPlaybookId
	vertical: PreparationVertical
	stepId: string
	variantId?: string | null
	ratePlanId?: string | null
	lastPath: string
}

export function isPreparationPlaybookId(value: unknown): value is PreparationPlaybookId {
	return value === "launch" || value === "launch-tour"
}

export function isPreparationVertical(value: unknown): value is PreparationVertical {
	return value === "hotel" || value === "tour"
}

export function normalizePreparationPath(value: unknown): string | null {
	const path = String(value ?? "").trim()
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return null
	const url = new URL(path, "http://fastt.local")
	if (!url.pathname.startsWith("/product/") && !url.pathname.startsWith("/rates/")) return null
	return `${url.pathname}${url.search}`
}

export async function savePreparationSession(input: PreparationSessionInput) {
	const existing = await db
		.select({ id: ProviderPreparationSession.id })
		.from(ProviderPreparationSession)
		.where(
			and(
				eq(ProviderPreparationSession.providerId, input.providerId),
				eq(ProviderPreparationSession.userId, input.userId),
				eq(ProviderPreparationSession.playbookId, input.playbookId)
			)
		)
		.limit(1)

	const values = {
		productId: input.productId,
		vertical: input.vertical,
		stepId: input.stepId,
		variantId: input.variantId || null,
		ratePlanId: input.ratePlanId || null,
		lastPath: input.lastPath,
		status: "active" as const,
		updatedAt: new Date(),
	}
	if (existing[0]?.id) {
		await db
			.update(ProviderPreparationSession)
			.set(values)
			.where(eq(ProviderPreparationSession.id, existing[0].id))
		return existing[0].id
	}

	const id = crypto.randomUUID()
	await db.insert(ProviderPreparationSession).values({
		id,
		providerId: input.providerId,
		userId: input.userId,
		playbookId: input.playbookId,
		...values,
	})
	return id
}

export type PreparationResume = {
	productId: string
	vertical: PreparationVertical
	productName: string
	href: string
	stepId: string
}

export async function listActivePreparationSessions(
	providerId: string,
	userId: string
): Promise<PreparationResume[]> {
	const rows = await db
		.select({
			productId: ProviderPreparationSession.productId,
			playbookId: ProviderPreparationSession.playbookId,
			vertical: ProviderPreparationSession.vertical,
			stepId: ProviderPreparationSession.stepId,
			variantId: ProviderPreparationSession.variantId,
			ratePlanId: ProviderPreparationSession.ratePlanId,
			lastPath: ProviderPreparationSession.lastPath,
			productName: Product.name,
		})
		.from(ProviderPreparationSession)
		.innerJoin(Product, eq(Product.id, ProviderPreparationSession.productId))
		.where(
			and(
				eq(ProviderPreparationSession.providerId, providerId),
				eq(ProviderPreparationSession.userId, userId),
				eq(ProviderPreparationSession.status, "active")
			)
		)
		.orderBy(desc(ProviderPreparationSession.updatedAt))

	return rows.flatMap((row) => {
		if (!row.productId || !isPreparationPlaybookId(row.playbookId)) return []
		if (!isPreparationVertical(row.vertical)) return []
		const savedPath = normalizePreparationPath(row.lastPath)
		const fallback =
			row.playbookId === "launch-tour"
				? buildTourPlaybookHref(`/product/${encodeURIComponent(row.productId)}/content`, "content")
				: buildPlaybookHref(`/product/${encodeURIComponent(row.productId)}/content`, "content")
		return [
			{
				productId: row.productId,
				vertical: row.vertical,
				productName: String(row.productName || "Servicio sin nombre"),
				href: savedPath ?? fallback,
				stepId: String(row.stepId || "content"),
			},
		]
	})
}
