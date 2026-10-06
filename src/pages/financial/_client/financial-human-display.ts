import { financialBookingDetailHref } from "./financial-navigation-scope"
import {
	financialProductNameFallback,
	financialVariantNameFallback,
	normalizeItemVertical,
} from "./financial-ops-vocabulary"

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

export type FinancialHumanContext = {
	bookingId?: unknown
	providerId?: unknown
	productId?: unknown
	/** The booking's own vertical (tour/hotel), independent of the workspace scope. */
	vertical?: unknown
	reservationCode?: unknown
	bookingCode?: unknown
	confirmationCode?: unknown
	guestName?: unknown
	providerName?: unknown
	productName?: unknown
	variantName?: unknown
	checkIn?: unknown
	checkOut?: unknown
	amount?: unknown
	currency?: unknown
}

export function compactIdentifier(value: unknown, prefix = "ID"): string {
	const raw = String(value ?? "").trim()
	if (!raw) return `Sin ${prefix.toLowerCase()}`
	if (raw.length <= 14) return `${prefix} ${raw}`
	const numeric = raw.match(/\d{3,}/)?.[0]
	if (numeric) return `${prefix} #${numeric.slice(-5)}`
	return `${prefix} ${raw.slice(0, 6)}...${raw.slice(-4)}`
}

function firstText(...values: unknown[]): string | null {
	for (const value of values) {
		const text = String(value ?? "").trim()
		if (text) return text
	}
	return null
}

function readPath(source: any, path: string): unknown {
	return path.split(".").reduce((current, key) => current?.[key], source)
}

function dateLabel(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	if (!raw) return null
	if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
		const [, month, day] = raw.slice(0, 10).split("-")
		return `${day}/${month}`
	}
	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) return null
	return new Intl.DateTimeFormat("es", { day: "2-digit", month: "2-digit" }).format(parsed)
}

function contextFromOperation(operation: any): FinancialHumanContext {
	return {
		bookingId: operation?.bookingId,
		providerId: operation?.providerId,
		productId: operation?.contract?.productId || operation?.productId,
		vertical: normalizeItemVertical(
			operation?.contract?.vertical ||
				operation?.vertical ||
				operation?.contract?.commercialLine ||
				operation?.commercialLine
		),
		productName: operation?.contract?.productName || operation?.productName,
		variantName: operation?.contract?.variantName || operation?.variantName,
		checkIn: operation?.stay?.checkIn || operation?.checkInDate || operation?.checkIn,
		checkOut: operation?.stay?.checkOut || operation?.checkOutDate || operation?.checkOut,
		amount: operation?.contractTotal || operation?.totalAmount,
		currency: operation?.currency,
	}
}

function mergeContext(
	...contexts: Array<FinancialHumanContext | null | undefined>
): FinancialHumanContext {
	return contexts.reduce<FinancialHumanContext>(
		(merged, context) => ({ ...merged, ...(context || {}) }),
		{}
	)
}

export function buildFinancialHumanContext(
	raw: any = {},
	fallback: any = {}
): FinancialHumanContext {
	const operation = raw?.operation || fallback?.operation || raw
	return mergeContext(contextFromOperation(operation), {
		bookingId: firstText(
			fallback?.bookingId,
			raw?.bookingId,
			operation?.bookingId,
			readPath(raw, "booking.id")
		),
		providerId: firstText(fallback?.providerId, raw?.providerId, operation?.providerId),
		productId: firstText(
			fallback?.productId,
			raw?.productId,
			raw?.productIdSnapshot,
			readPath(raw, "contract.productId"),
			readPath(operation, "contract.productId"),
			operation?.productId,
			operation?.productIdSnapshot
		),
		vertical: normalizeItemVertical(
			firstText(
				fallback?.vertical,
				raw?.vertical,
				raw?.commercialLine,
				readPath(raw, "contract.vertical"),
				readPath(raw, "contract.commercialLine"),
				readPath(operation, "contract.vertical"),
				readPath(operation, "contract.commercialLine"),
				operation?.vertical,
				operation?.commercialLine
			)
		),
		reservationCode: firstText(
			raw?.reservationCode,
			raw?.bookingCode,
			raw?.confirmationCode,
			operation?.reservationCode,
			operation?.bookingCode
		),
		guestName: firstText(
			raw?.guestName,
			raw?.guestNameSnapshot,
			operation?.guestName,
			operation?.guestNameSnapshot
		),
		providerName: firstText(
			raw?.providerName,
			raw?.provider?.name,
			raw?.propertyName,
			raw?.lodgingName,
			operation?.providerName
		),
		productName: firstText(
			raw?.productName,
			raw?.productNameSnapshot,
			readPath(raw, "contract.productName"),
			readPath(operation, "contract.productName"),
			operation?.productName
		),
		variantName: firstText(
			raw?.variantName,
			raw?.variantNameSnapshot,
			readPath(raw, "contract.variantName"),
			readPath(operation, "contract.variantName"),
			operation?.variantName
		),
		checkIn: firstText(
			raw?.checkInDate,
			raw?.checkIn,
			readPath(raw, "stay.checkIn"),
			readPath(operation, "stay.checkIn"),
			operation?.checkInDate
		),
		checkOut: firstText(
			raw?.checkOutDate,
			raw?.checkOut,
			readPath(raw, "stay.checkOut"),
			readPath(operation, "stay.checkOut"),
			operation?.checkOutDate
		),
		amount:
			raw?.contractTotal ?? raw?.totalAmount ?? operation?.contractTotal ?? operation?.totalAmount,
		currency: firstText(raw?.currency, operation?.currency),
	})
}

