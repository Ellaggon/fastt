import { resolveTourPlaybookContext } from "@/lib/playbook/tour-playbook-context"
import { preparationPathContext, PreparationSessionError } from "./preparationSessionContext"
import { loadTourCommercialContext } from "@/lib/tours/loadTourCommercialContext"
import {
	tourContextSelectionHref,
	withTourCommercialContext,
} from "@/lib/tours/resolveTourCommercialContext"
import { LAUNCH_STEPS, buildPlaybookHref } from "@/lib/playbook/launch-accommodation"
import {
	TOUR_LAUNCH_STEPS,
	buildTourPlaybookHref,
	normalizeTourLaunchStep,
} from "@/lib/playbook/launch-tour"
import {
	buildCompleteToPublishHref,
	completeToPublishStepHref,
	normalizeCompleteToPublishStep,
} from "@/lib/playbook/complete-to-publish"
import {
	and,
	db,
	desc,
	eq,
	Product,
	Variant,
	RatePlan,
	sql,
	first,
	ProviderPreparationSession,
} from "@/shared/infrastructure/db/compat"

export type PreparationPlaybookId = "launch" | "launch-tour" | "complete-to-publish"
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
	navigationAt?: Date
}

export function isPreparationPlaybookId(value: unknown): value is PreparationPlaybookId {
	return value === "launch" || value === "launch-tour" || value === "complete-to-publish"
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
	const parsed = preparationPathContext(input)
	if (input.vertical === "tour") {
		const tour = resolveTourPlaybookContext(parsed.url, input.productId)
		if (tour) {
			input = {
				...input,
				playbookId: tour.playbookId,
				stepId:
					tour.part === "prepare"
						? (normalizeTourLaunchStep(input.stepId) ?? input.stepId)
						: (normalizeCompleteToPublishStep(input.stepId) ?? input.stepId),
			}
			parsed.url = tour.canonical
		}
	}
	const validStep =
		input.playbookId === "complete-to-publish"
			? normalizeCompleteToPublishStep(input.stepId) === input.stepId
			: (input.playbookId === "launch-tour" ? TOUR_LAUNCH_STEPS : LAUNCH_STEPS).some(
					(step) => step.id === input.stepId
				)
	if (!validStep) throw new PreparationSessionError("invalid_preparation_step")
	const navigationAt = input.navigationAt ?? new Date()
	if (!Number.isFinite(navigationAt.getTime()) || navigationAt.getTime() > Date.now() + 60_000)
		throw new PreparationSessionError("invalid_navigation_time")
	return db.transaction(async (tx) => {
		// Publication and session writes share a product lock; navigation also orders both playbooks.
		if (input.vertical === "tour")
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.providerId, input.productId, "tour-publication"])}, 0))`
			)
		await tx.execute(
			sql`SELECT set_config('fastt.preparation_write_version', '2', true), pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.providerId, input.userId, input.productId, input.vertical === "tour" ? "tour-flow" : input.playbookId])}, 0))`
		)
		const product = await tx
			.select({ productType: Product.productType })
			.from(Product)
			.where(and(eq(Product.id, input.productId), eq(Product.providerId, input.providerId)))
			.then(first)
		if (!product) throw new PreparationSessionError("product_not_found", 404)
		const productType = String(product.productType).toLowerCase()
		if (!["tour", "hotel", "whole_home"].includes(productType))
			throw new PreparationSessionError("preparation_vertical_mismatch")
		const isTour = productType === "tour"
		if (
			(isTour ? "tour" : "hotel") !== input.vertical ||
			(isTour && input.playbookId === "launch") ||
			(!isTour && input.playbookId === "launch-tour")
		)
			throw new PreparationSessionError("preparation_vertical_mismatch")
		const key = and(
			eq(ProviderPreparationSession.providerId, input.providerId),
			eq(ProviderPreparationSession.userId, input.userId),
			eq(ProviderPreparationSession.productId, input.productId),
			eq(ProviderPreparationSession.playbookId, input.playbookId)
		)
		const existing = await tx.select().from(ProviderPreparationSession).where(key).then(first)
		if (isTour) {
			const latest = await tx
				.select()
				.from(ProviderPreparationSession)
				.where(
					and(
						eq(ProviderPreparationSession.providerId, input.providerId),
						eq(ProviderPreparationSession.userId, input.userId),
						eq(ProviderPreparationSession.productId, input.productId),
						eq(ProviderPreparationSession.vertical, "tour")
					)
				)
				.orderBy(desc(ProviderPreparationSession.updatedAt))
				.limit(1)
				.then(first)
			if (
				latest &&
				(new Date(latest.updatedAt).getTime() > navigationAt.getTime() ||
					(latest.playbookId !== input.playbookId &&
						new Date(latest.updatedAt).getTime() === navigationAt.getTime()))
			)
				return latest.id
			const published = await tx
				.select({ status: Product.publicationState })
				.from(Product)
				.where(eq(Product.id, input.productId))
				.then(first)
			if (published?.status === "published") return existing?.id ?? null
		}
		// An old pagehide or a delayed request cannot overwrite a newer navigation.
		let variantId = parsed.explicitSelection ? parsed.variantId : (existing?.variantId ?? null)
		let ratePlanId = parsed.explicitSelection ? parsed.ratePlanId : (existing?.ratePlanId ?? null)
		if (ratePlanId) {
			const rate = await tx
				.select({ variantId: RatePlan.variantId })
				.from(RatePlan)
				.where(eq(RatePlan.id, ratePlanId))
				.then(first)
			if (!rate || (variantId && variantId !== rate.variantId))
				throw new PreparationSessionError("preparation_rate_mismatch")
			variantId = rate.variantId
		}
		if (variantId) {
			const variant = await tx
				.select({ id: Variant.id, kind: Variant.kind })
				.from(Variant)
				.where(and(eq(Variant.id, variantId), eq(Variant.productId, input.productId)))
				.then(first)
			if (!variant || (isTour && variant.kind !== "tour_slot"))
				throw new PreparationSessionError("preparation_variant_mismatch")
		}
		if (existing && new Date(existing.updatedAt).getTime() > navigationAt.getTime())
			return existing.id
		// Normalize legacy playbook query values only after validating the real product.
		parsed.url.searchParams.set("playbook", input.playbookId)
		parsed.url.searchParams.set("step", input.stepId)
		if (variantId) parsed.url.searchParams.set("variantId", variantId)
		else parsed.url.searchParams.delete("variantId")
		if (ratePlanId) parsed.url.searchParams.set("ratePlanId", ratePlanId)
		else parsed.url.searchParams.delete("ratePlanId")
		const values = {
			vertical: input.vertical,
			writeVersion: 2,
			stepId: input.stepId,
			variantId,
			ratePlanId,
			lastPath: `${parsed.url.pathname}${parsed.url.search}`,
			status: "active" as const,
			updatedAt: navigationAt,
		}
		const rows = await tx
			.insert(ProviderPreparationSession)
			.values({
				id: crypto.randomUUID(),
				providerId: input.providerId,
				userId: input.userId,
				productId: input.productId,
				playbookId: input.playbookId,
				...values,
			})
			.onConflictDoUpdate({
				target: [
					ProviderPreparationSession.providerId,
					ProviderPreparationSession.userId,
					ProviderPreparationSession.productId,
					ProviderPreparationSession.playbookId,
				],
				set: values,
			})
			.returning({ id: ProviderPreparationSession.id })
		return rows[0].id
	})
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
	userId: string,
	options: { vertical?: PreparationVertical; limit?: number } = {}
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
			publicationState: Product.publicationState,
		})
		.from(ProviderPreparationSession)
		.innerJoin(Product, eq(Product.id, ProviderPreparationSession.productId))
		.where(
			and(
				eq(ProviderPreparationSession.providerId, providerId),
				eq(ProviderPreparationSession.userId, userId),
				eq(ProviderPreparationSession.status, "active"),
				eq(Product.providerId, providerId)
			)
		)
		.orderBy(desc(ProviderPreparationSession.updatedAt))

	const seenTours = new Set<string>()
	const currentRows = rows.filter((row) => {
		if (options.vertical && row.vertical !== options.vertical) return false
		if (row.vertical !== "tour" || !row.productId) return true
		if (row.publicationState === "published") return false
		if (seenTours.has(row.productId)) return false
		seenTours.add(row.productId)
		return true
	})
	const resumes = await Promise.all(
		currentRows.slice(0, options.limit ?? currentRows.length).map(async (row) => {
			if (!row.productId || !isPreparationPlaybookId(row.playbookId)) return []
			if (!isPreparationVertical(row.vertical)) return []
			let savedPath = normalizePreparationPath(row.lastPath)
			if (savedPath) {
				try {
					preparationPathContext({
						productId: row.productId,
						lastPath: savedPath,
						variantId: row.variantId,
						ratePlanId: row.ratePlanId,
					})
				} catch {
					savedPath = null
				}
			}
			if (savedPath && row.playbookId === "complete-to-publish") {
				const url = new URL(savedPath, "http://fastt.local")
				if (
					!url.searchParams.get("variantId")?.trim() &&
					!url.searchParams.get("ratePlanId")?.trim()
				) {
					if (row.variantId) url.searchParams.set("variantId", row.variantId)
					if (row.ratePlanId) url.searchParams.set("ratePlanId", row.ratePlanId)
					savedPath = `${url.pathname}${url.search}`
				}
			}
			const fallback =
				row.playbookId === "launch-tour"
					? buildTourPlaybookHref(
							`/product/${encodeURIComponent(row.productId)}/content`,
							"content"
						)
					: row.playbookId === "complete-to-publish"
						? buildCompleteToPublishHref(
								completeToPublishStepHref(
									row.productId,
									normalizeCompleteToPublishStep(row.stepId) ?? "content",
									{ variantId: row.variantId, ratePlanId: row.ratePlanId }
								),
								normalizeCompleteToPublishStep(row.stepId) ?? "content"
							)
						: buildPlaybookHref(`/product/${encodeURIComponent(row.productId)}/content`, "content")
			let href = savedPath ?? fallback
			if (row.vertical === "tour") {
				const tour = resolveTourPlaybookContext(new URL(href, "http://fastt.local"), row.productId)
				if (tour) href = tour.canonical.pathname + tour.canonical.search
				const context = await loadTourCommercialContext({
					providerId,
					productId: row.productId,
					userId,
					url: new URL(href, "http://fastt.local"),
				})
				if (context.status === "not_found" || context.status === "not_tour") return []
				if ("options" in context) {
					href =
						context.status === "unresolved" &&
						["invalid_selection", "selection_required"].includes(context.reason)
							? tourContextSelectionHref(context, href)
							: withTourCommercialContext(href, context)
				}
			}
			return [
				{
					productId: row.productId,
					vertical: row.vertical,
					productName: String(row.productName || "Servicio sin nombre"),
					href,
					stepId: String(row.stepId || "content"),
				},
			]
		})
	)
	return resumes.flat()
}

export function savedCompleteToPublishHrefForProduct(
	productId: string,
	sessions: readonly PreparationResume[]
): string | null {
	const match = sessions.find((session) => {
		if (session.productId !== productId) return false
		const href = String(session.href ?? "")
		return href.includes("playbook=complete-to-publish") || href.includes("flow=complete")
	})
	return match?.href ?? null
}

/** Publication closes both sessions; subsequent visits cannot reopen a published tour. */
export async function completeTourPreparationSessions(providerId: string, productId: string) {
	await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('fastt.preparation_write_version', '2', true), pg_advisory_xact_lock(hashtextextended(${JSON.stringify([providerId, productId, "tour-publication"])}, 0))`
		)
		await tx
			.update(ProviderPreparationSession)
			.set({ status: "completed", writeVersion: 2 })
			.where(
				and(
					eq(ProviderPreparationSession.providerId, providerId),
					eq(ProviderPreparationSession.productId, productId),
					eq(ProviderPreparationSession.vertical, "tour")
				)
			)
	})
}
