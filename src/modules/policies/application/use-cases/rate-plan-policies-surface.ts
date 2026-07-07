import {
	buildPolicySnapshot,
	derivePolicySummaryFromResolvedPolicies,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { resolvePolicyPreset } from "@/data/policy/policy-presets"
import { logger } from "@/lib/observability/logger"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { logPolicyContractMismatch } from "@/lib/observability/migration-logger"
import type { FeatureFlagContext } from "@/config/featureFlags"
import { PolicyExceptionRuleRepository } from "../../infrastructure/repositories/PolicyExceptionRuleRepository"

export const REQUIRED_POLICY_CATEGORIES = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

export const POLICY_CATEGORY_ORDER: Record<string, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso/salida",
	NoShow: "No presentación",
}

type SurfaceRatePlan = {
	id: string
	name: string
	isDefault?: boolean | null
}

export type PolicyPlanView = {
	ratePlanId: string
	ratePlanName: string
	isDefault: boolean
	coverageCount: number
	missingCategories: string[]
	isSellableByContract: boolean
	sellabilityLabel: string
	policySummary: string
	inheritanceByCategory: Record<string, string>
	overrideSummaryByCategory: Record<string, string>
	snapshotPreviewByCategory: Record<string, string>
	snapshotVersionIds: string[]
	snapshotResolvedAt: string
	contractFacts: {
		cancellationPreset: string
		cancellationDeadline: string
		cancellationPenalty: string
		noShowCharge: string
		paymentTiming: string
		paymentAmount: string
		paymentGuarantee: string
		arrivalSchedule: string
		arrivalSource: string
	}
}

const scopeLabels: Record<string, string> = {
	rate_plan: "Tarifa",
	variant: "Habitación",
	product: "Hotel",
	global: "Global",
}

const snapshotKeysByCategory: Record<string, "cancellation" | "payment" | "no_show" | "check_in"> =
	{
		Cancellation: "cancellation",
		Payment: "payment",
		NoShow: "no_show",
		CheckIn: "check_in",
	}

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return toISODateOnly(date)
}

export function resolvePolicyDateRange(url: URL): { checkIn: string; checkOut: string } {
	const checkIn = String(url.searchParams.get("checkIn") ?? "").trim() || toISODateOnly(new Date())
	const checkOut = String(url.searchParams.get("checkOut") ?? "").trim() || addDays(checkIn, 1)
	return { checkIn, checkOut }
}

function sourceLabel(scope: unknown) {
	return scopeLabels[String(scope ?? "")] ?? String(scope ?? "Sin fuente")
}

function overrideLabel(snapshotItem: any) {
	const applied = Array.isArray(snapshotItem?.appliedOverrides) ? snapshotItem.appliedOverrides : []
	if (!applied.length) return "Sin overrides activos"
	const first = applied[0]
	return `${String(first.type ?? "Override")} · ${String(first.reason ?? "sin razón")}`
}

function ruleMap(policyItem: any): Record<string, unknown> {
	const rules = Array.isArray(policyItem?.policy?.rules) ? policyItem.policy.rules : []
	return Object.fromEntries(
		rules
			.map((rule: any) => [String(rule?.ruleKey ?? "").trim(), rule?.ruleValue] as const)
			.filter(([key]: readonly [string, unknown]) => Boolean(key))
	)
}

function presetName(policyItem: any, fallback: string): string {
	const preset = resolvePolicyPreset(policyItem?.policy?.policyPresetKey, policyItem?.category)
	return preset?.name ?? fallback
}

function pluralDays(days: number): string {
	return `${days} día${days === 1 ? "" : "s"}`
}

function penaltyLabel(type: unknown, amount: unknown): string {
	const normalizedType = String(type ?? "").toLowerCase()
	const numericAmount = Number(amount)
	if (normalizedType === "percentage" && Number.isFinite(numericAmount)) {
		if (numericAmount <= 0) return "Sin cargo"
		return `${Math.round(numericAmount)}% de la reserva`
	}
	if (normalizedType === "first_night") return "Primera noche"
	if (normalizedType === "full") return "Estadía completa"
	if (normalizedType === "fixed" && Number.isFinite(numericAmount)) {
		return `Importe fijo ${numericAmount}`
	}
	if (normalizedType === "waived") return "Sin cargo"
	return "Según la condición elegida"
}

