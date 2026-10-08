import {
	and,
	db,
	eq,
	ne,
	sql,
	Product,
	Variant,
	RatePlan,
	ProviderOptionPreparationSession,
	TourSlotProfile,
} from "@/shared/infrastructure/db/compat"
import {
	ADD_TOUR_OPTION,
	OPTION_STEPS,
	optionStep,
	optionWizardHref,
	type OptionStep,
} from "@/lib/playbook/add-tour-option"
import { PreparationSessionError, preparationPathContext } from "./preparationSessionContext"

export type OptionSession = typeof ProviderOptionPreparationSession.$inferSelect
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ownedKey = (providerId: string, userId: string, id: string) =>
	and(
		eq(ProviderOptionPreparationSession.id, id),
		eq(ProviderOptionPreparationSession.providerId, providerId),
		eq(ProviderOptionPreparationSession.userId, userId),
		eq(ProviderOptionPreparationSession.playbookId, ADD_TOUR_OPTION)
	)
export function sessionHref(session: OptionSession, step: OptionStep = optionStep(session.stepId)) {
	const href = optionWizardHref(
		{
			productId: session.productId!,
			sessionId: session.id,
			variantId: session.variantId,
			ratePlanId: session.ratePlanId,
		},
		step
	)
	const target = new URL(href, "http://fastt.local")
	if (
		step === optionStep(session.stepId) &&
		new URL(session.lastPath, "http://fastt.local").searchParams.get("optionReturn") === "review"
	)
		target.searchParams.set("optionReturn", "review")
	return target.pathname + target.search
}
export async function startOptionSession(
	providerId: string,
	userId: string,
	productId: string,
	id: string
) {
	if (!uuid.test(id)) throw new PreparationSessionError("invalid_session")
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('fastt.preparation_write_version','2',true)`)
		const [product] = await tx
			.select()
			.from(Product)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
		if (!product || product.productType.toLowerCase() !== "tour")
			throw new PreparationSessionError("product_not_found", 404)
		await tx
			.insert(ProviderOptionPreparationSession)
			.values({
				id,
				providerId,
				userId,
				productId,
				playbookId: ADD_TOUR_OPTION,
				vertical: "tour",
				writeVersion: 2,
				stepId: "profile",
				lastPath: optionWizardHref({ productId, sessionId: id }, "profile"),
			})
			.onConflictDoNothing()
		const [session] = await tx
			.select()
			.from(ProviderOptionPreparationSession)
			.where(ownedKey(providerId, userId, id))
		if (!session || session.productId !== productId)
			throw new PreparationSessionError("session_not_found", 404)
		return session
	})
}
export async function getOptionSession(
	providerId: string,
	userId: string,
	id: string,
	productId?: string
) {
	const [session] = await db
		.select()
		.from(ProviderOptionPreparationSession)
		.where(ownedKey(providerId, userId, id))
	if (!session || (productId && session.productId !== productId))
		throw new PreparationSessionError("session_not_found", 404)
	return session
}
export async function saveOptionSession(
	providerId: string,
	userId: string,
	input: { sessionId: string; lastPath: string; revision: number }
) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('fastt.preparation_write_version','2',true)`)
		const [session] = await tx
			.select()
			.from(ProviderOptionPreparationSession)
			.where(ownedKey(providerId, userId, input.sessionId))
			.for("update")
		if (!session || session.status !== "active")
			throw new PreparationSessionError("session_not_active", 409)
		const revision = new Date(session.updatedAt).getTime()
		if (revision !== input.revision)
			throw new PreparationSessionError("session_navigation_conflict", 409)
		const parsed = preparationPathContext({
			productId: session.productId!,
			lastPath: input.lastPath,
		})
		if (
			parsed.url.searchParams.get("playbook") !== ADD_TOUR_OPTION ||
			parsed.url.searchParams.get("sessionId") !== session.id
		)
			throw new PreparationSessionError("session_path_mismatch")
		const variantId = parsed.variantId || session.variantId
		const ratePlanId = parsed.ratePlanId || session.ratePlanId
		if (session.variantId && variantId !== session.variantId)
			throw new PreparationSessionError("session_option_immutable", 409)
		if (variantId) {
			const [variant] = await tx
				.select()
				.from(Variant)
				.where(
					and(
						eq(Variant.id, variantId),
						eq(Variant.productId, session.productId!),
						eq(Variant.kind, "tour_slot"),
						ne(Variant.lifecycleState, "archived")
					)
				)
			if (!variant) throw new PreparationSessionError("preparation_variant_mismatch")
		}
		if (ratePlanId) {
			const [rate] = await tx
				.select()
				.from(RatePlan)
				.where(and(eq(RatePlan.id, ratePlanId), eq(RatePlan.variantId, variantId || "")))
			if (!rate) throw new PreparationSessionError("preparation_rate_mismatch")
		}
		const requestedStep = parsed.url.searchParams.get("step")
		if (!OPTION_STEPS.some((step) => step.id === requestedStep))
			throw new PreparationSessionError("invalid_option_step")
		const stepId = optionStep(requestedStep)
		if (stepId !== "profile" && !variantId)
			throw new PreparationSessionError("option_required", 409)
		if (["conditions", "calendar", "review"].includes(stepId) && !ratePlanId)
			throw new PreparationSessionError("rate_required", 409)
		const path = new URL(
			optionWizardHref(
				{ productId: session.productId!, sessionId: session.id, variantId, ratePlanId },
				stepId
			),
			"http://fastt.local"
		)
		if (parsed.url.searchParams.get("optionReturn") === "review")
			path.searchParams.set("optionReturn", "review")
		const updatedAt = new Date(Math.max(Date.now(), revision + 1))
		const [saved] = await tx
			.update(ProviderOptionPreparationSession)
			.set({
				variantId,
				ratePlanId,
				stepId,
				lastPath: path.pathname + path.search,
				updatedAt,
				writeVersion: 2,
			})
			.where(eq(ProviderOptionPreparationSession.id, session.id))
			.returning()
		return saved
	})
}
export async function finishOptionSession(
	providerId: string,
	userId: string,
	id: string,
	status: "completed" | "abandoned"
) {
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('fastt.preparation_write_version','2',true)`)
		const [session] = await tx
			.select()
			.from(ProviderOptionPreparationSession)
			.where(ownedKey(providerId, userId, id))
			.for("update")
		if (!session) throw new PreparationSessionError("session_not_found", 404)
		if (session.status === status) return
		if (session.status !== "active") throw new PreparationSessionError("session_not_active", 409)
		if (status === "completed") {
			const [rate] = await tx
				.select({ active: RatePlan.isActive, sales: Variant.salesEnabled })
				.from(RatePlan)
				.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
				.where(
					and(eq(RatePlan.id, session.ratePlanId || ""), eq(Variant.id, session.variantId || ""))
				)
			if (!rate?.active || !rate.sales)
				throw new PreparationSessionError("activation_required", 409)
		}
		await tx
			.update(ProviderOptionPreparationSession)
			.set({ status, writeVersion: 2, updatedAt: new Date() })
			.where(ownedKey(providerId, userId, id))
	})
}
export async function listOptionSessions(providerId: string, userId: string, productId: string) {
	return db
		.select()
		.from(ProviderOptionPreparationSession)
		.where(
			and(
				eq(ProviderOptionPreparationSession.providerId, providerId),
				eq(ProviderOptionPreparationSession.userId, userId),
				eq(ProviderOptionPreparationSession.productId, productId),
				eq(ProviderOptionPreparationSession.playbookId, ADD_TOUR_OPTION),
				eq(ProviderOptionPreparationSession.status, "active")
			)
		)
}
export async function optionBases(providerId: string, productId: string) {
	return db
		.select({
			id: Variant.id,
			name: Variant.name,
			description: Variant.description,
			departureTime: TourSlotProfile.departureTime,
			durationMinutes: TourSlotProfile.durationMinutes,
			maxPax: TourSlotProfile.maxPax,
			languageCode: TourSlotProfile.languageCode,
			bookingMode: TourSlotProfile.bookingMode,
		})
		.from(Variant)
		.innerJoin(Product, and(eq(Product.id, Variant.productId), eq(Product.providerId, providerId)))
		.innerJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.where(
			and(
				eq(Variant.productId, productId),
				eq(Variant.kind, "tour_slot"),
				ne(Variant.lifecycleState, "archived")
			)
		)
}
