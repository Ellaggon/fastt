import {
	and,
	db,
	desc,
	eq,
	first,
	inArray,
	isNull,
	or,
	Policy,
	PolicyAssignment,
	PolicyRule,
	RatePlan,
	Variant,
	sql,
} from "@/shared/infrastructure/db/compat"

import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	deactivatePolicyAssignmentCapa6,
	replacePolicyAssignmentCapa6,
} from "@/modules/policies/public"

export type ArrivalScheduleTimes = {
	checkInFrom: string
	checkInUntil: string
	checkOutUntil: string
}

export type RatePlanArrivalExceptionSummary = {
	ratePlanId: string
	ratePlanName: string
	variantId: string
	schedule: ArrivalScheduleTimes
}

export type RatePlanArrivalContext = {
	ratePlanId: string
	ratePlanName: string
	productId: string
	variantId: string
	hotelSchedule: ArrivalScheduleTimes | null
	rateSchedule: ArrivalScheduleTimes | null
	hasException: boolean
	assignmentId: string | null
}

function cleanTime(value: unknown): string {
	return String(value ?? "").trim()
}

function asSchedule(
	rules: Record<string, unknown> | null | undefined
): ArrivalScheduleTimes | null {
	const checkInFrom = cleanTime(rules?.checkInFrom)
	const checkInUntil = cleanTime(rules?.checkInUntil)
	const checkOutUntil = cleanTime(rules?.checkOutUntil)
	if (!checkInFrom || !checkInUntil || !checkOutUntil) return null
	return { checkInFrom, checkInUntil, checkOutUntil }
}

function scheduleLabel(schedule: ArrivalScheduleTimes): string {
	return `Llegada ${schedule.checkInFrom}–${schedule.checkInUntil} · salida hasta ${schedule.checkOutUntil}`
}

async function loadPolicyRules(policyId: string): Promise<Record<string, unknown>> {
	const rows = await db
		.select({ key: PolicyRule.ruleKey, value: PolicyRule.ruleValue })
		.from(PolicyRule)
		.where(eq(PolicyRule.policyId, policyId))
	return Object.fromEntries(rows.map((row) => [String(row.key), row.value]))
}

async function loadActiveCheckInAssignment(params: {
	scope: "product" | "rate_plan"
	scopeId: string
}) {
	return db
		.select({
			id: PolicyAssignment.id,
			policyGroupId: PolicyAssignment.policyGroupId,
		})
		.from(PolicyAssignment)
		.where(
			and(
				eq(PolicyAssignment.scope, params.scope),
				eq(PolicyAssignment.scopeId, params.scopeId),
				eq(PolicyAssignment.category, "CheckIn"),
				isNull(PolicyAssignment.channel),
				eq(PolicyAssignment.isActive, true)
			)
		)
		.then(first)
}

async function loadLatestPolicyRules(policyGroupId: string): Promise<ArrivalScheduleTimes | null> {
	const today = new Date().toISOString().slice(0, 10)
	const policy = await db
		.select({ id: Policy.id })
		.from(Policy)
		.where(
			and(
				eq(Policy.groupId, policyGroupId),
				eq(Policy.status, "active"),
				or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${today}`),
				or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${today}`)
			)
		)
		.orderBy(desc(Policy.version))
		.then(first)
	if (!policy?.id) return null
	return asSchedule(await loadPolicyRules(String(policy.id)))
}

async function loadActiveSchedulesByGroupIds(
	groupIds: string[]
): Promise<Map<string, ArrivalScheduleTimes>> {
	const ids = Array.from(new Set(groupIds.map((id) => String(id).trim()).filter(Boolean)))
	if (!ids.length) return new Map()
	const today = new Date().toISOString().slice(0, 10)
	const versions = await db
		.select({ id: Policy.id, groupId: Policy.groupId, version: Policy.version })
		.from(Policy)
		.where(
			and(
				inArray(Policy.groupId, ids),
				eq(Policy.status, "active"),
				or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${today}`),
				or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${today}`)
			)
		)
		.orderBy(desc(Policy.version))

	const policyByGroup = new Map<string, string>()
	for (const version of versions) {
		const groupId = String(version.groupId)
		if (!policyByGroup.has(groupId)) policyByGroup.set(groupId, String(version.id))
	}
	const policyIds = Array.from(policyByGroup.values())
	if (!policyIds.length) return new Map()
	const ruleRows = await db
		.select({ policyId: PolicyRule.policyId, key: PolicyRule.ruleKey, value: PolicyRule.ruleValue })
		.from(PolicyRule)
		.where(inArray(PolicyRule.policyId, policyIds))
	const rulesByPolicy = new Map<string, Record<string, unknown>>()
	for (const row of ruleRows) {
		const policyId = String(row.policyId)
		const rules = rulesByPolicy.get(policyId) ?? {}
		rules[String(row.key)] = row.value
		rulesByPolicy.set(policyId, rules)
	}
	const schedules = new Map<string, ArrivalScheduleTimes>()
	for (const [groupId, policyId] of policyByGroup) {
		const schedule = asSchedule(rulesByPolicy.get(policyId))
		if (schedule) schedules.set(groupId, schedule)
	}
	return schedules
}

