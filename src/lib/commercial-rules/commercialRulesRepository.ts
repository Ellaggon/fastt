import { db, sql } from "astro:db"
import { randomUUID } from "node:crypto"

export type CommercialRuleScope = "product" | "variant" | "rate_plan"
export type CommercialRuleCategory =
	| "price"
	| "sellability"
	| "stay"
	| "arrival_departure"
	| "booking_window"

export type CommercialPriceRule = {
	id: string
	ruleSetId: string
	providerId: string
	ratePlanId: string
	name: string | null
	occupancyKey: string | null
	type: string
	value: number
	priority: number
	dateRangeJson: Record<string, unknown> | null
	dayOfWeekJson: number[] | null
	isActive: boolean
	createdAt: Date
}

export type CommercialSellabilityRule = {
	id: string
	ruleSetId: string
	providerId: string
	scope: CommercialRuleScope
	scopeId: string
	type: string
	value: number | null
	startDate: string
	endDate: string
	validDays: number[]
	isActive: boolean
	priority: number
	createdAt: Date
}

function parseJson(value: unknown): unknown {
	if (typeof value !== "string") return value
	const trimmed = value.trim()
	if (!trimmed) return null
	try {
		return JSON.parse(trimmed)
	} catch {
		return null
	}
}

function normalizeConfig(value: unknown): Record<string, unknown> {
	const parsed = parseJson(value)
	return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
}

function normalizeDate(value: unknown): Date {
	return value instanceof Date ? value : new Date(value == null ? Date.now() : (value as any))
}

function normalizeBoolean(value: unknown): boolean {
	return value === true || value === 1 || value === "1" || value === "true"
}

function normalizeValidDays(value: unknown): number[] {
	const parsed = parseJson(value)
	if (!Array.isArray(parsed)) return []
	return parsed
		.map((item) => Number(item))
		.filter((item) => Number.isInteger(item) && item >= 0 && item <= 7)
}

function normalizeDateRange(value: unknown): Record<string, unknown> | null {
	const config = normalizeConfig(value)
	const dateRange = normalizeConfig(config.dateRangeJson)
	if (Object.keys(dateRange).length > 0) return dateRange
	const from = String(config.dateFrom ?? "").trim()
	const to = String(config.dateTo ?? "").trim()
	if (!from && !to && !config.eligibility) return null
	return {
		from: from || null,
		to: to || null,
		...(config.eligibility ? { eligibility: config.eligibility } : {}),
	}
}

function toJson(value: unknown): string | null {
	return value == null ? null : JSON.stringify(value)
}

function placeholders(values: readonly unknown[]) {
	return sql.join(
		values.map((value) => sql`${value}`),
		sql`, `
	)
}

async function rawRun(query: unknown) {
	await (db as any).run(query)
}

let ensureCommercialRuleTablesPromise: Promise<void> | null = null

export async function ensureCommercialRuleTables() {
	if (!ensureCommercialRuleTablesPromise) {
		ensureCommercialRuleTablesPromise = (async () => {
			await rawRun(sql`
				CREATE TABLE IF NOT EXISTS CommercialRuleSet (
					id TEXT PRIMARY KEY NOT NULL,
					providerId TEXT NOT NULL,
					name TEXT NOT NULL,
					description TEXT,
					color TEXT,
					status TEXT NOT NULL DEFAULT 'active',
					priority INTEGER NOT NULL DEFAULT 100,
					dateFrom TEXT,
					dateTo TEXT,
					createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					archivedAt INTEGER
				)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRuleSet_provider_status_idx
					ON CommercialRuleSet (providerId, status)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRuleSet_provider_dates_idx
					ON CommercialRuleSet (providerId, dateFrom, dateTo)
			`)
			await rawRun(sql`
				CREATE TABLE IF NOT EXISTS CommercialRule (
					id TEXT PRIMARY KEY NOT NULL,
					providerId TEXT NOT NULL,
					ruleSetId TEXT NOT NULL,
					category TEXT NOT NULL,
					type TEXT NOT NULL,
					name TEXT,
					value REAL,
					configJson TEXT,
					priority INTEGER NOT NULL DEFAULT 100,
					isActive INTEGER NOT NULL DEFAULT 1,
					createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRule_provider_category_type_idx
					ON CommercialRule (providerId, category, type)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRule_set_active_idx
					ON CommercialRule (ruleSetId, isActive)
			`)
			await rawRun(sql`
				CREATE TABLE IF NOT EXISTS CommercialRuleApplication (
					id TEXT PRIMARY KEY NOT NULL,
					providerId TEXT NOT NULL,
					ruleSetId TEXT NOT NULL,
					ruleId TEXT NOT NULL,
					scope TEXT NOT NULL,
					scopeId TEXT NOT NULL,
					startDate TEXT,
					endDate TEXT,
					validDays TEXT,
					channel TEXT,
					isActive INTEGER NOT NULL DEFAULT 1,
					createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRuleApplication_provider_scope_idx
					ON CommercialRuleApplication (providerId, scope, scopeId, isActive)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRuleApplication_rule_scope_idx
					ON CommercialRuleApplication (ruleId, scope, scopeId)
			`)
			await rawRun(sql`
				CREATE INDEX IF NOT EXISTS CommercialRuleApplication_set_active_idx
					ON CommercialRuleApplication (ruleSetId, isActive)
			`)
		})()
	}
	return ensureCommercialRuleTablesPromise
}