function buildContractFacts(resolved: any, snapshot: any) {
	const byCategory = Object.fromEntries(
		REQUIRED_POLICY_CATEGORIES.map((category) => [
			category,
			resolved.policies.find((item: any) => String(item.category) === category) ?? null,
		])
	)

	const cancellation = byCategory.Cancellation
	const payment = byCategory.Payment
	const noShow = byCategory.NoShow
	const arrival = byCategory.CheckIn
	const cancellationCalculation = snapshot.cancellation?.calculation?.cancellation
	const paymentCalculation = snapshot.payment?.calculation?.payment
	const noShowCalculation = snapshot.no_show?.calculation?.noShow
	const cancellationTiers = Array.isArray(cancellationCalculation?.refundTiers)
		? cancellationCalculation.refundTiers
		: []
	const freeTier = cancellationTiers.find((tier: any) => Number(tier?.refundPercent ?? -1) >= 100)
	const chargedTiers = cancellationTiers.filter((tier: any) => Number(tier?.penaltyAmount ?? 0) > 0)
	const penaltyValues = Array.from(
		new Set(chargedTiers.map((tier: any) => penaltyLabel(tier.penaltyType, tier.penaltyAmount)))
	)
	const paymentRules = ruleMap(payment)
	const arrivalRules = ruleMap(arrival)
	const paymentType = String(paymentCalculation?.paymentType ?? paymentRules.paymentType ?? "")
	const prepaymentPercentage = Number(
		paymentCalculation?.prepaymentPercentage ?? paymentRules.prepaymentPercentage
	)
	const prepaymentDays = Number(paymentRules.prepaymentDaysBeforeArrival ?? 0)

	return {
		cancellationPreset: cancellation
			? presetName(cancellation, "Condición personalizada")
			: "Sin configurar",
		cancellationDeadline: cancellation
			? freeTier
				? `Hasta ${pluralDays(Number(freeTier.daysBeforeArrival ?? 0))} antes`
				: "Sin cancelación gratuita"
			: "Sin configurar",
		cancellationPenalty: cancellation
			? penaltyValues.length
				? penaltyValues.join(" o ")
				: "Sin penalidad configurada"
			: "Sin configurar",
		noShowCharge: noShow
			? penaltyLabel(noShowCalculation?.chargeType, noShowCalculation?.chargeAmount)
			: "Sin configurar",
		paymentTiming: payment
			? paymentType === "pay_at_property"
				? "Al llegar al alojamiento"
				: prepaymentDays > 0
					? `${pluralDays(prepaymentDays)} antes de la llegada`
					: "Antes de la llegada"
			: "Sin configurar",
		paymentAmount: payment
			? paymentType === "pay_at_property"
				? "El alojamiento cobra el total"
				: Number.isFinite(prepaymentPercentage) && prepaymentPercentage > 0
					? `${Math.round(prepaymentPercentage)}% de la reserva`
					: "Importe pendiente de definir"
			: "Sin configurar",
		paymentGuarantee: payment
			? paymentType === "pay_at_property"
				? "Sin prepago en plataforma"
				: Number.isFinite(prepaymentPercentage) && prepaymentPercentage < 100
					? `Depósito del ${Math.round(prepaymentPercentage)}%`
					: "Prepago total"
			: "Sin configurar",
		arrivalSchedule: arrival
			? `Llegada ${String(arrivalRules.checkInFrom ?? "por definir")}–${String(
					arrivalRules.checkInUntil ?? "por definir"
				)} · salida hasta ${String(arrivalRules.checkOutUntil ?? "por definir")}`
			: "Sin horarios configurados",
		arrivalSource: arrival ? sourceLabel(arrival.resolvedFromScope) : "Hotel",
	}
}

