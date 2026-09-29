import {
	and,
	asc,
	count,
	db,
	desc,
	eq,
	gte,
	inArray,
	Provider,
	ProviderSupportMessage,
	ProviderSupportRequest,
} from "@/shared/infrastructure/db/compat"

export const supportTopics = {
	historical_tour_collection: "Cobro histórico de tours",
	verification: "Verificación y documentos",
	payments: "Cuenta de pago",
	other: "Otra consulta",
} as const
export const supportLines = { tour: "Tours", lodging: "Alojamientos", account: "Cuenta" } as const
export const supportStatuses = {
	open: "Recibida",
	waiting_provider: "Esperando tu respuesta",
	resolved: "Resuelta",
} as const

export type SupportTopic = keyof typeof supportTopics
export type SupportLine = keyof typeof supportLines
export type SupportStatus = keyof typeof supportStatuses
export const supportInboxFilters = {
	open: "Recibidas",
	waiting_provider: "Esperando al proveedor",
	resolved: "Resueltas",
	all: "Todas",
} as const
export type SupportInboxFilter = keyof typeof supportInboxFilters
export const supportInboxPageSize = 20
type RequestRow = typeof ProviderSupportRequest.$inferSelect
type MessageRow = typeof ProviderSupportMessage.$inferSelect
export type SupportThread = RequestRow & { messages: MessageRow[]; providerName?: string }

export class ProviderSupportError extends Error {
	constructor(
		public readonly code: string,
		public readonly status: number
	) {
		super(code)
	}
}

export function parseSupportTopic(value: unknown): SupportTopic | null {
	if (typeof value !== "string") return null
	const key = value
	return Object.hasOwn(supportTopics, key) ? (key as SupportTopic) : null
}

export function parseSupportLine(value: unknown): SupportLine | null {
	if (typeof value !== "string") return null
	const key = value
	return Object.hasOwn(supportLines, key) ? (key as SupportLine) : null
}

export function parseSupportBody(value: unknown): string {
	if (typeof value !== "string") throw new ProviderSupportError("invalid_message", 422)
	const body = value.trim()
	if (body.length < 12 || body.length > 2000) throw new ProviderSupportError("invalid_message", 422)
	return body
}

export function parseSupportKey(value: unknown): string {
	if (typeof value !== "string") throw new ProviderSupportError("invalid_request_key", 422)
	const key = value.trim()
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
		throw new ProviderSupportError("invalid_request_key", 422)
	return key
}

async function attachMessages(requests: RequestRow[]): Promise<SupportThread[]> {
	if (!requests.length) return []
	const messages = await db
		.select()
		.from(ProviderSupportMessage)
		.where(
			inArray(
				ProviderSupportMessage.requestId,
				requests.map((request) => request.id)
			)
		)
		.orderBy(asc(ProviderSupportMessage.createdAt), asc(ProviderSupportMessage.id))
	const byRequest = new Map<string, MessageRow[]>()
	for (const message of messages) {
		const bucket = byRequest.get(message.requestId) ?? []
		bucket.push(message)
		byRequest.set(message.requestId, bucket)
	}
	return requests.map((request) => ({ ...request, messages: byRequest.get(request.id) ?? [] }))
}

export async function listProviderSupport(providerId: string): Promise<SupportThread[]> {
	const requests = await db
		.select()
		.from(ProviderSupportRequest)
		.where(eq(ProviderSupportRequest.providerId, providerId))
		.orderBy(desc(ProviderSupportRequest.updatedAt), desc(ProviderSupportRequest.id))
		.limit(30)
	return attachMessages(requests)
}

export function parseSupportInboxFilter(value: unknown): SupportInboxFilter {
	if (typeof value === "string" && Object.hasOwn(supportInboxFilters, value))
		return value as SupportInboxFilter
	return "open"
}

export function parseSupportInboxPage(value: unknown): number {
	if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1
	return Math.max(1, Number(value) || 1)
}

