import {
	TaxFeeDefinition as TaxFeeDefinitionTable,
	TaxFeeAssignment as TaxFeeAssignmentTable,
	Product,
	db,
	and,
	eq,
	inArray,
	isNull,
	or,
} from "astro:db"
import type { TaxFeeCommandRepositoryPort } from "../../application/ports/TaxFeeCommandRepositoryPort"
import type { TaxFeeResolutionRepositoryPort } from "../../application/ports/TaxFeeResolutionRepositoryPort"
import type { TaxFeeQueryRepositoryPort } from "../../application/ports/TaxFeeQueryRepositoryPort"
import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "../../domain/tax-fee.types"

function mapDefinition(row: any): TaxFeeDefinition {
	return {
		id: row.id,
		providerId: row.providerId ?? null,
		code: row.code,
		name: row.name,
		kind: row.kind,
		calculationType: row.calculationType,
		value: Number(row.value),
		currency: row.currency ?? null,
		inclusionType: row.inclusionType,
		appliesPer: row.appliesPer,
		priority: Number(row.priority ?? 0),
		jurisdictionJson: row.jurisdictionJson ?? null,
		effectiveFrom: row.effectiveFrom ?? null,
		effectiveTo: row.effectiveTo ?? null,
		status: row.status,
		createdAt: row.createdAt ?? new Date(0),
		updatedAt: row.updatedAt ?? new Date(0),
	}
}

function mapAssignment(row: any): TaxFeeAssignment {
	return {
		id: row.id,
		taxFeeDefinitionId: row.taxFeeDefinitionId,
		scope: row.scope,
		scopeId: row.scopeId ?? null,
		channel: row.channel ?? null,
		status: row.status,
		createdAt: row.createdAt ?? new Date(0),
	}
}