async function run(query: unknown) {
	await ensureCommercialRuleTables()
	await rawRun(query)
}

async function all<T>(query: unknown): Promise<T[]> {
	await ensureCommercialRuleTables()
	const result = await (db as any).run(query)
	return ((result as any)?.rows ?? []) as T[]
}

async function get<T>(query: unknown): Promise<T | null> {
	const rows = await all<T>(query)
	return rows[0] ?? null
}

type RawCommercialRuleRow = {
	rule_id: string
	rule_ruleSetId: string
	rule_providerId: string
	rule_category: string
	rule_type: string
	rule_name: string | null
	rule_value: number | null
	rule_configJson: unknown
	rule_priority: number | null
	rule_isActive: unknown
	rule_createdAt: unknown
	application_scope: string
	application_scopeId: string
	application_startDate: string | null
	application_endDate: string | null
	application_validDays: unknown
	application_isActive: unknown
}

function priceRuleFromRaw(row: RawCommercialRuleRow): CommercialPriceRule {
	const config = normalizeConfig(row.rule_configJson)
	return {
		id: String(row.rule_id),
		ruleSetId: String(row.rule_ruleSetId),
		providerId: String(row.rule_providerId),
		ratePlanId: String(row.application_scopeId),
		name: row.rule_name == null ? null : String(row.rule_name),
		occupancyKey: String(config.occupancyKey ?? "").trim() || null,
		type: String(row.rule_type),
		value: Number(row.rule_value ?? 0),
		priority: Number(row.rule_priority ?? 100),
		dateRangeJson: normalizeDateRange(row.rule_configJson),
		dayOfWeekJson: normalizeValidDays(config.dayOfWeekJson),
		isActive: normalizeBoolean(row.rule_isActive) && normalizeBoolean(row.application_isActive),
		createdAt: normalizeDate(row.rule_createdAt),
	}
}

function sellabilityRuleFromRaw(row: RawCommercialRuleRow): CommercialSellabilityRule {
	const config = normalizeConfig(row.rule_configJson)
	return {
		id: String(row.rule_id),
		ruleSetId: String(row.rule_ruleSetId),
		providerId: String(row.rule_providerId),
		scope: String(row.application_scope) as CommercialRuleScope,
		scopeId: String(row.application_scopeId),
		type: String(row.rule_type),
		value: row.rule_value == null ? null : Number(row.rule_value),
		startDate: String(row.application_startDate ?? config.startDate ?? ""),
		endDate: String(row.application_endDate ?? config.endDate ?? ""),
		validDays: normalizeValidDays(row.application_validDays ?? config.validDays),
		isActive: normalizeBoolean(row.rule_isActive) && normalizeBoolean(row.application_isActive),
		priority: Number(row.rule_priority ?? 100),
		createdAt: normalizeDate(row.rule_createdAt),
	}
}

