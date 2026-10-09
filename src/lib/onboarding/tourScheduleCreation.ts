import { createHash } from "node:crypto"
import { v5 as uuidv5 } from "uuid"
import { z } from "zod"
import {
	db,
	and,
	eq,
	ne,
	inArray,
	sql,
	Product,
	Variant,
	TourSlotProfile,
	ProviderOptionPreparationSession,
	VariantCapacity,
	VariantInventoryConfig,
	RatePlan,
	Policy,
	PolicyGroup,
	PolicyRule,
	CancellationTier,
	PolicyAssignment,
	PolicyAuditLog,
	PolicyExceptionRule,
} from "@/shared/infrastructure/db/compat"
import { resolveEffectivePoliciesInTransaction } from "@/modules/policies/public"
import { TransactionalPricingBaselineRepository } from "@/modules/pricing/public"
import {
	evaluateEffectivePolicyReadiness,
	policyBusinessContextFromProduct,
} from "@/lib/policies/policy-business-compatibility"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import { optionWizardHref } from "@/lib/playbook/add-tour-option"
import { PreparationSessionError } from "./preparationSessionContext"

type Connection = Pick<typeof db, "select" | "insert" | "update">
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export async function loadScheduleSource(
	connection: Connection,
	providerId: string,
	productId: string,
	sourceVariantId: string,
	sourceRatePlanId?: string
) {
	const [source] = await connection
		.select({ variant: Variant, profile: TourSlotProfile })
		.from(Variant)
		.innerJoin(Product, and(eq(Product.id, Variant.productId), eq(Product.providerId, providerId)))
		.innerJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.where(
			and(
				eq(Variant.id, sourceVariantId),
				eq(Variant.productId, productId),
				sql`lower(${Product.productType}) = 'tour'`,
				eq(Variant.kind, "tour_slot"),
				ne(Variant.lifecycleState, "archived")
			)
		)
	if (!source) throw new PreparationSessionError("schedule_source_not_found", 404)
	const rates = await connection
		.select()
		.from(RatePlan)
		.where(eq(RatePlan.variantId, sourceVariantId))
	const rate = sourceRatePlanId ? rates.find((row) => row.id === sourceRatePlanId) : null
	if (sourceRatePlanId && !rate) throw new PreparationSessionError("preparation_rate_mismatch", 422)
	const baseline = rate
		? await new TransactionalPricingBaselineRepository(
				connection
			).getCanonicalPricingBaselineByRatePlanId(rate.id)
		: null
	const conditions = rate
		? await resolveEffectivePoliciesInTransaction(connection, {
				productId,
				variantId: sourceVariantId,
				ratePlanId: rate.id,
				channel: "web",
				requiredCategories: [...getRequiredPolicyCategories("tour")],
				onMissingCategory: "return_null",
			})
		: null
	const readiness = conditions
		? evaluateEffectivePolicyReadiness(
				policyBusinessContextFromProduct({ productId, productType: "tour" }),
				conditions.policies,
				conditions.missingCategories
			)
		: null
	// Fingerprint actual contents: price writers may update amounts without changing createdAt.
	const assignments = await connection
		.select()
		.from(PolicyAssignment)
		.where(
			and(
				eq(PolicyAssignment.isActive, true),
				inArray(PolicyAssignment.scopeId, [productId, sourceVariantId, sourceRatePlanId || ""])
			)
		)
	const exceptions = await connection
		.select()
		.from(PolicyExceptionRule)
		.where(
			and(
				eq(PolicyExceptionRule.isActive, true),
				inArray(PolicyExceptionRule.scopeId, [productId, sourceVariantId, sourceRatePlanId || ""])
			)
		)
	const datedConditions =
		assignments.some((row) => row.effectiveFrom || row.effectiveTo) || exceptions.length > 0
	const contents = {
		source,
		rate,
		baseline,
		conditions,
		assignments: assignments.sort((a, b) => a.id.localeCompare(b.id)),
		exceptions: exceptions.sort((a, b) => a.id.localeCompare(b.id)),
	}
	const fingerprint = createHash("sha256").update(JSON.stringify(contents)).digest("hex")
	return {
		...contents,
		rates,
		fingerprint,
		priceReusable: Boolean(baseline && baseline.basePrice > 0),
		datedConditions,
		conditionsReusable: Boolean(readiness?.isSellableByContract && !datedConditions),
	}
}

export const scheduleCreationSchema = z.object({
	sessionId: z.uuid(),
	productId: z.uuid(),
	sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	sourceRatePlanId: z.uuid().optional(),
	reusePrice: z.boolean(),
	reuseConditions: z.boolean(),
	name: z.string().trim().min(1).max(200),
	description: z.string().optional(),
	departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	durationMinutes: z.number().int().positive().nullable(),
	maxPax: z.number().int().positive(),
	languageCode: z.string().trim().min(2).max(16),
	bookingMode: z.enum(["shared", "private"]),
	meetingPointOverride: z.string().optional(),
	replaceMeetingPoint: z.boolean(),
	confirmEquivalent: z.boolean(),
})

