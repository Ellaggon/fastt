import type { PolicyExceptionRule } from "@/modules/policies/public"
import {
	buildPolicySnapshot,
	type HoldPolicySnapshot,
	type ResolveEffectivePoliciesResult,
} from "@/modules/policies/public"
import type { RefundQuote } from "../../domain/refund-quote"
import { buildRefundQuote, type RefundQuoteMoneyLine } from "./build-refund-quote"

export type PolicyFinancialPreviewItem = {
	key:
		| "cancel_today"
		| "cancel_7_days"
		| "long_stay_28"
		| "taxes_fees"
		| "provider_payout"
		| "no_show"
		| "payment_due"
	label: string
	value: string
	detail: string
}

export type PolicyFinancialPreviewResult = {
	snapshot: HoldPolicySnapshot
	longStaySnapshot: HoldPolicySnapshot
	quotes: {
		cancelToday: RefundQuote
		cancelSevenDaysBefore: RefundQuote
		longStay: RefundQuote
	}
	preview: PolicyFinancialPreviewItem[]
}

export type BuildPolicyFinancialPreviewFromSnapshotInput = {
	providerId: string
	bookingId?: string | null
	snapshot: HoldPolicySnapshot
	longStaySnapshot?: HoldPolicySnapshot | null
	currency: string
	grossAmount: number
	cancelledAt?: Date
	bookedAt?: Date | null
	reason?: string
	lines?: RefundQuoteMoneyLine[]
	idPrefix?: string
}

