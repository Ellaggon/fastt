import type { APIRoute } from "astro"
import { db, and, CancellationTier, eq, Policy, PolicyGroup, PolicyRule } from "astro:db"
import { POLICY_PRESET_CATALOG } from "@/data/policy/policy-presets"
import { buildPolicyCategoryPreview } from "@/lib/policies/buildPolicyCategoryPreview"
import { buildPolicyFinancialPreviewFromResolution } from "@/modules/financial/public"
import type { PolicyResolutionDTO } from "@/modules/policies/public"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyScopeIds } from "@/lib/policies/policyOwnership"

type PreviewBody = {
	mode?: "existing" | "preset" | "draft"
	policyId?: string
	policyPresetKey?: string
	category?: string
	description?: string
	stayLengthType?: string
	gracePeriod?: number | null
	refundBasis?: string | null
	payoutBasis?: string | null
	localTimezone?: string | null
	rules?: Record<string, unknown>
	cancellationTiers?: unknown[]
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
		},
		rules: rulesObjectToRows(id, preset.rules),
		cancellationTiers: tiersToRows(
			id,
			"cancellationTiers" in preset ? (preset.cancellationTiers ?? []) : []
		),
	}
}

function loadDraftPolicy(body: PreviewBody) {
	const category = String(body.category ?? "").trim()
	if (!category) return null
	const id = `preview:draft:${category}`
	return {
		category,
		policy: {
			id,
			groupId: `preview-group:${category}`,
			description: String(body.description ?? "Condición en edición"),
			version: 1,
			status: "active",
			policyPresetKey: body.policyPresetKey ?? null,
			stayLengthType: body.stayLengthType ?? "any",
			gracePeriod: body.gracePeriod ?? null,
			refundBasis: body.refundBasis ?? null,
			payoutBasis: body.payoutBasis ?? null,
			localTimezone: body.localTimezone ?? "property_local",
		},
		rules: rulesObjectToRows(id, body.rules),
		cancellationTiers: tiersToRows(id, body.cancellationTiers),
	}
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const body = (await request.json().catch(() => ({}))) as PreviewBody
	const mode = body.mode === "draft" ? "draft" : body.mode === "preset" ? "preset" : "existing"
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
		mode === "draft"
			? loadDraftPolicy(body)
			: mode === "preset"
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
	const financialPreview = buildPolicyFinancialPreviewFromResolution({
		providerId,
		resolvedPolicies: resolved,
		checkIn,
		checkOut,
		channel: body.channel ?? null,
		currency,
		grossAmount,
		cancelledAt: today,
		bookedAt: new Date(today.getTime() - 2 * 60 * 60 * 1000),
		reason: "policy_preview",
		idPrefix: "policy-preview",
	})
	const categoryPreview = buildPolicyCategoryPreview({
		category: selected.category,
		financialPreview,
	})

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
			snapshot: financialPreview.snapshot,
			quotes: financialPreview.quotes,
			presentation: {
				title: categoryPreview.title,
				description: categoryPreview.description,
			},
			previewReady: categoryPreview.previewReady,
			preview: categoryPreview.items,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