async function copyConditions(
	tx: Transaction,
	source: Awaited<ReturnType<typeof loadScheduleSource>>,
	ratePlanId: string,
	providerId: string,
	userId: string
) {
	for (const entry of source.conditions!.policies) {
		if (entry.resolvedFromScope === "product" || entry.resolvedFromScope === "global") continue
		const [policy] = await tx.select().from(Policy).where(eq(Policy.id, entry.policy.id))
		const [group] = await tx.select().from(PolicyGroup).where(eq(PolicyGroup.id, policy.groupId))
		if (group.ownerProviderId !== providerId)
			throw new PreparationSessionError("policy_owner_mismatch", 422)
		// Independent groups: editing the new tariff cannot change the original's contract.
		const groupId = crypto.randomUUID(),
			policyId = crypto.randomUUID(),
			assignmentId = crypto.randomUUID()
		await tx
			.insert(PolicyGroup)
			.values({ id: groupId, category: entry.category, ownerProviderId: providerId })
		await tx.insert(Policy).values({ ...policy, id: policyId, groupId, version: 1 })
		const rules = await tx.select().from(PolicyRule).where(eq(PolicyRule.policyId, policy.id))
		const tiers = await tx
			.select()
			.from(CancellationTier)
			.where(eq(CancellationTier.policyId, policy.id))
		if (rules.length)
			await tx
				.insert(PolicyRule)
				.values(rules.map((row) => ({ ...row, id: crypto.randomUUID(), policyId })))
		if (tiers.length)
			await tx
				.insert(CancellationTier)
				.values(tiers.map((row) => ({ ...row, id: crypto.randomUUID(), policyId })))
		await tx.insert(PolicyAssignment).values({
			id: assignmentId,
			policyGroupId: groupId,
			category: entry.category,
			scope: "rate_plan",
			ratePlanTargetId: ratePlanId,
			channel: "web",
		})
		await tx.insert(PolicyAuditLog).values({
			id: crypto.randomUUID(),
			eventType: "schedule_condition_reused",
			actorUserId: userId,
			policyId,
			policyGroupId: groupId,
			assignmentId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel: "web",
			afterJson: {
				sourcePolicyId: policy.id,
				sourceRatePlanId: source.rate!.id,
				sourceVariantId: source.source.variant.id,
			},
		})
	}
}