function snapshotLabel(category: string, snapshotItem: any) {
	if (!snapshotItem) return "Sin snapshot: falta condición aplicable."
	if (category === "Cancellation") {
		const tiers = snapshotItem.calculation?.cancellation?.refundTiers ?? []
		const deadline = snapshotItem.calculation?.cancellation?.freeCancellationDeadlineLocal
		return `${tiers.length} tramo${tiers.length === 1 ? "" : "s"} · deadline ${deadline ?? "manual"}`
	}
	if (category === "Payment") {
		const payment = snapshotItem.calculation?.payment
		if (!payment) return "Pago pendiente de reglas calculables."
		return payment.paymentType === "prepayment"
			? `Prepago ${payment.prepaymentPercentage ?? "manual"}% · vence ${payment.paymentDueLocal ?? "manual"}`
			: "Pago en propiedad"
	}
	if (category === "NoShow") {
		const noShow = snapshotItem.calculation?.noShow
		if (!noShow) return "No presentación pendiente de reglas calculables."
		return `Cargo ${noShow.chargeType ?? "manual"} · base ${noShow.chargeBasis ?? "manual"}`
	}
	const calculation = snapshotItem.calculation
	return `Zona ${calculation?.localTimezone ?? "property_local"} · operativo`
}

export async function buildRatePlanPoliciesSurface(params: {
	ratePlans: SurfaceRatePlan[]
	checkIn: string
	checkOut: string
	requestId?: string
	featureContext?: FeatureFlagContext
}): Promise<{ policyPlans: PolicyPlanView[] }> {
	const exceptionRepo = new PolicyExceptionRuleRepository()
	const policyPlans = await Promise.all(
		params.ratePlans.map(async (plan) => {
			const ratePlanId = String(plan.id)
			const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
			const productId = ownerContext?.productId ?? ""
			const variantId = ownerContext?.variantId ?? ""
			const resolvedRaw = await resolveEffectivePolicies({
				productId,
				variantId: variantId || undefined,
				ratePlanId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				channel: "web",
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
				requestId: params.requestId,
				featureContext: params.featureContext,
			})
			const resolved = resolvedRaw
			const exceptionRules =
				productId && variantId
					? await exceptionRepo.listApplicable({
							productId,
							variantId,
							ratePlanId,
							channel: "web",
							checkIn: params.checkIn,
							checkOut: params.checkOut,
						})
					: []
			const snapshot = buildPolicySnapshot({
				resolvedPolicies: resolved,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				channel: "web",
				exceptionRules,
			})
			if (resolved.missingCategories.length > 0) {
				logger.warn("policies.contract.missing_categories", {
					requestId: params.requestId ?? null,
					ratePlanId,
					channel: "web",
					endpoint: "ratePlanPolicies.surface",
					missingCategories: resolved.missingCategories,
				})
				logPolicyContractMismatch({
					requestId: String(params.requestId ?? "policy-surface-anon"),
					domain: "policies",
					endpoint: "ratePlanPolicies.surface",
					productId,
					variantId: variantId || null,
					ratePlanId,
					missingCategories: resolved.missingCategories,
				})
			}
			const inheritanceByCategory = Object.fromEntries(
				REQUIRED_POLICY_CATEGORIES.map((category) => {
					const item = resolved.policies.find((p: any) => String(p.category) === category)
					return [category, item ? sourceLabel(item.resolvedFromScope) : "Sin asignación"]
				})
			)
			const overrideSummaryByCategory = Object.fromEntries(
				REQUIRED_POLICY_CATEGORIES.map((category) => {
					const key = snapshotKeysByCategory[category]
					return [category, overrideLabel(key ? (snapshot as any)[key] : null)]
				})
			)
			const snapshotPreviewByCategory = Object.fromEntries(
				REQUIRED_POLICY_CATEGORIES.map((category) => {
					const key = snapshotKeysByCategory[category]
					return [category, snapshotLabel(category, key ? (snapshot as any)[key] : null)]
				})
			)
			const isSellableByContract = resolved.missingCategories.length === 0
			const contractFacts = buildContractFacts(resolved, snapshot)
			return {
				ratePlanId,
				ratePlanName: String(plan.name),
				isDefault: Boolean(plan.isDefault),
				coverageCount: REQUIRED_POLICY_CATEGORIES.length - resolved.missingCategories.length,
				missingCategories: resolved.missingCategories,
				isSellableByContract,
				sellabilityLabel: isSellableByContract ? "Lista para vender" : "No lista para vender",
				policySummary: derivePolicySummaryFromResolvedPolicies(resolved),
				inheritanceByCategory,
				overrideSummaryByCategory,
				snapshotPreviewByCategory,
				snapshotVersionIds: snapshot.meta.policyVersionIds,
				snapshotResolvedAt: snapshot.meta.resolvedAt,
				contractFacts,
			}
		})
	)

	return { policyPlans }
}
