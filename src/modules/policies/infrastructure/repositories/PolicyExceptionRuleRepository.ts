import { randomUUID } from "crypto"
import {
	first,
	and,
	db,
	desc,
	eq,
	inArray,
	PolicyExceptionRule,
	sql,
} from "@/shared/infrastructure/db/compat"

import {
	isPolicyExceptionApproved,
	isPolicyExceptionRuleType,
	type PolicyExceptionRule as PolicyExceptionRuleDomain,
	type PolicyExceptionRuleAction,
} from "../../domain/overrides/policyExceptionRule"
import type {
	PolicyExceptionRuleCreateInput,
	PolicyExceptionRuleListFilter,
	PolicyExceptionRuleRepositoryPort,
	PolicyExceptionRuleScope,
	PolicyExceptionRuleContextFilter,
} from "../../application/ports/PolicyExceptionRuleRepositoryPort"

const SCOPES = ["global", "product", "variant", "rate_plan"] as const

function normalizeScope(value: unknown): PolicyExceptionRuleScope {
	const scope = String(value ?? "global").trim()
	return SCOPES.includes(scope as PolicyExceptionRuleScope)
		? (scope as PolicyExceptionRuleScope)
		: "global"
}

function normalizeCategory(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	return raw ? raw : null
}

function normalizeDate(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	return raw ? raw : null
}

function normalizeAction(value: unknown): PolicyExceptionRuleAction {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as PolicyExceptionRuleAction)
		: {}
}

function toDomain(row: any): PolicyExceptionRuleDomain {
	return {
		id: String(row.id),
		type: isPolicyExceptionRuleType(row.type) ? row.type : "support_manual_override",
		scope: String(row.scope ?? "global"),
		scopeId: row.scopeId == null ? null : String(row.scopeId),
		category: row.category == null ? null : String(row.category),
		priority: row.priority == null ? 100 : Number(row.priority),
		isActive: row.isActive !== false,
		effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
		effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
		reason: row.reason == null ? null : String(row.reason),
		action: normalizeAction(row.actionJson),
		createdAt: row.createdAt ?? null,
		createdBy: row.createdBy == null ? null : String(row.createdBy),
	}
}

function activeDatePredicate(asOfDate: string | null) {
	if (!asOfDate) return undefined
	return sql`(${PolicyExceptionRule.effectiveFrom} IS NULL OR ${PolicyExceptionRule.effectiveFrom} <= ${asOfDate})
		AND (${PolicyExceptionRule.effectiveTo} IS NULL OR ${PolicyExceptionRule.effectiveTo} >= ${asOfDate})`
}

export class PolicyExceptionRuleRepository implements PolicyExceptionRuleRepositoryPort {
	async list(filter: PolicyExceptionRuleListFilter = {}): Promise<PolicyExceptionRuleDomain[]> {
		const conditions = []
		const scope = filter.scope == null ? "all" : String(filter.scope)
		if (scope !== "all") conditions.push(eq(PolicyExceptionRule.scope, normalizeScope(scope)))
		const scopeId = String(filter.scopeId ?? "").trim()
		if (scopeId) conditions.push(eq(PolicyExceptionRule.scopeId, scopeId))
		const category = normalizeCategory(filter.category)
		if (category) conditions.push(eq(PolicyExceptionRule.category, category))
		const type = String(filter.type ?? "all").trim()
		if (type !== "all" && isPolicyExceptionRuleType(type)) {
			conditions.push(eq(PolicyExceptionRule.type, type))
		}
		if (typeof filter.isActive === "boolean") {
			conditions.push(eq(PolicyExceptionRule.isActive, filter.isActive))
		}
		const limit = Math.max(1, Math.min(500, Number(filter.limit ?? 250) || 250))
		let query = db.select().from(PolicyExceptionRule).orderBy(desc(PolicyExceptionRule.createdAt))
		if (conditions.length) query = query.where(and(...conditions)) as typeof query
		const rows = await query.limit(limit)
		return rows.map(toDomain)
	}