export function buildBookingContextIndex(
	operationsPayload: any
): Map<string, FinancialHumanContext> {
	const items: any[] = Array.isArray(operationsPayload?.items) ? operationsPayload.items : []
	return new Map(
		items
			.map(
				(item: any) => [String(item?.bookingId || ""), buildFinancialHumanContext(item)] as const
			)
			.filter((entry): entry is readonly [string, FinancialHumanContext] => Boolean(entry[0]))
	)
}

export function resolveBookingContext(
	bookingId: unknown,
	raw: any = {},
	contextIndex?: Map<string, FinancialHumanContext>
): FinancialHumanContext {
	const key = String(bookingId || raw?.bookingId || raw?.operation?.bookingId || "")
	return mergeContext(contextIndex?.get(key), buildFinancialHumanContext(raw, { bookingId }))
}

export function bookingReservaDrawerLink(bookingId: unknown, context: any = {}): string {
	const id = String(bookingId ?? "").trim()
	const label = bookingDisplayName(bookingId, context)
	if (!id || id === "Sin reserva" || id.includes(",")) return escapeHtml(label)
	return `<a class="text-slate-900 hover:text-slate-700" href="${financialBookingDetailHref(id)}" data-astro-reload>${escapeHtml(label)}</a>`
}

export function financialDrawerReservaRow(bookingId: unknown, context: any = {}): string {
	return `<div class="fastt-drawer-soft-card p-4"><p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Reserva</p><p class="mt-2 text-sm font-semibold text-slate-900">${bookingReservaDrawerLink(bookingId, context)}</p></div>`
}

export function bookingDisplayName(value: unknown, context: any = {}): string {
	const humanContext = buildFinancialHumanContext(context, { bookingId: value })
	const explicit = firstText(
		humanContext.reservationCode,
		context?.reservationCode,
		context?.bookingCode,
		context?.confirmationCode
	)
	if (explicit) return `Reserva ${explicit}`
	return compactIdentifier(value || humanContext.bookingId, "Reserva")
}

export function bookingSubtitle(context: any = {}): string {
	const humanContext = buildFinancialHumanContext(context)
	const product = firstText(
		humanContext.productName,
		financialProductNameFallback(humanContext.vertical)
	)
	const variant = firstText(
		humanContext.variantName,
		financialVariantNameFallback(humanContext.vertical)
	)
	const checkIn = dateLabel(humanContext.checkIn)
	const checkOut = dateLabel(humanContext.checkOut)
	const stay = checkIn && checkOut ? ` · ${checkIn}-${checkOut}` : ""
	const guest = humanContext.guestName ? ` · ${humanContext.guestName}` : ""
	return `${product} · ${variant}${stay}${guest}`
}

export function providerDisplayName(value: unknown, context: any = {}): string {
	const humanContext = buildFinancialHumanContext(context, { providerId: value })
	const explicit = firstText(
		humanContext.providerName,
		context?.providerName,
		context?.provider?.name,
		context?.propertyName,
		context?.lodgingName
	)
	if (explicit) return explicit
	return compactIdentifier(value || humanContext.providerId, "Proveedor")
}

export function maskExternalReference(value: unknown, system?: unknown): string {
	const raw = String(value ?? "").trim()
	const provider = String(system ?? "").trim()
	if (!raw || raw === "Sin referencia visible") return "Sin referencia visible"
	const suffix = raw.length <= 8 ? raw : raw.slice(-4)
	const systemLabel = provider && provider !== "Por identificar" ? provider : "Referencia"
	return `${systemLabel} · termina en ${suffix}`
}

export function technicalReference(value: unknown): string {
	const raw = String(value ?? "").trim()
	return raw || "Sin referencia visible"
}

export function stateDotClass(
	kind: "blocked" | "waiting" | "ready" | "closed" | "neutral"
): string {
	const classes = {
		blocked: "bg-amber-500",
		waiting: "bg-sky-500",
		ready: "bg-emerald-500",
		closed: "bg-slate-400",
		neutral: "bg-slate-400",
	}
	return classes[kind]
}