export async function listInternalProviderSupport(
	options: {
		filter?: SupportInboxFilter
		page?: number
		pageSize?: number
	} = {}
) {
	const filter = options.filter ?? "open"
	const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? supportInboxPageSize)))
	const requestedPage = Math.max(1, Math.trunc(options.page ?? 1))
	const countsQuery = db
		.select({ status: ProviderSupportRequest.status, total: count() })
		.from(ProviderSupportRequest)
		.groupBy(ProviderSupportRequest.status)
	const statusCounts = await countsQuery
	const countsByStatus = new Map(statusCounts.map((row) => [row.status, Number(row.total)]))
	const counts = {
		open: countsByStatus.get("open") ?? 0,
		waiting_provider: countsByStatus.get("waiting_provider") ?? 0,
		resolved: countsByStatus.get("resolved") ?? 0,
	}
	const total =
		filter === "all" ? counts.open + counts.waiting_provider + counts.resolved : counts[filter]
	const totalPages = Math.max(1, Math.ceil(total / pageSize))
	const page = Math.min(requestedPage, totalPages)
	const offset = (page - 1) * pageSize
	const condition = filter === "all" ? undefined : eq(ProviderSupportRequest.status, filter)
	const requests = condition
		? await db
				.select()
				.from(ProviderSupportRequest)
				.where(condition)
				.orderBy(desc(ProviderSupportRequest.updatedAt), desc(ProviderSupportRequest.id))
				.limit(pageSize)
				.offset(offset)
		: await db
				.select()
				.from(ProviderSupportRequest)
				.orderBy(desc(ProviderSupportRequest.updatedAt), desc(ProviderSupportRequest.id))
				.limit(pageSize)
				.offset(offset)
	const threads = await attachMessages(requests)
	if (!threads.length)
		return {
			threads,
			filter,
			counts,
			total,
			page,
			pageSize,
			totalPages,
			startIndex: 0,
			endIndex: 0,
		}
	const providers = await db
		.select({ id: Provider.id, displayName: Provider.displayName, legalName: Provider.legalName })
		.from(Provider)
		.where(
			inArray(
				Provider.id,
				threads.map((thread) => thread.providerId)
			)
		)
	const names = new Map(
		providers.map((provider) => [
			provider.id,
			provider.displayName || provider.legalName || provider.id,
		])
	)
	const namedThreads = threads.map((thread) => ({
		...thread,
		providerName: names.get(thread.providerId) ?? thread.providerId,
	}))
	return {
		threads: namedThreads,
		filter,
		counts,
		total,
		page,
		pageSize,
		totalPages,
		startIndex: offset + 1,
		endIndex: offset + namedThreads.length,
	}
}

export async function findProviderSupportRequest(requestId: string, providerId: string) {
	const rows = await db
		.select()
		.from(ProviderSupportRequest)
		.where(
			and(
				eq(ProviderSupportRequest.id, requestId),
				eq(ProviderSupportRequest.providerId, providerId)
			)
		)
		.limit(1)
	return rows[0] ?? null
}

export async function findInternalSupportRequest(requestId: string) {
	const rows = await db
		.select()
		.from(ProviderSupportRequest)
		.where(eq(ProviderSupportRequest.id, requestId))
		.limit(1)
	return rows[0] ?? null
}