export type BuildPolicyFinancialPreviewFromResolutionInput = {
	providerId: string
	resolvedPolicies: ResolveEffectivePoliciesResult
	checkIn: string
	checkOut: string
	channel?: string | null
	currency: string
	grossAmount: number
	cancelledAt?: Date
	bookedAt?: Date | null
	reason?: string
	lines?: RefundQuoteMoneyLine[]
	idPrefix?: string
	exceptionRules?: PolicyExceptionRule[]
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${String(dateOnly).slice(0, 10)}T00:00:00.000Z`)
	if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function dateAtUtcNoon(dateOnly: string): Date {
	const date = new Date(`${String(dateOnly).slice(0, 10)}T12:00:00.000Z`)
	return Number.isNaN(date.getTime()) ? new Date() : date
}

function money(value: unknown, currency: string): string {
	const amount = Number(value ?? 0)
	return `${currency} ${Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100}`
}

function percent(value: unknown): string {
	const n = Number(value)
	return Number.isFinite(n) ? `${Math.round(n * 100) / 100}%` : "revisión manual"
}

function defaultPreviewLines(grossAmount: number): RefundQuoteMoneyLine[] {
	return [
		{ type: "base", label: "Tarifa", amount: Math.round(grossAmount * 0.8 * 100) / 100 },
		{ type: "tax", label: "Impuestos", amount: Math.round(grossAmount * 0.12 * 100) / 100 },
		{ type: "fee", label: "Cargos", amount: Math.round(grossAmount * 0.08 * 100) / 100 },
	]
}

function quoteFor(params: {
	snapshot: HoldPolicySnapshot
	cancelledAt: Date
	bookedAt: Date | null
	currency: string
	grossAmount: number
	id: string
	providerId: string
	bookingId?: string | null
	reason: string
	lines?: RefundQuoteMoneyLine[]
	idPrefix: string
}) {
	const bookingId = String(params.bookingId ?? "").trim() || `${params.idPrefix}:booking`
	return buildRefundQuote({
		bookingId: `${bookingId}:${params.id}`,
		providerId: params.providerId,
		reason: params.reason,
		currency: params.currency,
		grossAmount: params.grossAmount,
		cancelledAt: params.cancelledAt,
		bookedAt: params.bookedAt,
		policySnapshot: params.snapshot,
		lines: params.lines?.length ? params.lines : defaultPreviewLines(params.grossAmount),
		idempotencyKey: `${params.idPrefix}:${params.id}:${params.cancelledAt.toISOString()}`,
	})
}

function noShowValue(snapshot: HoldPolicySnapshot) {
	const noShow = snapshot.no_show?.calculation?.noShow
	if (!noShow) return "Se resolverá con la condición No presentación asignada."
	if (noShow.chargeType === "waived") return "Cargo eximido por excepción vigente."
	if (noShow.chargeType === "first_night") return "Se cobra la primera noche."
	if (noShow.chargeType === "full") return "Se cobra la estadía completa."
	if (noShow.chargeType === "percentage") return `Se cobra ${percent(noShow.chargeAmount)}.`
	return `Cargo: ${noShow.chargeType || "revisión manual"}.`
}

function paymentDueValue(snapshot: HoldPolicySnapshot) {
	const payment = snapshot.payment?.calculation?.payment
	if (!payment) return "Se resolverá con la condición Pago asignada."
	if (payment.paymentType === "pay_at_property") return "El huésped paga en la propiedad."
	if (payment.paymentType === "prepayment") {
		return `${percent(payment.prepaymentPercentage)} vence en ${
			payment.paymentDueLocal ?? "fecha local pendiente"
		}.`
	}
	return "Pago pendiente requiere revisión manual."
}

export function buildPolicyFinancialPreviewFromSnapshot(
	input: BuildPolicyFinancialPreviewFromSnapshotInput
): PolicyFinancialPreviewResult {
	const providerId = String(input.providerId ?? "").trim()
	const currency =
		String(input.currency ?? "")
			.trim()
			.toUpperCase() || "BOB"
	const grossAmount = Number.isFinite(Number(input.grossAmount)) ? Number(input.grossAmount) : 0
	const cancelledAt = input.cancelledAt ?? new Date()
	const bookedAt = input.bookedAt ?? new Date(cancelledAt.getTime() - 2 * 60 * 60 * 1000)
	const idPrefix = String(input.idPrefix ?? "policy-financial-preview").trim()
	const reason = String(input.reason ?? "policy_preview")
	const snapshot = input.snapshot
	const longStaySnapshot = input.longStaySnapshot ?? snapshot
	const checkIn = snapshot.meta?.checkIn || cancelledAt.toISOString().slice(0, 10)

	const todayQuote = quoteFor({
		snapshot,
		cancelledAt,
		bookedAt,
		currency,
		grossAmount,
		id: "cancel_today",
		providerId,
		bookingId: input.bookingId,
		reason,
		lines: input.lines,
		idPrefix,
	})
	const weekQuote = quoteFor({
		snapshot,
		cancelledAt: dateAtUtcNoon(addDays(checkIn, -7)),
		bookedAt,
		currency,
		grossAmount,
		id: "cancel_7_days",
		providerId,
		bookingId: input.bookingId,
		reason,
		lines: input.lines,
		idPrefix,
	})
	const longQuote = quoteFor({
		snapshot: longStaySnapshot,
		cancelledAt,
		bookedAt,
		currency,
		grossAmount,
		id: "long_stay_28",
		providerId,
		bookingId: input.bookingId,
		reason,
		lines: input.lines,
		idPrefix,
	})

	const taxFeeLineAmount = todayQuote.taxFeeRefundAmount
	const hostPayoutAmount = todayQuote.policySnapshot.hostPayoutAmount
	const preview: PolicyFinancialPreviewItem[] = [
		{
			key: "cancel_today",
			label: "Cancela hoy",
			value: `${money(todayQuote.refundAmount, currency)} de reembolso · ${percent(todayQuote.refundPercent)}`,
			detail: `Deadline local: ${todayQuote.cancellationDeadlineLocal ?? "revisión manual"}.`,
		},
		{
			key: "cancel_7_days",
			label: "Cancela 7 días antes",
			value: `${money(weekQuote.refundAmount, currency)} de reembolso · ${percent(weekQuote.refundPercent)}`,
			detail: `Deadline local: ${weekQuote.cancellationDeadlineLocal ?? "revisión manual"}.`,
		},
		{
			key: "long_stay_28",
			label: "28+ noches",
			value: `${money(longQuote.refundAmount, currency)} de reembolso en ejemplo de 28 noches.`,
			detail: longStaySnapshot.cancellation?.calculation?.cancellation?.stayLength?.isLongStay
				? "Se evalúa como estadía larga."
				: "No cambia a estadía larga para esta condición.",
		},
		{
			key: "taxes_fees",
			label: "Impuestos/cargos",
			value: `${money(taxFeeLineAmount, currency)} reembolsable en el ejemplo.`,
			detail: `Base: ${todayQuote.policySnapshot.taxesFeesBasis ?? "manual"}.`,
		},
		{
			key: "provider_payout",
			label: "Payout proveedor",
			value:
				hostPayoutAmount == null
					? "Requiere revisión manual."
					: `${money(hostPayoutAmount, currency)} estimado para proveedor.`,
			detail: `Impacto de payout: ${money(todayQuote.payoutImpactAmount, currency)}.`,
		},
		{
			key: "no_show",
			label: "No presentación",
			value: noShowValue(snapshot),
			detail: `Base: ${snapshot.no_show?.calculation?.noShow?.chargeBasis ?? "condición asignada"}.`,
		},
		{
			key: "payment_due",
			label: "Pago pendiente",
			value: paymentDueValue(snapshot),
			detail: `Fecha local: ${todayQuote.paymentDueLocal ?? "sin vencimiento en plataforma"}.`,
		},
	]

	return {
		snapshot,
		longStaySnapshot,
		quotes: {
			cancelToday: todayQuote,
			cancelSevenDaysBefore: weekQuote,
			longStay: longQuote,
		},
		preview,
	}
}

export function buildPolicyFinancialPreviewFromResolution(
	input: BuildPolicyFinancialPreviewFromResolutionInput
): PolicyFinancialPreviewResult {
	const cancelledAt = input.cancelledAt ?? new Date()
	const snapshot = buildPolicySnapshot({
		resolvedPolicies: input.resolvedPolicies,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		channel: input.channel ?? null,
		resolvedAt: cancelledAt,
		exceptionRules: input.exceptionRules,
	})
	const longStaySnapshot = buildPolicySnapshot({
		resolvedPolicies: input.resolvedPolicies,
		checkIn: input.checkIn,
		checkOut: addDays(input.checkIn, 28),
		channel: input.channel ?? null,
		resolvedAt: cancelledAt,
		exceptionRules: input.exceptionRules,
	})
	return buildPolicyFinancialPreviewFromSnapshot({
		providerId: input.providerId,
		snapshot,
		longStaySnapshot,
		currency: input.currency,
		grossAmount: input.grossAmount,
		cancelledAt,
		bookedAt: input.bookedAt,
		reason: input.reason,
		lines: input.lines,
		idPrefix: input.idPrefix ?? "policy-preview",
	})
}
