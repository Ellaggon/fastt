import type { APIRoute } from "astro"
import { db, and, CancellationTier, eq, Policy, PolicyGroup, PolicyRule } from "astro:db"
import { POLICY_PRESET_CATALOG } from "@/data/policy/policy-presets"
import { buildRefundQuote } from "@/modules/financial/public"
import { buildPolicySnapshot, type PolicyResolutionDTO } from "@/modules/policies/public"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyScopeIds } from "@/lib/policies/policyOwnership"

type PreviewBody = {
	mode?: "existing" | "preset"
	policyId?: string
	policyPresetKey?: string
	category?: string
	scope?: "product" | "variant" | "rate_plan"
	scopeId?: string
	channel?: string | null
	checkIn?: string
	checkOut?: string
	currency?: string
	grossAmount?: number
}

const categoryLabels: Record<string, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso y salida",
	NoShow: "No presentación",
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

function ensureOwnedScope(
	owned: Awaited<ReturnType<typeof getOwnedPolicyScopeIds>>,
	scope: string,
	scopeId: string
) {
	if (!scopeId) return true
	if (scope === "product") return owned.productIds.includes(scopeId)
	if (scope === "variant") return owned.variantIds.includes(scopeId)
	if (scope === "rate_plan") return owned.ratePlanIds.includes(scopeId)
	return false
}

function rulesObjectToRows(policyId: string, rules: Record<string, unknown> | undefined) {
	return Object.entries(rules ?? {}).map(([ruleKey, ruleValue], index) => ({
		id: `${policyId}:rule:${index}`,
		policyId,
		ruleKey,
		ruleValue,
	}))
}

function tiersToRows(policyId: string, tiers: unknown[] | undefined) {
	return (Array.isArray(tiers) ? tiers : []).map((tier: any, index) => ({
		id: `${policyId}:tier:${index}`,
		policyId,
		daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
		penaltyType: String(tier.penaltyType ?? "percentage"),
		penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
	}))
}

function buildResolvedDTO(params: {
	category: string
	policy: any
	checkIn: string
	rules: Array<{ id: string; policyId: string; ruleKey: string | null; ruleValue: unknown }>
	cancellationTiers: Array<{
		id: string
		policyId: string
		daysBeforeArrival: number
		penaltyType: string
		penaltyAmount: number | null
	}>
}): PolicyResolutionDTO {
	return {
		version: "v2",
		policies: [
			{
				category: params.category,
				resolvedFromScope: "rate_plan",
				policy: {
					id: String(params.policy.id),
					groupId: String(params.policy.groupId),
					description: String(params.policy.description ?? ""),
					version: Number(params.policy.version ?? 1),
					status: "active",
					policyPresetKey: params.policy.policyPresetKey ?? null,
					stayLengthType: params.policy.stayLengthType ?? null,
					gracePeriod: params.policy.gracePeriod == null ? null : Number(params.policy.gracePeriod),
					refundBasis: params.policy.refundBasis ?? null,
					payoutBasis: params.policy.payoutBasis ?? null,
					localTimezone: params.policy.localTimezone ?? "property_local",
					legalOverrideFlags: params.policy.legalOverrideFlags ?? null,
					rules: params.rules,
					cancellationTiers: params.cancellationTiers,
				},
			},
		],
		missingCategories: [],
		coverage: { hasFullCoverage: true },
		asOfDate: params.checkIn,
		warnings: [],
	}
}

async function loadExistingPolicy(providerId: string, policyId: string) {
	const rows = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			description: Policy.description,
			version: Policy.version,
			status: Policy.status,
			category: PolicyGroup.category,
			policyPresetKey: (Policy as any).policyPresetKey,
			stayLengthType: (Policy as any).stayLengthType,
			gracePeriod: (Policy as any).gracePeriod,
			refundBasis: (Policy as any).refundBasis,
			payoutBasis: (Policy as any).payoutBasis,
			localTimezone: (Policy as any).localTimezone,
			legalOverrideFlags: (Policy as any).legalOverrideFlags,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(and(eq(Policy.id, policyId), eq(PolicyGroup.ownerProviderId, providerId)))
		.limit(1)
		.all()
	const policy = rows[0] as any
	if (!policy) return null
	const [rules, tiers] = await Promise.all([
		db.select().from(PolicyRule).where(eq(PolicyRule.policyId, policyId)).all(),
		db.select().from(CancellationTier).where(eq(CancellationTier.policyId, policyId)).all(),
	])
	return {
		category: String(policy.category),
		policy,
		rules: (rules as any[]).map((rule) => ({
			id: String(rule.id),
			policyId: String(rule.policyId),
			ruleKey: rule.ruleKey == null ? null : String(rule.ruleKey),
			ruleValue: rule.ruleValue,
		})),
		cancellationTiers: (tiers as any[]).map((tier) => ({
			id: String(tier.id),
			policyId: String(tier.policyId),
			daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
			penaltyType: String(tier.penaltyType ?? "percentage"),
			penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
		})),
	}
}

function loadPresetPolicy(policyPresetKey: string, categoryHint?: string) {
	const preset = POLICY_PRESET_CATALOG.find((item) => item.key === policyPresetKey)
	if (!preset) return null
	const category = String(categoryHint || preset.category)
	const id = `preview:${preset.key}`
	return {
		category,
		policy: {
			id,
			groupId: `preview-group:${category}`,
			description: preset.guestFacing || preset.description || preset.name,
			version: 1,
			status: "active",
			policyPresetKey: preset.key,
			stayLengthType: preset.stayLengthType,
			gracePeriod: preset.gracePeriod,
			refundBasis: preset.refundBasis,
			payoutBasis: preset.payoutBasis,
			localTimezone: preset.localTimezone,
			legalOverrideFlags: preset.legalOverrideFlags ?? null,
		},
		rules: rulesObjectToRows(id, preset.rules),
		cancellationTiers: tiersToRows(
			id,
			"cancellationTiers" in preset ? (preset.cancellationTiers ?? []) : []
		),
	}
}

