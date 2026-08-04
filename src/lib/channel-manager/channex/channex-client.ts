import { z } from "zod"

import {
	ChannelManagerAdapterError,
	type ChannelManagerMode,
	type ChannelManagerWarning,
} from "@/lib/channel-manager/channel-manager-adapter"

const CHANNEX_BASE_URLS: Record<ChannelManagerMode, string> = {
	sandbox: "https://staging.channex.io/api/v1",
	production: "https://app.channex.io/api/v1",
}
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGES = 1_000
const MAX_REQUEST_BYTES = 10 * 1024 * 1024

const envelopeSchema = z
	.object({
		data: z.unknown().optional(),
		meta: z.unknown().optional(),
		warnings: z.unknown().optional(),
		errors: z.unknown().optional(),
	})
	.passthrough()
	.refine(
		(value) => value.data !== undefined || value.meta !== undefined || value.errors !== undefined,
		{
			message: "Channex response must contain data, meta or errors",
		}
	)

const paginationSchema = z
	.object({
		page: z.coerce.number().int().positive().optional(),
		total: z.coerce.number().int().nonnegative().optional(),
		limit: z.coerce.number().int().positive().optional(),
	})
	.passthrough()

export type ChannexClientResponse = {
	data: unknown
	meta: unknown
	warnings: ChannelManagerWarning[]
	requestId: string
	latencyMs: number
}

export type ChannexPaginatedResult<T> = {
	items: T[]
	warnings: ChannelManagerWarning[]
	requestIds: string[]
	pageCount: number
}

type ChannexClientOptions = {
	apiKey: string
	mode: ChannelManagerMode
	timeoutMs?: number
	fetchImpl?: typeof fetch
	requestIdFactory?: () => string
}

function errorKind(status: number) {
	if (status === 401) return "authentication" as const
	if (status === 403) return "authorization" as const
	if (status === 404) return "not_found" as const
	if (status === 400 || status === 409 || status === 422) return "validation" as const
	if (status === 429) return "rate_limit" as const
	return "upstream" as const
}

function warningText(value: unknown): string {
	if (typeof value === "string") return value
	if (!value || typeof value !== "object") return "Channex rechazó un elemento."
	const row = value as Record<string, unknown>
	return String(
		row.title ?? row.message ?? row.detail ?? row.description ?? "Channex rechazó un elemento."
	)
}

function collectWarnings(value: unknown): ChannelManagerWarning[] {
	if (value == null) return []
	const rows = Array.isArray(value)
		? value
		: typeof value === "object"
			? Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
					Array.isArray(item) ? item.map((entry) => ({ key, entry })) : [{ key, entry: item }]
				)
			: [value]
	return rows.map((raw) => {
		const keyed = raw as { key?: unknown; entry?: unknown }
		const value = keyed.entry ?? raw
		const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
		const rawIndex = row.index ?? row.item_index ?? row.position
		const itemIndex = Number.isInteger(Number(rawIndex)) ? Number(rawIndex) : null
		return {
			code: String(row.code ?? keyed.key ?? "CHANNEX_WARNING"),
			message: warningText(value),
			itemIndex,
			details: value,
		}
	})
}

function responseRequestId(response: Response, fallback: string): string {
	return (
		response.headers.get("x-request-id") ??
		response.headers.get("request-id") ??
		response.headers.get("x-correlation-id") ??
		fallback
	)
}

export class ChannexHttpClient {
	private readonly baseUrl: string
	private readonly timeoutMs: number
	private readonly fetchImpl: typeof fetch
	private readonly requestIdFactory: () => string

