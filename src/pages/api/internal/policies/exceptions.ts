import type { APIRoute } from "astro"
import { z } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	createPolicyExceptionRuleUseCase,
	listPolicyExceptionRulesUseCase,
} from "@/container/policy-exceptions.container"
import { POLICY_EXCEPTION_RULE_TYPES } from "@/modules/policies/public"

const ADMIN_EMAILS = ["ellaggon@proton.me"]
const scopes = ["global", "product", "variant", "rate_plan"] as const
const categories = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

const createSchema = z.object({
	type: z.enum(POLICY_EXCEPTION_RULE_TYPES),
	scope: z.enum(scopes).default("global"),
	scopeId: z.string().trim().optional().nullable(),
	category: z.enum(categories).optional().nullable(),
	priority: z.coerce.number().int().min(1).max(1000).default(100),
	isActive: z.coerce.boolean().default(true),
	effectiveFrom: z.string().trim().optional().nullable(),
	effectiveTo: z.string().trim().optional().nullable(),
	reason: z.string().trim().optional().nullable(),
	action: z
		.object({
			refundOverridePercent: z.coerce.number().min(0).max(100).optional().nullable(),
			payoutOverrideBasis: z.string().trim().optional().nullable(),
			payoutOverridePercent: z.coerce.number().min(0).max(100).optional().nullable(),
			waiveNoShowCharge: z.coerce.boolean().optional().nullable(),
			forceRefundBasis: z.string().trim().optional().nullable(),
			note: z.string().trim().optional().nullable(),
		})
		.default({}),
})

async function requireAdmin(request: Request) {
	const user = await getUserFromRequest(request)
	if (!user?.email) return { ok: false as const, response: json({ error: "Unauthorized" }, 401) }
	if (!ADMIN_EMAILS.includes(user.email)) {
		return { ok: false as const, response: json({ error: "Forbidden" }, 403) }
	}
	return { ok: true as const, email: user.email }
}

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
	const action = {
		refundOverridePercent: form.get("refundOverridePercent") || undefined,
		payoutOverrideBasis: form.get("payoutOverrideBasis") || undefined,
		payoutOverridePercent: form.get("payoutOverridePercent") || undefined,
		waiveNoShowCharge: form.get("waiveNoShowCharge") === "on",
		forceRefundBasis: form.get("forceRefundBasis") || undefined,
		note: form.get("note") || undefined,
	}
	return {
		type: form.get("type"),
		scope: form.get("scope"),
		scopeId: form.get("scopeId"),
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
	const auth = await requireAdmin(request)
	if (!auth.ok) return auth.response
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
	const auth = await requireAdmin(request)
	if (!auth.ok) return auth.response
	const parsed = createSchema.safeParse(await readBody(request))
	if (!parsed.success) return json({ error: "validation_error", issues: parsed.error.issues }, 400)
	if (parsed.data.scope !== "global" && !String(parsed.data.scopeId ?? "").trim()) {
		return json({ error: "scopeId_required" }, 400)
	}
	const created = await createPolicyExceptionRuleUseCase(parsed.data, auth.email)
	return json({ item: created }, 201)
}