function selectCommercialRulesSql(whereSql: unknown) {
	return sql`
		SELECT
			r.id AS rule_id,
			r.ruleSetId AS rule_ruleSetId,
			r.providerId AS rule_providerId,
			r.category AS rule_category,
			r.type AS rule_type,
			r.name AS rule_name,
			r.value AS rule_value,
			r.configJson AS rule_configJson,
			r.priority AS rule_priority,
			r.isActive AS rule_isActive,
			r.createdAt AS rule_createdAt,
			a.scope AS application_scope,
			a.scopeId AS application_scopeId,
			a.startDate AS application_startDate,
			a.endDate AS application_endDate,
			a.validDays AS application_validDays,
			a.isActive AS application_isActive
		FROM CommercialRule r
		INNER JOIN CommercialRuleApplication a ON a.ruleId = r.id
		WHERE ${whereSql}
	`
}

async function createRuleSet(params: {
	providerId: string
	name: string
	description?: string | null
	color?: string | null
	status?: string
	priority?: number
	dateFrom?: string | null
	dateTo?: string | null
}): Promise<string> {
	const id = randomUUID()
	await run(sql`
		INSERT INTO CommercialRuleSet (
			id, providerId, name, description, color, status, priority, dateFrom, dateTo
		) VALUES (
			${id},
			${params.providerId},
			${params.name},
			${params.description ?? null},
			${params.color ?? null},
			${params.status ?? "active"},
			${params.priority ?? 100},
			${params.dateFrom ?? null},
			${params.dateTo ?? null}
		)
	`)
	return id
}

export async function createCommercialPriceRule(params: {
	providerId: string
	ratePlanId: string
	ruleId?: string
	name?: string | null
	type: string
	value: number
	priority?: number
	dateRangeJson?: Record<string, unknown> | null
	dayOfWeekJson?: number[] | null
	occupancyKey?: string | null
}): Promise<{ ruleSetId: string; ruleId: string }> {
	const ruleSetId = await createRuleSet({
		providerId: params.providerId,
		name: params.name?.startsWith("ctx:")
			? "Regla automática de precio"
			: params.name || "Regla automática de precio",
		status: "active",
		priority: params.priority ?? 20,
		dateFrom: String(params.dateRangeJson?.from ?? "").trim() || null,
		dateTo: String(params.dateRangeJson?.to ?? "").trim() || null,
	})
	const ruleId = params.ruleId ?? randomUUID()
	const configJson = toJson({
		dateRangeJson: params.dateRangeJson ?? null,
		dayOfWeekJson: params.dayOfWeekJson ?? [],
		occupancyKey: params.occupancyKey ?? null,
	})
	const startDate = String(params.dateRangeJson?.from ?? "").trim() || null
	const endDate = String(params.dateRangeJson?.to ?? "").trim() || null
	await run(sql`
		INSERT INTO CommercialRule (
			id, providerId, ruleSetId, category, type, name, value, configJson, priority, isActive
		) VALUES (
			${ruleId},
			${params.providerId},
			${ruleSetId},
			'price',
			${params.type},
			${params.name ?? null},
			${params.value},
			${configJson},
			${params.priority ?? 20},
			1
		)
	`)
	await run(sql`
		INSERT INTO CommercialRuleApplication (
			id, providerId, ruleSetId, ruleId, scope, scopeId, startDate, endDate, isActive
		) VALUES (
			${randomUUID()},
			${params.providerId},
			${ruleSetId},
			${ruleId},
			'rate_plan',
			${params.ratePlanId},
			${startDate},
			${endDate},
			1
		)
	`)
	return { ruleSetId, ruleId }
}

export async function listCommercialPriceRulesByRatePlan(
	ratePlanId: string
): Promise<CommercialPriceRule[]> {
	const rows = await all<RawCommercialRuleRow>(
		selectCommercialRulesSql(sql`
			r.category = 'price'
			AND a.scope = 'rate_plan'
			AND a.scopeId = ${ratePlanId}
		`)
	)
	return rows.map(priceRuleFromRaw)
}

export async function listCommercialPriceRulesByRatePlans(
	ratePlanIds: string[]
): Promise<CommercialPriceRule[]> {
	if (!ratePlanIds.length) return []
	const rows = await all<RawCommercialRuleRow>(
		selectCommercialRulesSql(sql`
			r.category = 'price'
			AND a.scope = 'rate_plan'
			AND a.scopeId IN (${placeholders(ratePlanIds)})
		`)
	)
	return rows.map(priceRuleFromRaw)
}