	constructor(private readonly options: ChannexClientOptions) {
		this.baseUrl = CHANNEX_BASE_URLS[options.mode]
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
		this.fetchImpl = options.fetchImpl ?? fetch
		this.requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID())
	}

	async request(params: {
		method: "GET" | "POST"
		path: string
		query?: Record<string, string | number | null | undefined>
		body?: unknown
	}): Promise<ChannexClientResponse> {
		const requestId = this.requestIdFactory()
		const url = new URL(`${this.baseUrl}${params.path}`)
		for (const [key, value] of Object.entries(params.query ?? {})) {
			if (value != null && String(value).length > 0) url.searchParams.set(key, String(value))
		}
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), this.timeoutMs)
		const startedAt = Date.now()
		const serializedBody = params.body === undefined ? undefined : JSON.stringify(params.body)
		if (serializedBody && Buffer.byteLength(serializedBody, "utf8") > MAX_REQUEST_BYTES) {
			clearTimeout(timer)
			throw new ChannelManagerAdapterError({
				kind: "validation",
				message: "CHANNEX_REQUEST_TOO_LARGE",
				requestId,
				details: { maxBytes: MAX_REQUEST_BYTES },
			})
		}
		try {
			const response = await this.fetchImpl(url, {
				method: params.method,
				signal: controller.signal,
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/json",
					"user-api-key": this.options.apiKey,
					"User-Agent": "fastt-channex-adapter/1.0",
					"X-Request-ID": requestId,
				},
				body: serializedBody,
			})
			const resolvedRequestId = responseRequestId(response, requestId)
			let payload: unknown
			try {
				payload = await response.json()
			} catch (cause) {
				throw new ChannelManagerAdapterError({
					kind: "invalid_response",
					message: "CHANNEX_RESPONSE_NOT_JSON",
					status: response.status,
					requestId: resolvedRequestId,
					details: null,
					cause,
				})
			}
			if (!response.ok) {
				const kind = errorKind(response.status)
				throw new ChannelManagerAdapterError({
					kind,
					message: `CHANNEX_HTTP_${response.status}`,
					status: response.status,
					requestId: resolvedRequestId,
					retryable: kind === "rate_limit" || response.status >= 500,
					details: payload,
				})
			}
			const parsed = envelopeSchema.safeParse(payload)
			if (!parsed.success) {
				throw new ChannelManagerAdapterError({
					kind: "invalid_response",
					message: "CHANNEX_RESPONSE_SCHEMA_INVALID",
					status: response.status,
					requestId: resolvedRequestId,
					details: parsed.error.issues,
				})
			}
			if (parsed.data.errors !== undefined) {
				throw new ChannelManagerAdapterError({
					kind: "validation",
					message: "CHANNEX_SUCCESS_RESPONSE_CONTAINS_ERRORS",
					status: response.status,
					requestId: resolvedRequestId,
					details: parsed.data.errors,
				})
			}
			const meta = parsed.data.meta
			const metaWarnings =
				meta && typeof meta === "object" ? (meta as Record<string, unknown>).warnings : undefined
			return {
				data: parsed.data.data,
				meta,
				warnings: [...collectWarnings(parsed.data.warnings), ...collectWarnings(metaWarnings)],
				requestId: resolvedRequestId,
				latencyMs: Date.now() - startedAt,
			}
		} catch (error) {
			if (error instanceof ChannelManagerAdapterError) throw error
			if (error instanceof Error && error.name === "AbortError") {
				throw new ChannelManagerAdapterError({
					kind: "timeout",
					message: "CHANNEX_REQUEST_TIMEOUT",
					requestId,
					retryable: true,
					cause: error,
				})
			}
			throw new ChannelManagerAdapterError({
				kind: "network",
				message: "CHANNEX_NETWORK_ERROR",
				requestId,
				retryable: true,
				cause: error,
			})
		} finally {
			clearTimeout(timer)
		}
	}

	async paginate<T>(params: {
		path: string
		query?: Record<string, string | number | null | undefined>
		itemSchema: z.ZodType<T>
	}): Promise<ChannexPaginatedResult<T>> {
		const items: T[] = []
		const warnings: ChannelManagerWarning[] = []
		const requestIds: string[] = []
		let page = 1
		for (; page <= MAX_PAGES; page += 1) {
			const response = await this.request({
				method: "GET",
				path: params.path,
				query: {
					...params.query,
					"pagination[page]": page,
					"pagination[limit]": DEFAULT_PAGE_LIMIT,
				},
			})
			requestIds.push(response.requestId)
			warnings.push(...response.warnings)
			if (!Array.isArray(response.data)) {
				throw new ChannelManagerAdapterError({
					kind: "invalid_response",
					message: "CHANNEX_COLLECTION_DATA_INVALID",
					requestId: response.requestId,
					details: response.data,
				})
			}
			response.data.forEach((raw, index) => {
				const parsed = params.itemSchema.safeParse(raw)
				if (parsed.success) items.push(parsed.data)
				else {
					warnings.push({
						code: "CHANNEX_ITEM_SCHEMA_INVALID",
						message: `Elemento inválido en página ${page}.`,
						itemIndex: (page - 1) * DEFAULT_PAGE_LIMIT + index,
						details: parsed.error.issues,
					})
				}
			})
			const pagination = paginationSchema.safeParse(response.meta)
			const total = pagination.success ? pagination.data.total : undefined
			const limit = pagination.success
				? (pagination.data.limit ?? DEFAULT_PAGE_LIMIT)
				: DEFAULT_PAGE_LIMIT
			const isLastPage = total !== undefined ? page * limit >= total : response.data.length < limit
			if (isLastPage) break
		}
		if (page > MAX_PAGES) {
			throw new ChannelManagerAdapterError({
				kind: "invalid_response",
				message: "CHANNEX_PAGINATION_LIMIT_EXCEEDED",
				details: { maxPages: MAX_PAGES },
			})
		}
		return { items, warnings, requestIds, pageCount: page }
	}
}