function quoteFor(params: {
	snapshot: ReturnType<typeof buildPolicySnapshot>
	cancelledAt: Date
	bookedAt: Date
	currency: string
	grossAmount: number
	id: string
	providerId: string
}) {
	return buildRefundQuote({
		bookingId: `preview-booking:${params.id}`,
		providerId: params.providerId,
		reason: "policy_preview",
		currency: params.currency,
		grossAmount: params.grossAmount,
		cancelledAt: params.cancelledAt,
		bookedAt: params.bookedAt,
		policySnapshot: params.snapshot,
		lines: [
			{ type: "base", label: "Tarifa", amount: Math.round(params.grossAmount * 0.8 * 100) / 100 },
			{
				type: "tax",
				label: "Impuestos",
				amount: Math.round(params.grossAmount * 0.12 * 100) / 100,
			},
			{ type: "fee", label: "Cargos", amount: Math.round(params.grossAmount * 0.08 * 100) / 100 },
		],
		idempotencyKey: `policy-preview:${params.id}:${params.cancelledAt.toISOString()}`,
	})
}

function noShowValue(snapshot: ReturnType<typeof buildPolicySnapshot>) {
	const noShow = snapshot.no_show?.calculation?.noShow
	if (!noShow) return "Se resolverá con la condición No presentación asignada."
	if (noShow.chargeType === "waived") return "Cargo eximido por excepción vigente."
	if (noShow.chargeType === "first_night") return "Se cobra la primera noche."
	if (noShow.chargeType === "full") return "Se cobra la estadía completa."
	if (noShow.chargeType === "percentage") return `Se cobra ${percent(noShow.chargeAmount)}.`
	return `Cargo: ${noShow.chargeType || "revisión manual"}.`
}

function paymentDueValue(snapshot: ReturnType<typeof buildPolicySnapshot>) {
	const payment = snapshot.payment?.calculation?.payment
	if (!payment) return "Se resolverá con la condición Pago asignada."
	if (payment.paymentType === "pay_at_property") return "El huésped paga en la propiedad."
	if (payment.paymentType === "prepayment") {
		return `${percent(payment.prepaymentPercentage)} vence en ${payment.paymentDueLocal ?? "fecha local pendiente"}.`
	}
	return "Pago pendiente requiere revisión manual."
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const body = (await request.json().catch(() => ({}))) as PreviewBody
	const mode = body.mode === "preset" ? "preset" : "existing"
	const scope = String(body.scope ?? "rate_plan")
	const scopeId = String(body.scopeId ?? "").trim()
	const owned = await getOwnedPolicyScopeIds(providerId)
	if (!ensureOwnedScope(owned, scope, scopeId)) {
		return new Response(JSON.stringify({ error: "scope_not_found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const today = new Date()
	const checkIn = String(body.checkIn ?? "").trim() || addDays(today.toISOString().slice(0, 10), 14)
	const checkOut = String(body.checkOut ?? "").trim() || addDays(checkIn, 2)
	const currency =
		String(body.currency ?? "BOB")
			.trim()
			.toUpperCase() || "BOB"
	const grossAmount = Number.isFinite(Number(body.grossAmount)) ? Number(body.grossAmount) : 1000
	const selected =
		mode === "preset"
			? loadPresetPolicy(String(body.policyPresetKey ?? ""), String(body.category ?? ""))
			: await loadExistingPolicy(providerId, String(body.policyId ?? ""))

	if (!selected) {
		return new Response(JSON.stringify({ error: "policy_source_not_found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const resolved = buildResolvedDTO({
		category: selected.category,
		policy: selected.policy,
		checkIn,
		rules: selected.rules,
		cancellationTiers: selected.cancellationTiers,
	})
	const snapshot = buildPolicySnapshot({
		resolvedPolicies: resolved,
		checkIn,
		checkOut,
		channel: body.channel ?? null,
	})
	const longStaySnapshot = buildPolicySnapshot({
		resolvedPolicies: resolved,
		checkIn,
		checkOut: addDays(checkIn, 28),
		channel: body.channel ?? null,
	})
	const bookedAt = new Date(today.getTime() - 2 * 60 * 60 * 1000)
	const todayQuote = quoteFor({
		snapshot,
		cancelledAt: today,
		bookedAt,
		currency,
		grossAmount,
		id: "today",
		providerId,
	})
	const weekQuote = quoteFor({
		snapshot,
		cancelledAt: dateAtUtcNoon(addDays(checkIn, -7)),
		bookedAt,
		currency,
		grossAmount,
		id: "seven-days",
		providerId,
	})
	const longQuote = quoteFor({
		snapshot: longStaySnapshot,
		cancelledAt: today,
		bookedAt,
		currency,
		grossAmount,
		id: "long-stay",
		providerId,
	})

	const taxFeeLineAmount = todayQuote.taxFeeRefundAmount
	const hostPayoutAmount = todayQuote.policySnapshot.hostPayoutAmount
	const preview = [
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

	return new Response(
		JSON.stringify({
			success: true,
			source: {
				mode,
				category: selected.category,
				categoryLabel: categoryLabels[selected.category] ?? selected.category,
				description: selected.policy.description,
				policyId: selected.policy.id,
				policyPresetKey: selected.policy.policyPresetKey ?? null,
			},
			snapshot,
			quotes: {
				cancelToday: todayQuote,
				cancelSevenDaysBefore: weekQuote,
				longStay: longQuote,
			},
			preview,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