export async function createProviderSupport(input: {
	providerId: string
	userId: string
	topic: SupportTopic
	line: SupportLine
	body: string
	requestKey: string
}) {
	const existing = await db
		.select({
			id: ProviderSupportRequest.id,
			topic: ProviderSupportRequest.topic,
			line: ProviderSupportRequest.line,
		})
		.from(ProviderSupportRequest)
		.where(
			and(
				eq(ProviderSupportRequest.providerId, input.providerId),
				eq(ProviderSupportRequest.requestKey, input.requestKey)
			)
		)
		.limit(1)
	if (existing[0]) {
		await assertMatchingSubmission(existing[0], input)
		return { id: existing[0].id, created: false }
	}

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
	const recent = await db
		.select({ total: count() })
		.from(ProviderSupportRequest)
		.where(
			and(
				eq(ProviderSupportRequest.providerId, input.providerId),
				gte(ProviderSupportRequest.createdAt, since)
			)
		)
	if (Number(recent[0]?.total ?? 0) >= 10)
		throw new ProviderSupportError("request_limit_reached", 429)

	const requestId = crypto.randomUUID()
	const inserted = await db.transaction(async (tx) => {
		const rows = await tx
			.insert(ProviderSupportRequest)
			.values({
				id: requestId,
				providerId: input.providerId,
				createdByUserId: input.userId,
				topic: input.topic,
				line: input.line,
				requestKey: input.requestKey,
			})
			.onConflictDoNothing()
			.returning({ id: ProviderSupportRequest.id })
		if (!rows[0]) return null
		await tx.insert(ProviderSupportMessage).values({
			id: crypto.randomUUID(),
			requestId,
			authorUserId: input.userId,
			authorRole: "provider",
			body: input.body,
			requestKey: input.requestKey,
		})
		return rows[0].id
	})
	if (inserted) return { id: inserted, created: true }
	const winner = await db
		.select({
			id: ProviderSupportRequest.id,
			topic: ProviderSupportRequest.topic,
			line: ProviderSupportRequest.line,
		})
		.from(ProviderSupportRequest)
		.where(
			and(
				eq(ProviderSupportRequest.providerId, input.providerId),
				eq(ProviderSupportRequest.requestKey, input.requestKey)
			)
		)
		.limit(1)
	if (winner[0]) {
		await assertMatchingSubmission(winner[0], input)
		return { id: winner[0].id, created: false }
	}
	throw new ProviderSupportError("request_not_saved", 503)
}

async function assertMatchingSubmission(
	request: { id: string; topic: string; line: string },
	input: {
		topic: SupportTopic
		line: SupportLine
		body: string
		requestKey: string
		userId: string
	}
) {
	const rows = await db
		.select({
			body: ProviderSupportMessage.body,
			authorUserId: ProviderSupportMessage.authorUserId,
		})
		.from(ProviderSupportMessage)
		.where(
			and(
				eq(ProviderSupportMessage.requestId, request.id),
				eq(ProviderSupportMessage.requestKey, input.requestKey)
			)
		)
		.limit(1)
	if (
		request.topic !== input.topic ||
		request.line !== input.line ||
		rows[0]?.body !== input.body ||
		rows[0]?.authorUserId !== input.userId
	)
		throw new ProviderSupportError("idempotency_conflict", 409)
}

export async function replyToProviderSupport(input: {
	requestId: string
	actorUserId: string
	authorRole: "provider" | "internal"
	body: string
	requestKey: string
	status: SupportStatus
}) {
	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(ProviderSupportMessage)
			.values({
				id: crypto.randomUUID(),
				requestId: input.requestId,
				authorUserId: input.actorUserId,
				authorRole: input.authorRole,
				body: input.body,
				requestKey: input.requestKey,
			})
			.onConflictDoNothing()
			.returning({ id: ProviderSupportMessage.id })
		if (!inserted[0]) {
			const rows = await tx
				.select({
					body: ProviderSupportMessage.body,
					authorRole: ProviderSupportMessage.authorRole,
					authorUserId: ProviderSupportMessage.authorUserId,
				})
				.from(ProviderSupportMessage)
				.where(
					and(
						eq(ProviderSupportMessage.requestId, input.requestId),
						eq(ProviderSupportMessage.requestKey, input.requestKey)
					)
				)
				.limit(1)
			if (
				rows[0]?.body !== input.body ||
				rows[0]?.authorRole !== input.authorRole ||
				rows[0]?.authorUserId !== input.actorUserId
			)
				throw new ProviderSupportError("idempotency_conflict", 409)
		}
		if (inserted[0])
			await tx
				.update(ProviderSupportRequest)
				.set({
					status: input.status,
					updatedAt: new Date(),
					resolvedAt: input.status === "resolved" ? new Date() : null,
				})
				.where(eq(ProviderSupportRequest.id, input.requestId))
		return Boolean(inserted[0])
	})
}