export class TaxFeeRepository
	implements TaxFeeCommandRepositoryPort, TaxFeeResolutionRepositoryPort, TaxFeeQueryRepositoryPort
{
	async createDefinition(params: Omit<TaxFeeDefinition, "createdAt" | "updatedAt">): Promise<void> {
		await db.insert(TaxFeeDefinitionTable).values({
			id: params.id,
			providerId: params.providerId,
			code: params.code,
			name: params.name,
			kind: params.kind,
			calculationType: params.calculationType,
			value: params.value,
			currency: params.currency,
			inclusionType: params.inclusionType,
			appliesPer: params.appliesPer,
			priority: params.priority,
			jurisdictionJson: params.jurisdictionJson ?? null,
			effectiveFrom: params.effectiveFrom ?? null,
			effectiveTo: params.effectiveTo ?? null,
			status: params.status,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
	}

	async updateDefinition(params: Omit<TaxFeeDefinition, "createdAt" | "updatedAt">): Promise<void> {
		await db
			.update(TaxFeeDefinitionTable)
			.set({
				providerId: params.providerId,
				code: params.code,
				name: params.name,
				kind: params.kind,
				calculationType: params.calculationType,
				value: params.value,
				currency: params.currency,
				inclusionType: params.inclusionType,
				appliesPer: params.appliesPer,
				priority: params.priority,
				jurisdictionJson: params.jurisdictionJson ?? null,
				effectiveFrom: params.effectiveFrom ?? null,
				effectiveTo: params.effectiveTo ?? null,
				status: params.status,
				updatedAt: new Date(),
			})
			.where(eq(TaxFeeDefinitionTable.id, params.id))
	}

	async createAssignment(params: Omit<TaxFeeAssignment, "createdAt">): Promise<void> {
		await db.insert(TaxFeeAssignmentTable).values({
			id: params.id,
			taxFeeDefinitionId: params.taxFeeDefinitionId,
			scope: params.scope,
			scopeId: params.scopeId ?? null,
			channel: params.channel ?? null,
			status: params.status,
			createdAt: new Date(),
		})
	}

	async getDefinitionById(id: string): Promise<TaxFeeDefinition | null> {
		const row = await db
			.select()
			.from(TaxFeeDefinitionTable)
			.where(eq(TaxFeeDefinitionTable.id, id))
			.get()
		return row ? mapDefinition(row) : null
	}

	async findActiveDefinitionByCodeProvider(params: {
		code: string
		providerId: string | null
	}): Promise<TaxFeeDefinition | null> {
		const row = await db
			.select()
			.from(TaxFeeDefinitionTable)
			.where(
				and(
					eq(TaxFeeDefinitionTable.code, params.code),
					params.providerId
						? eq(TaxFeeDefinitionTable.providerId, params.providerId)
						: isNull(TaxFeeDefinitionTable.providerId),
					eq(TaxFeeDefinitionTable.status, "active")
				)
			)
			.get()

		return row ? mapDefinition(row) : null
	}

	async findActiveAssignment(params: {
		definitionId: string
		scope: TaxFeeScope
		scopeId: string | null
		channel: string | null
	}): Promise<TaxFeeAssignment | null> {
		const row = await db
			.select()
			.from(TaxFeeAssignmentTable)
			.where(
				and(
					eq(TaxFeeAssignmentTable.taxFeeDefinitionId, params.definitionId),
					eq(TaxFeeAssignmentTable.scope, params.scope),
					params.scopeId
						? eq(TaxFeeAssignmentTable.scopeId, params.scopeId)
						: isNull(TaxFeeAssignmentTable.scopeId),
					params.channel
						? eq(TaxFeeAssignmentTable.channel, params.channel)
						: isNull(TaxFeeAssignmentTable.channel),
					eq(TaxFeeAssignmentTable.status, "active")
				)
			)
			.get()
		return row ? mapAssignment(row) : null
	}

	async findActiveAssignmentByCodeScope(params: {
		code: string
		scope: TaxFeeScope
		scopeId: string | null
	}): Promise<TaxFeeAssignment | null> {
		const row = await db
			.select()
			.from(TaxFeeAssignmentTable)
			.innerJoin(
				TaxFeeDefinitionTable,
				eq(TaxFeeAssignmentTable.taxFeeDefinitionId, TaxFeeDefinitionTable.id)
			)
			.where(
				and(
					eq(TaxFeeDefinitionTable.code, params.code),
					eq(TaxFeeDefinitionTable.status, "active"),
					eq(TaxFeeAssignmentTable.status, "active"),
					eq(TaxFeeAssignmentTable.scope, params.scope),
					params.scopeId
						? eq(TaxFeeAssignmentTable.scopeId, params.scopeId)
						: isNull(TaxFeeAssignmentTable.scopeId)
				)
			)
			.get()
		return row ? mapAssignment(row) : null
	}

	async listActiveAssignments(params: {
		scopeChain: Array<{ scope: TaxFeeScope; scopeId: string | null }>
		channels: Array<string | null>
	}): Promise<TaxFeeAssignment[]> {
		if (!params.scopeChain.length || !params.channels.length) return []
		const scopeConds = params.scopeChain.map((s) =>
			and(
				eq(TaxFeeAssignmentTable.scope, s.scope),
				s.scopeId
					? eq(TaxFeeAssignmentTable.scopeId, s.scopeId)
					: isNull(TaxFeeAssignmentTable.scopeId)
			)
		)
		const channelConds = params.channels.map((c) =>
			c == null ? isNull(TaxFeeAssignmentTable.channel) : eq(TaxFeeAssignmentTable.channel, c)
		)

		const rows = await db
			.select()
			.from(TaxFeeAssignmentTable)
			.where(
				and(eq(TaxFeeAssignmentTable.status, "active"), or(...scopeConds), or(...channelConds))
			)
			.all()

		return rows.filter(Boolean).map(mapAssignment)
	}

	async listDefinitionsByIds(ids: string[]): Promise<TaxFeeDefinition[]> {
		if (!ids.length) return []
		const rows = await db
			.select()
			.from(TaxFeeDefinitionTable)
			.where(inArray(TaxFeeDefinitionTable.id, ids))
			.all()
		return rows.map(mapDefinition)
	}

	async listDefinitionsByProvider(providerId: string): Promise<TaxFeeDefinition[]> {
		const rows = await db
			.select()
			.from(TaxFeeDefinitionTable)
			.where(eq(TaxFeeDefinitionTable.providerId, providerId))
			.all()
		return rows.map(mapDefinition)
	}

	async listAssignmentsByScope(params: {
		scope: TaxFeeScope
		scopeId: string | null
	}): Promise<TaxFeeAssignment[]> {
		const rows = await db
			.select()
			.from(TaxFeeAssignmentTable)
			.where(
				and(
					eq(TaxFeeAssignmentTable.scope, params.scope),
					params.scopeId
						? eq(TaxFeeAssignmentTable.scopeId, params.scopeId)
						: isNull(TaxFeeAssignmentTable.scopeId)
				)
			)
			.all()
		return rows.map(mapAssignment)
	}

	async getProviderIdByProductId(productId: string): Promise<string | null> {
		const row = await db
			.select({ providerId: Product.providerId })
			.from(Product)
			.where(eq(Product.id, productId))
			.get()
		return row?.providerId ?? null
	}
}
