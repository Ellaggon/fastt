import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	and,
	db,
	desc,
	eq,
	FiscalActivityEvent,
	gte,
	lte,
	ProviderAuditLog,
	sql,
	TaxFeeDefinition,
	User,
} from "@/shared/infrastructure/db/compat"

const fiscalAction = (action: string) => action.startsWith("tax_fee_")

const actorDisplayName = sql<
	string | null
>`nullif(trim(concat_ws(' ', ${User.firstName}, ${User.lastName})), '')`

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })

	const url = new URL(request.url)
	const from = url.searchParams.get("from")
	const to = url.searchParams.get("to")
	const type = url.searchParams.get("type")
	const definitionId = url.searchParams.get("definitionId")
	const channel = url.searchParams.get("channel")
	const risk = url.searchParams.get("risk")
	const result = url.searchParams.get("result")

	const eventRows = await db
		.select({
			id: FiscalActivityEvent.id,
			type: FiscalActivityEvent.eventType,
			definitionId: FiscalActivityEvent.definitionId,
			versionId: FiscalActivityEvent.definitionVersionId,
			productId: FiscalActivityEvent.productId,
			channel: FiscalActivityEvent.channel,
			actorId: FiscalActivityEvent.actorUserId,
			actorRole: FiscalActivityEvent.actorRole,
			correlationId: FiscalActivityEvent.correlationId,
			result: FiscalActivityEvent.result,
			risk: FiscalActivityEvent.riskLevel,
			before: FiscalActivityEvent.beforeJson,
			after: FiscalActivityEvent.afterJson,
			context: FiscalActivityEvent.contextJson,
			createdAt: FiscalActivityEvent.createdAt,
			actorName: actorDisplayName,
			actorEmail: User.email,
			definitionName: TaxFeeDefinition.name,
		})
		.from(FiscalActivityEvent)
		.leftJoin(User, eq(User.id, FiscalActivityEvent.actorUserId))
		.leftJoin(TaxFeeDefinition, eq(TaxFeeDefinition.id, FiscalActivityEvent.definitionId))
		.where(
			and(
				eq(FiscalActivityEvent.providerId, providerId),
				...(from ? [gte(FiscalActivityEvent.createdAt, new Date(from))] : []),
				...(to ? [lte(FiscalActivityEvent.createdAt, new Date(`${to}T23:59:59.999Z`))] : [])
			)
		)
		.orderBy(desc(FiscalActivityEvent.createdAt))

	const auditRows = await db
		.select({
			id: ProviderAuditLog.id,
			type: ProviderAuditLog.action,
			definitionId: ProviderAuditLog.entityId,
			actorId: ProviderAuditLog.actorUserId,
			risk: ProviderAuditLog.riskLevel,
			before: ProviderAuditLog.beforeJson,
			after: ProviderAuditLog.afterJson,
			createdAt: ProviderAuditLog.createdAt,
			actorName: actorDisplayName,
			actorEmail: User.email,
		})
		.from(ProviderAuditLog)
		.leftJoin(User, eq(User.id, ProviderAuditLog.actorUserId))
		.where(
			and(
				eq(ProviderAuditLog.providerId, providerId),
				...(from ? [gte(ProviderAuditLog.createdAt, new Date(from))] : []),
				...(to ? [lte(ProviderAuditLog.createdAt, new Date(`${to}T23:59:59.999Z`))] : [])
			)
		)
		.orderBy(desc(ProviderAuditLog.createdAt))

	const rows = [
		...eventRows.map((row) => ({
			...row,
			actorName: row.actorName ?? row.actorEmail ?? null,
			source: "fiscal" as const,
		})),
		...auditRows
			.filter((row) => fiscalAction(row.type))
			.map((row) => ({
				...row,
				actorName: row.actorName ?? row.actorEmail ?? null,
				versionId: null,
				productId: null,
				channel: null,
				actorRole: null,
				correlationId: null,
				result: "succeeded" as const,
				context: null,
				definitionName: null,
				source: "audit" as const,
			})),
	]
		.filter(
			(row) =>
				(!type || row.type === type) &&
				(!definitionId || row.definitionId === definitionId) &&
				(!channel || row.channel === channel) &&
				(!risk || row.risk === risk) &&
				(!result || row.result === result)
		)
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

	return Response.json({ events: rows })
}
