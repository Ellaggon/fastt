import type { APIRoute } from "astro"

import { paymentTransactionRepository } from "@/container/financial.container"
import type {
	PaymentTransactionSource,
	PaymentTransactionStatus,
	PaymentTransactionType,
} from "@/modules/financial/public"

import { bookingBelongsToProvider, json, readJson, requireFinancialProvider } from "./_stage2"

const allowedTypes = new Set(["intent", "authorization", "capture", "void", "refund"])
const allowedStatuses = new Set([
	"created",
	"visible",
	"recorded",
	"failed",
	"cancelled",
	"unknown",
])
const allowedSources = new Set(["import", "operator_entry", "financial_shadow_bridge"])

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const url = new URL(request.url)
	const bookingIds = String(url.searchParams.get("bookingIds") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)
	const type = String(url.searchParams.get("type") ?? "all").trim()
	const limit = Number(url.searchParams.get("limit") ?? 500)
	const items = await paymentTransactionRepository.findByProvider({
		providerId: auth.providerId,
		bookingIds,
		type: allowedTypes.has(type) ? (type as PaymentTransactionType) : "all",
		limit: Number.isFinite(limit) ? limit : 500,
	})
	return json({ items, readOnly: true })
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const body = await readJson(request)
	const bookingId = String(body.bookingId ?? "").trim()
	const type = String(body.type ?? "").trim() as PaymentTransactionType
	const status = String(body.status ?? "visible").trim() as PaymentTransactionStatus
	const externalReference = String(body.externalReference ?? "").trim()
	const pspProvider = String(body.pspProvider ?? "").trim()
	const source = String(body.source ?? "import").trim() as PaymentTransactionSource
	const amount = Number(body.amount)
	const currency = String(body.currency ?? "")
		.trim()
		.toUpperCase()
	const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : new Date()
	if (
		!allowedTypes.has(type) ||
		!allowedStatuses.has(status) ||
		!externalReference ||
		!pspProvider ||
		!allowedSources.has(source) ||
		!Number.isFinite(amount) ||
		!currency ||
		Number.isNaN(occurredAt.getTime())
	) {
		return json({ error: "validation_error" }, 400)
	}
	if (bookingId && !(await bookingBelongsToProvider(bookingId, auth.providerId)))
		return json({ error: "not_found" }, 404)
	const idempotencyKey =
		String(body.idempotencyKey ?? "").trim() ||
		`payment_transaction:${auth.providerId}:${pspProvider}:${type}:${externalReference}`
	const result = await paymentTransactionRepository.createIfAbsent({
		bookingId:
			bookingId || `unmatched:${auth.providerId}:${pspProvider}:${type}:${externalReference}`,
		providerId: auth.providerId,
		type,
		status,
		amount,
		currency,
		externalReference,
		pspProvider,
		idempotencyKey,
		occurredAt,
		source,
	})
	return json(
		{
			...result,
			diagnostic: result.created ? "transaction evidence recorded" : "duplicate reference visible",
		},
		result.created ? 201 : 200
	)
}