async function createScheduleOptionAttempt(
	providerId: string,
	userId: string,
	input: z.infer<typeof scheduleCreationSchema>
) {
	return db.transaction(
		async (tx) => {
			await tx.execute(sql`SELECT set_config('fastt.preparation_write_version','2',true)`)
			const [session] = await tx
				.select()
				.from(ProviderOptionPreparationSession)
				.where(
					and(
						eq(ProviderOptionPreparationSession.id, input.sessionId),
						eq(ProviderOptionPreparationSession.providerId, providerId),
						eq(ProviderOptionPreparationSession.userId, userId),
						eq(ProviderOptionPreparationSession.productId, input.productId)
					)
				)
				.for("update")
			if (!session || session.status !== "active" || session.creationIntent?.mode !== "schedule")
				throw new PreparationSessionError("session_not_active", 409)
			// Lost response recovers persisted creation; never copies again over subsequent edits.
			if (session.variantId)
				return {
					variantId: session.variantId,
					ratePlanId: session.ratePlanId,
					href: session.lastPath,
					revision: session.updatedAt.getTime(),
				}
			if (
				session.creationIntent.sourceRatePlanId &&
				session.creationIntent.sourceRatePlanId !== input.sourceRatePlanId
			)
				throw new PreparationSessionError("schedule_source_choice_changed", 409)
			const source = await loadScheduleSource(
				tx,
				providerId,
				input.productId,
				session.creationIntent.sourceVariantId,
				input.sourceRatePlanId
			)
			if (source.fingerprint !== input.sourceFingerprint)
				throw new PreparationSessionError("schedule_source_changed", 409)
			if (input.reusePrice && !source.priceReusable)
				throw new PreparationSessionError("schedule_price_not_reusable", 422)
			if (input.reuseConditions && !source.conditionsReusable)
				throw new PreparationSessionError("schedule_conditions_not_reusable", 422)
			const equivalents = await tx
				.select({ id: Variant.id })
				.from(Variant)
				.innerJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
				.where(
					and(
						eq(Variant.productId, input.productId),
						ne(Variant.lifecycleState, "archived"),
						eq(TourSlotProfile.departureTime, input.departureTime),
						eq(TourSlotProfile.languageCode, input.languageCode),
						eq(TourSlotProfile.bookingMode, input.bookingMode)
					)
				)
			if (equivalents.length && !input.confirmEquivalent)
				throw new PreparationSessionError("schedule_equivalent_exists", 409)
			const variantId = uuidv5(
				JSON.stringify([providerId, input.productId, session.id]),
				uuidv5.URL
			)
			const now = new Date()
			await tx.insert(Variant).values({
				id: variantId,
				productId: input.productId,
				name: input.name,
				description: input.description || null,
				kind: "tour_slot",
				createdAt: now,
				salesEnabled: false,
				lifecycleState: "draft",
			})
			await tx.insert(TourSlotProfile).values({
				variantId,
				departureTime: input.departureTime,
				durationMinutes: input.durationMinutes,
				maxPax: input.maxPax,
				languageCode: input.languageCode,
				bookingMode: input.bookingMode,
				meetingPointOverrideJson: input.replaceMeetingPoint
					? input.meetingPointOverride
						? { instructions: input.meetingPointOverride }
						: null
					: source.source.profile.meetingPointOverrideJson,
				isActive: true,
			})
			await tx
				.insert(VariantCapacity)
				.values({ variantId, minOccupancy: 1, maxOccupancy: input.maxPax, maxAdults: input.maxPax })
			await tx
				.insert(VariantInventoryConfig)
				.values({ variantId, defaultTotalUnits: input.maxPax, horizonDays: 365 })
			let ratePlanId: string | null = null
			if (input.reusePrice || input.reuseConditions) {
				ratePlanId = crypto.randomUUID()
				await tx.insert(RatePlan).values({
					id: ratePlanId,
					variantId,
					name: source.rate!.name,
					description: source.rate!.description,
					isActive: false,
					isDefault: false,
				})
				if (input.reusePrice)
					await new TransactionalPricingBaselineRepository(
						tx
					).setCanonicalPricingBaselineForRatePlan({
						ratePlanId,
						currency: source.baseline!.currency,
						basePrice: source.baseline!.basePrice,
					})
				if (input.reuseConditions) await copyConditions(tx, source, ratePlanId, providerId, userId)
			}
			const step = input.reusePrice ? (input.reuseConditions ? "calendar" : "conditions") : "price"
			const href = optionWizardHref(
				{ productId: input.productId, sessionId: session.id, variantId, ratePlanId },
				step
			)
			const updatedAt = new Date(Math.max(now.getTime(), session.updatedAt.getTime() + 1))
			await tx
				.update(ProviderOptionPreparationSession)
				.set({
					variantId,
					ratePlanId,
					stepId: step,
					lastPath: href,
					writeVersion: 2,
					updatedAt,
					creationIntent: {
						mode: "schedule",
						sourceVariantId: source.source.variant.id,
						sourceRatePlanId: input.sourceRatePlanId,
						reusePrice: input.reusePrice,
						reuseConditions: input.reuseConditions,
						sourceFingerprint: source.fingerprint,
					},
				})
				.where(eq(ProviderOptionPreparationSession.id, session.id))
			return { variantId, ratePlanId, href, revision: updatedAt.getTime() }
		},
		{ isolationLevel: "serializable" }
	)
}

/** Reviewing a tariff persists the source selection, not the new option or its sales intent. */
export async function reviewScheduleSource(
	providerId: string,
	userId: string,
	sessionId: string,
	sourceRatePlanId: string
) {
	if (!sourceRatePlanId) throw new PreparationSessionError("preparation_rate_mismatch", 422)
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('fastt.preparation_write_version','2',true)`)
		const [session] = await tx
			.select()
			.from(ProviderOptionPreparationSession)
			.where(
				and(
					eq(ProviderOptionPreparationSession.id, sessionId),
					eq(ProviderOptionPreparationSession.providerId, providerId),
					eq(ProviderOptionPreparationSession.userId, userId)
				)
			)
			.for("update")
		if (
			!session ||
			session.variantId ||
			session.status !== "active" ||
			session.creationIntent?.mode !== "schedule"
		)
			throw new PreparationSessionError("session_not_active", 409)
		const source = await loadScheduleSource(
			tx,
			providerId,
			session.productId!,
			session.creationIntent.sourceVariantId,
			sourceRatePlanId
		)
		const [saved] = await tx
			.update(ProviderOptionPreparationSession)
			.set({
				creationIntent: {
					...session.creationIntent,
					sourceRatePlanId,
					sourceFingerprint: source.fingerprint,
					reusePrice: false,
					reuseConditions: false,
				},
				writeVersion: 2,
				updatedAt: new Date(Math.max(Date.now(), session.updatedAt.getTime() + 1)),
			})
			.where(eq(ProviderOptionPreparationSession.id, session.id))
			.returning()
		return saved
	})
}

export async function createScheduleOption(
	providerId: string,
	userId: string,
	input: z.infer<typeof scheduleCreationSchema>
) {
	const parsed = scheduleCreationSchema.parse(input)
	for (let attempt = 0; ; attempt++) {
		try {
			return await createScheduleOptionAttempt(providerId, userId, parsed)
		} catch (error) {
			const code =
				(error as { code?: string; cause?: { code?: string } })?.cause?.code ||
				(error as { code?: string })?.code
			if (code !== "40001" || attempt >= 2) throw error
		}
	}
}