	async listApplicable(
		ctx: PolicyExceptionRuleContextFilter
	): Promise<PolicyExceptionRuleDomain[]> {
		const productId = String(ctx.productId ?? "").trim()
		const variantId = String(ctx.variantId ?? "").trim()
		const ratePlanId = String(ctx.ratePlanId ?? "").trim()
		const scopedPairs: Array<{ scope: PolicyExceptionRuleScope; scopeId: string | null }> = [
			{ scope: "global", scopeId: null },
		]
		if (productId) scopedPairs.push({ scope: "product", scopeId: productId })
		if (variantId) scopedPairs.push({ scope: "variant", scopeId: variantId })
		if (ratePlanId) scopedPairs.push({ scope: "rate_plan", scopeId: ratePlanId })
		const scopes = scopedPairs.map((pair) => pair.scope)
		const asOf = normalizeDate(ctx.checkIn)
		const datePredicate = activeDatePredicate(asOf)
		const rows = await db
			.select()
			.from(PolicyExceptionRule)
			.where(
				and(
					eq(PolicyExceptionRule.isActive, true),
					inArray(PolicyExceptionRule.scope, scopes),
					sql`(
						${PolicyExceptionRule.scope} = 'global'
						OR (${PolicyExceptionRule.scope} = 'product' AND ${PolicyExceptionRule.scopeId} = ${productId})
						OR (${PolicyExceptionRule.scope} = 'variant' AND ${PolicyExceptionRule.scopeId} = ${variantId})
						OR (${PolicyExceptionRule.scope} = 'rate_plan' AND ${PolicyExceptionRule.scopeId} = ${ratePlanId})
					)`,
					datePredicate ?? sql`1 = 1`
				)
			)
			.orderBy(PolicyExceptionRule.priority, desc(PolicyExceptionRule.createdAt))

		return rows.map(toDomain).filter(isPolicyExceptionApproved)
	}

	async create(input: PolicyExceptionRuleCreateInput): Promise<PolicyExceptionRuleDomain> {
		if (!isPolicyExceptionRuleType(input.type)) {
			throw new Error("INVALID_POLICY_EXCEPTION_TYPE")
		}
		const scope = normalizeScope(input.scope)
		const scopeId = scope === "global" ? null : String(input.scopeId ?? "").trim() || null
		if (scope !== "global" && !scopeId) {
			throw new Error("POLICY_EXCEPTION_SCOPE_ID_REQUIRED")
		}
		const action = normalizeAction(input.action)
		const row = {
			id: randomUUID(),
			type: input.type,
			scope,
			scopeId,
			category: normalizeCategory(input.category),
			priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
			isActive: input.isActive !== false && action.approval?.status === "approved",
			effectiveFrom: normalizeDate(input.effectiveFrom),
			effectiveTo: normalizeDate(input.effectiveTo),
			reason: normalizeCategory(input.reason),
			actionJson: action,
			createdAt: new Date(),
			createdBy: input.createdBy == null ? null : String(input.createdBy),
		}
		await db.insert(PolicyExceptionRule).values(row as any)
		return toDomain(row)
	}

	async findById(id: string): Promise<PolicyExceptionRuleDomain | null> {
		const key = String(id ?? "").trim()
		if (!key) return null
		const row = await db
			.select()
			.from(PolicyExceptionRule)
			.where(eq(PolicyExceptionRule.id, key))
			.then(first)
		return row ? toDomain(row) : null
	}

	async updateAction(params: {
		id: string
		action: PolicyExceptionRuleAction
		isActive?: boolean | null
	}): Promise<PolicyExceptionRuleDomain | null> {
		const id = String(params.id ?? "").trim()
		if (!id) return null
		if (params.isActive === true && params.action.approval?.status !== "approved") {
			throw new Error("POLICY_EXCEPTION_APPROVAL_REQUIRED")
		}
		const values: Record<string, unknown> = { actionJson: normalizeAction(params.action) }
		if (typeof params.isActive === "boolean") values.isActive = params.isActive
		await db
			.update(PolicyExceptionRule)
			.set(values as any)
			.where(eq(PolicyExceptionRule.id, id))

		return this.findById(id)
	}

	async setActive(params: {
		id: string
		isActive: boolean
		actorUserId?: string | null
	}): Promise<PolicyExceptionRuleDomain | null> {
		const id = String(params.id ?? "").trim()
		if (!id) return null
		const current = await this.findById(id)
		if (!current) return null
		if (params.isActive && !isPolicyExceptionApproved(current)) {
			throw new Error("POLICY_EXCEPTION_APPROVAL_REQUIRED")
		}
		await db
			.update(PolicyExceptionRule)
			.set({ isActive: Boolean(params.isActive) })
			.where(eq(PolicyExceptionRule.id, id))

		return this.findById(id)
	}
}