export async function getCommercialPriceRule(params: {
	ruleId: string
	ratePlanId?: string
}): Promise<CommercialPriceRule | null> {
	const row = await get<RawCommercialRuleRow>(
		selectCommercialRulesSql(sql`
			r.id = ${params.ruleId}
			AND r.category = 'price'
			AND a.scope = 'rate_plan'
			${params.ratePlanId ? sql`AND a.scopeId = ${params.ratePlanId}` : sql``}
		`)
	)
	return row ? priceRuleFromRaw(row) : null
}

export async function updateCommercialPriceRule(params: {
	ruleId: string
	type: string
	value: number
	priority?: number
	dateRangeJson?: Record<string, unknown> | null
	dayOfWeekJson?: number[] | null
	occupancyKey?: string | null
	name?: string | null
	isActive?: boolean
}) {
	await run(sql`
		UPDATE CommercialRule
		SET
			type = ${params.type},
			value = ${params.value},
			priority = ${params.priority ?? 20},
			name = ${params.name ?? null},
			configJson = ${toJson({
				dateRangeJson: params.dateRangeJson ?? null,
				dayOfWeekJson: params.dayOfWeekJson ?? [],
				occupancyKey: params.occupancyKey ?? null,
			})},
			isActive = ${typeof params.isActive === "boolean" ? (params.isActive ? 1 : 0) : sql`isActive`},
			updatedAt = ${Date.now()}
		WHERE id = ${params.ruleId}
	`)
	if (params.dateRangeJson || typeof params.isActive === "boolean") {
		await run(sql`
			UPDATE CommercialRuleApplication
			SET
				startDate = ${
					params.dateRangeJson
						? String(params.dateRangeJson.from ?? "").trim() || null
						: sql`startDate`
				},
				endDate = ${
					params.dateRangeJson ? String(params.dateRangeJson.to ?? "").trim() || null : sql`endDate`
				},
				isActive = ${typeof params.isActive === "boolean" ? (params.isActive ? 1 : 0) : sql`isActive`}
			WHERE ruleId = ${params.ruleId}
		`)
	}
}

export async function deleteCommercialRule(ruleId: string) {
	const existing = await get<{ ruleSetId: string }>(sql`
		SELECT ruleSetId FROM CommercialRule WHERE id = ${ruleId}
	`)
	await run(sql`DELETE FROM CommercialRuleApplication WHERE ruleId = ${ruleId}`)
	await run(sql`DELETE FROM CommercialRule WHERE id = ${ruleId}`)
	if (existing?.ruleSetId) {
		const remaining = await get<{ id: string }>(sql`
			SELECT id FROM CommercialRule WHERE ruleSetId = ${String(existing.ruleSetId)} LIMIT 1
		`)
		if (!remaining) {
			await run(sql`DELETE FROM CommercialRuleSet WHERE id = ${String(existing.ruleSetId)}`)
		}
	}
}

export async function deleteCommercialRulesForScope(params: {
	scope: CommercialRuleScope
	scopeId: string
}) {
	const rows = await all<{ ruleId: string; ruleSetId: string }>(sql`
		SELECT ruleId, ruleSetId
		FROM CommercialRuleApplication
		WHERE scope = ${params.scope} AND scopeId = ${params.scopeId}
	`)
	const ruleIds = [...new Set(rows.map((row) => String(row.ruleId)).filter(Boolean))]
	const ruleSetIds = [...new Set(rows.map((row) => String(row.ruleSetId)).filter(Boolean))]
	await run(sql`
		DELETE FROM CommercialRuleApplication
		WHERE scope = ${params.scope} AND scopeId = ${params.scopeId}
	`)
	if (ruleIds.length) {
		await run(sql`DELETE FROM CommercialRule WHERE id IN (${placeholders(ruleIds)})`)
	}
	for (const ruleSetId of ruleSetIds) {
		const remaining = await get<{ id: string }>(sql`
			SELECT id FROM CommercialRule WHERE ruleSetId = ${ruleSetId} LIMIT 1
		`)
		if (!remaining) {
			await run(sql`DELETE FROM CommercialRuleSet WHERE id = ${ruleSetId}`)
		}
	}
}