export async function listRatePlansWithArrivalException(
	productId: string
): Promise<RatePlanArrivalExceptionSummary[]> {
	const pid = String(productId ?? "").trim()
	if (!pid) return []

	const rows = await db
		.select({
			ratePlanId: RatePlan.id,
			ratePlanName: RatePlan.name,
			variantId: RatePlan.variantId,
			policyGroupId: PolicyAssignment.policyGroupId,
		})
		.from(PolicyAssignment)
		.innerJoin(RatePlan, eq(RatePlan.id, PolicyAssignment.scopeId))
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.where(
			and(
				eq(PolicyAssignment.scope, "rate_plan"),
				eq(PolicyAssignment.category, "CheckIn"),
				eq(PolicyAssignment.isActive, true),
				isNull(PolicyAssignment.channel),
				eq(Variant.productId, pid),
				eq(RatePlan.isActive, true)
			)
		)

	const schedules = await loadActiveSchedulesByGroupIds(
		rows.map((row) => String(row.policyGroupId))
	)
	const out: RatePlanArrivalExceptionSummary[] = []
	for (const row of rows) {
		const schedule = schedules.get(String(row.policyGroupId))
		if (!schedule) continue
		out.push({
			ratePlanId: String(row.ratePlanId),
			ratePlanName: String(row.ratePlanName || "Tarifa"),
			variantId: String(row.variantId),
			schedule,
		})
	}
	return out.sort((a, b) => a.ratePlanName.localeCompare(b.ratePlanName, "es"))
}

export async function getRatePlanArrivalContext(params: {
	ratePlanId: string
	productId: string
}): Promise<RatePlanArrivalContext | null> {
	const ratePlanId = String(params.ratePlanId ?? "").trim()
	const productId = String(params.productId ?? "").trim()
	if (!ratePlanId || !productId) return null

	const ratePlan = await db
		.select({
			id: RatePlan.id,
			name: RatePlan.name,
			variantId: RatePlan.variantId,
			productId: Variant.productId,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.where(and(eq(RatePlan.id, ratePlanId), eq(Variant.productId, productId)))
		.then(first)
	if (!ratePlan?.id) return null

	const hotelAssignment = await loadActiveCheckInAssignment({
		scope: "product",
		scopeId: productId,
	})
	const hotelSchedule = hotelAssignment?.policyGroupId
		? await loadLatestPolicyRules(String(hotelAssignment.policyGroupId))
		: null

	const rateAssignment = await loadActiveCheckInAssignment({
		scope: "rate_plan",
		scopeId: ratePlanId,
	})
	const rateSchedule = rateAssignment?.policyGroupId
		? await loadLatestPolicyRules(String(rateAssignment.policyGroupId))
		: null

	return {
		ratePlanId: String(ratePlan.id),
		ratePlanName: String(ratePlan.name || "Tarifa"),
		productId,
		variantId: String(ratePlan.variantId),
		hotelSchedule,
		rateSchedule,
		hasException: Boolean(rateSchedule),
		assignmentId: rateAssignment?.id ? String(rateAssignment.id) : null,
	}
}

export async function upsertRatePlanArrivalException(params: {
	providerId: string
	ratePlanId: string
	actorUserId: string
	schedule: ArrivalScheduleTimes
}): Promise<{ policyId: string; assignmentId: string }> {
	const schedule = asSchedule(params.schedule)
	if (!schedule) throw new Error("validation_error:arrival_schedule_required")

	const assignment = await loadActiveCheckInAssignment({
		scope: "rate_plan",
		scopeId: params.ratePlanId,
	})
	const previous = assignment?.policyGroupId
		? await db
				.select({ id: Policy.id })
				.from(Policy)
				.where(eq(Policy.groupId, String(assignment.policyGroupId)))
				.orderBy(desc(Policy.version))
				.then(first)
		: null

	const policyContent = {
		description: scheduleLabel(schedule),
		status: "active" as const,
		policyPresetKey: "standard_check_in",
		localTimezone: "property_local",
		rules: schedule,
		actorUserId: params.actorUserId,
	}

	const created = previous?.id
		? await createPolicyVersionCapa6({
				previousPolicyId: String(previous.id),
				...policyContent,
			})
		: await createPolicyCapa6({
				ownerProviderId: params.providerId,
				category: "CheckIn",
				...policyContent,
			})

	const replaced = await replacePolicyAssignmentCapa6({
		policyId: created.policyId,
		scope: "rate_plan",
		scopeId: params.ratePlanId,
		channel: null,
		actorUserId: params.actorUserId,
	})

	return { policyId: created.policyId, assignmentId: replaced.assignmentId }
}

export async function removeRatePlanArrivalException(params: {
	providerId: string
	ratePlanId: string
	actorUserId: string
}): Promise<{ removed: boolean }> {
	const assignment = await loadActiveCheckInAssignment({
		scope: "rate_plan",
		scopeId: params.ratePlanId,
	})
	if (!assignment?.id) return { removed: false }
	await deactivatePolicyAssignmentCapa6({
		assignmentId: String(assignment.id),
		ownerProviderId: params.providerId,
		actorUserId: params.actorUserId,
	})
	return { removed: true }
}

export function formatArrivalSchedule(schedule: ArrivalScheduleTimes | null): string {
	if (!schedule) return "Sin horarios configurados en el alojamiento"
	return scheduleLabel(schedule)
}
