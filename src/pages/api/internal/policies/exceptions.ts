import type { APIRoute } from "astro"
import { z } from "zod"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import {
	createPolicyExceptionRuleUseCase,
	listPolicyExceptionRulesUseCase,
} from "@/container/policy-exceptions.container"
import { POLICY_EXCEPTION_RULE_TYPES } from "@/modules/policies/public"

const scopes = ["global", "product", "variant", "rate_plan"] as const
const categories = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

const createSchema = z
	.object({
		type: z.enum(POLICY_EXCEPTION_RULE_TYPES),
		scope: z.enum(scopes).default("global"),
		scopeId: z.string().trim().optional().nullable(),
		category: z.enum(categories).optional().nullable(),
		priority: z.coerce.number().int().min(1).max(1000).default(100),
		isActive: z.coerce.boolean().default(true),
		effectiveFrom: z.string().trim().min(1),
		effectiveTo: z.string().trim().optional().nullable(),
		reason: z.string().trim().min(10),
		action: z.object({
			refundOverridePercent: z.coerce.number().min(0).max(100).optional().nullable(),
			payoutOverrideBasis: z.string().trim().optional().nullable(),
			payoutOverridePercent: z.coerce.number().min(0).max(100).optional().nullable(),
			waiveNoShowCharge: z.coerce.boolean().optional().nullable(),
			forceRefundBasis: z.string().trim().optional().nullable(),
			hostCancellationFeeAmount: z.coerce.number().min(0).optional().nullable(),
			hostCancellationFeePercent: z.coerce.number().min(0).max(100).optional().nullable(),
			rebookingCreditAmount: z.coerce.number().min(0).optional().nullable(),
			rebookingCreditPercent: z.coerce.number().min(0).max(100).optional().nullable(),
			note: z.string().trim().min(8),
		}),
	})
	.superRefine((value, ctx) => {
		if (value.scope !== "global" && !String(value.scopeId ?? "").trim()) {
			ctx.addIssue({ code: "custom", path: ["scopeId"], message: "scopeId_required" })
		}
		const from = new Date(`${value.effectiveFrom}T00:00:00.000Z`).getTime()
		const toRaw = String(value.effectiveTo ?? "").trim()
		if (!Number.isFinite(from)) {
			ctx.addIssue({ code: "custom", path: ["effectiveFrom"], message: "invalid_date" })
		}
		if (toRaw) {
			const to = new Date(`${toRaw}T00:00:00.000Z`).getTime()
			if (!Number.isFinite(to) || to < from) {
				ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "invalid_window" })
			}
		}
		const action = value.action ?? {}
		const hasImpact = [
			action.refundOverridePercent,
			action.payoutOverrideBasis,
			action.payoutOverridePercent,
			action.waiveNoShowCharge,
			action.forceRefundBasis,
			action.hostCancellationFeeAmount,
			action.hostCancellationFeePercent,
			action.rebookingCreditAmount,
			action.rebookingCreditPercent,
		].some((item) => item === true || String(item ?? "").trim().length > 0)
		if (!hasImpact) {
			ctx.addIssue({
				code: "custom",
				path: ["action"],
				message: "impact_required",
			})
		}
	})

function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) {
		const body = await request.json().catch(() => ({}))
		return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
	}
	const form = await request.formData()
	const scopeTarget = String(form.get("scopeTarget") ?? "").trim()
	const [targetScope, ...targetIdParts] = scopeTarget.split("::")
	const targetScopeId = targetIdParts.join("::")
	const action = {
		refundOverridePercent: form.get("refundOverridePercent") || undefined,
		payoutOverrideBasis: form.get("payoutOverrideBasis") || undefined,
		payoutOverridePercent: form.get("payoutOverridePercent") || undefined,
		waiveNoShowCharge: form.get("waiveNoShowCharge") === "on",
		forceRefundBasis: form.get("forceRefundBasis") || undefined,
		hostCancellationFeeAmount: form.get("hostCancellationFeeAmount") || undefined,
		hostCancellationFeePercent: form.get("hostCancellationFeePercent") || undefined,
		rebookingCreditAmount: form.get("rebookingCreditAmount") || undefined,
		rebookingCreditPercent: form.get("rebookingCreditPercent") || undefined,
		note: form.get("note") || undefined,
	}
	return {
		type: form.get("type"),
		scope: targetScope || form.get("scope"),
		scopeId: targetScope ? targetScopeId || undefined : form.get("scopeId"),
		category: form.get("category") || undefined,
		priority: form.get("priority"),
		isActive: form.get("isActive") !== "false",
		effectiveFrom: form.get("effectiveFrom") || undefined,
		effectiveTo: form.get("effectiveTo") || undefined,
		reason: form.get("reason") || undefined,
		action,
	}
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		await requireInternalAdmin(request)
	} catch (response) {
		if (response instanceof Response) return response
		throw response
	}
	const isActiveRaw = String(url.searchParams.get("isActive") ?? "all")
	const items = await listPolicyExceptionRulesUseCase({
		scope: (url.searchParams.get("scope") as any) ?? "all",
		scopeId: url.searchParams.get("scopeId") ?? null,
		category: url.searchParams.get("category") ?? null,
		type: (url.searchParams.get("type") as any) ?? "all",
		isActive: isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : ("all" as const),
		limit: Number(url.searchParams.get("limit") ?? 250),
	})
	return json({ items })
}

export const POST: APIRoute = async ({ request }) => {
	let auth: Awaited<ReturnType<typeof requireInternalAdmin>>
	try {
		auth = await requireInternalAdmin(request)
	} catch (response) {
		if (response instanceof Response) return response
		throw response
	}
	const parsed = createSchema.safeParse(await readBody(request))
	if (!parsed.success) return json({ error: "validation_error", issues: parsed.error.issues }, 400)
	const created = await createPolicyExceptionRuleUseCase(parsed.data, auth.user.email)
	return json({ item: created }, 201)
}