export async function createCommercialSellabilityRule(params: {
	providerId: string
	scope: CommercialRuleScope
	scopeId: string
	type: string
	value?: number | null
	startDate: string
	endDate: string
	validDays?: number[] | null
	priority?: number
}): Promise<{ ruleSetId: string; ruleId: string }> {
	const ruleSetId = await createRuleSet({
		providerId: params.providerId,
		name: "Regla de venta",
		status: "active",
		priority: params.priority ?? 100,
		dateFrom: params.startDate,
		dateTo: params.endDate,
	})
	const categoryByType: Record<string, CommercialRuleCategory> = {
		stop_sell: "sellability",
		min_los: "stay",
		max_los: "stay",
		cta: "arrival_departure",
		ctd: "arrival_departure",
		min_lead_time: "booking_window",
		max_lead_time: "booking_window",
	}
	const ruleId = randomUUID()
	await run(sql`
		INSERT INTO CommercialRule (
			id, providerId, ruleSetId, category, type, value, configJson, priority, isActive
		) VALUES (
			${ruleId},
			${params.providerId},
			${ruleSetId},
			${categoryByType[params.type] ?? "sellability"},
			${params.type},
			${params.value ?? null},
			${toJson({
				startDate: params.startDate,
				endDate: params.endDate,
				validDays: params.validDays ?? [],
			})},
			${params.priority ?? 100},
			1
		)
	`)
	await run(sql`
		INSERT INTO CommercialRuleApplication (
			id, providerId, ruleSetId, ruleId, scope, scopeId, startDate, endDate, validDays, isActive
		) VALUES (
			${randomUUID()},
			${params.providerId},
			${ruleSetId},
			${ruleId},
			${params.scope},
			${params.scopeId},
			${params.startDate},
			${params.endDate},
			${params.validDays?.length ? toJson(params.validDays) : null},
			1
		)
	`)
	return { ruleSetId, ruleId }
}

export async function listCommercialSellabilityRulesForScopes(params: {
	scopeIds: string[]
	providerId?: string
}): Promise<CommercialSellabilityRule[]> {
	if (!params.scopeIds.length) return []
	const rows = await all<RawCommercialRuleRow>(
		selectCommercialRulesSql(sql`
			a.scopeId IN (${placeholders(params.scopeIds)})
			AND r.category <> 'price'
			${params.providerId ? sql`AND r.providerId = ${params.providerId}` : sql``}
		`)
	)
	return rows.map(sellabilityRuleFromRaw)
}

export async function listActiveCommercialSellabilityRulesForContext(params: {
	scopeIds: string[]
	checkInISO?: string
	checkOutISO?: string
}): Promise<CommercialSellabilityRule[]> {
	if (!params.scopeIds.length) return []
	const rows = await all<RawCommercialRuleRow>(
		selectCommercialRulesSql(sql`
			a.scopeId IN (${placeholders(params.scopeIds)})
			AND r.category <> 'price'
			AND r.isActive = 1
			AND a.isActive = 1
		`)
	)
	return rows.map(sellabilityRuleFromRaw)
}

export async function setCommercialRuleActive(ruleId: string, isActive: boolean) {
	await run(sql`
		UPDATE CommercialRule
		SET isActive = ${isActive ? 1 : 0}, updatedAt = ${Date.now()}
		WHERE id = ${ruleId}
	`)
	await run(sql`
		UPDATE CommercialRuleApplication
		SET isActive = ${isActive ? 1 : 0}
		WHERE ruleId = ${ruleId}
	`)
}

export async function listProviderRatePlanIdsWithCommercialRules(providerId: string) {
	const rows = await all<{ scopeId: string }>(sql`
		SELECT DISTINCT a.scopeId AS scopeId
		FROM CommercialRuleApplication a
		INNER JOIN RatePlan rp ON rp.id = a.scopeId
		INNER JOIN Variant v ON v.id = rp.variantId
		INNER JOIN Product p ON p.id = v.productId
		WHERE p.providerId = ${providerId}
			AND a.scope = 'rate_plan'
	`)
	return rows.map((row) => String(row.scopeId))
}
