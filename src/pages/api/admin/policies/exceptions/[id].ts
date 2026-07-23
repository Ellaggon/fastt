import type { APIRoute } from "astro"
import { z } from "zod"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import {
	approvePolicyExceptionRuleUseCase,
	rejectPolicyExceptionRuleUseCase,
	rollbackPolicyExceptionRuleUseCase,
	setPolicyExceptionRuleActiveUseCase,
} from "@/container/policy-exceptions.container"
import { invalidateAllPolicyConditions, invalidatePolicyConditions } from "@/lib/cache/invalidation"

const patchSchema = z
	.object({
		operation: z
			.enum(["set_active", "approve", "reject", "rollback"])
			.optional()
			.default("set_active"),
		isActive: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
		reason: z.string().trim().min(8).optional().nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.operation === "set_active" && value.isActive == null) {
			ctx.addIssue({ code: "custom", path: ["isActive"], message: "isActive_required" })
		}
		if ((value.operation === "reject" || value.operation === "rollback") && !value.reason) {
			ctx.addIssue({ code: "custom", path: ["reason"], message: "reason_required" })
		}
	})

function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

async function readBody(request: Request): Promise<z.infer<typeof patchSchema> | null> {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) {
		const body = await request.json().catch(() => ({}))
		const parsed = patchSchema.safeParse(body)
		return parsed.success ? parsed.data : null
	}
	const form = await request.formData()
	const parsed = patchSchema.safeParse({
		operation: form.get("operation") || "set_active",
		isActive: form.get("isActive") || undefined,
		reason: form.get("reason") || undefined,
	})
	return parsed.success ? parsed.data : null
}

export const PATCH: APIRoute = async ({ request, params }) => {
	let auth: Awaited<ReturnType<typeof requireInternalAdmin>>
	try {
		auth = await requireInternalAdmin(request)
	} catch (response) {
		if (response instanceof Response) return response
		throw response
	}
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "id_required" }, 400)
	const body = await readBody(request)
	if (!body) return json({ error: "validation_error" }, 400)
	const isActive =
		typeof body.isActive === "boolean" ? body.isActive : body.isActive === "true" ? true : false
	try {
		const item =
			body.operation === "approve"
				? await approvePolicyExceptionRuleUseCase({
						id,
						actorUserId: auth.user.email,
						reason: body.reason,
					})
				: body.operation === "reject"
					? await rejectPolicyExceptionRuleUseCase({
							id,
							actorUserId: auth.user.email,
							reason: body.reason,
						})
					: body.operation === "rollback"
						? await rollbackPolicyExceptionRuleUseCase({
								id,
								actorUserId: auth.user.email,
								reason: body.reason,
							})
						: await setPolicyExceptionRuleActiveUseCase({
								id,
								isActive,
								actorUserId: auth.user.email,
							})
		if (!item) return json({ error: "not_found" }, 404)
		const scope = String(item.scope ?? "")
		const scopeId = String(item.scopeId ?? "")
		if (scope && scope !== "global" && scopeId) {
			await invalidatePolicyConditions({ scope, scopeId })
		} else {
			await invalidateAllPolicyConditions("policy_exception_updated")
		}
		return json({ item })
	} catch (error) {
		if (error instanceof Error && error.message === "POLICY_EXCEPTION_APPROVAL_REQUIRED") {
			return json({ error: "approval_required" }, 409)
		}
		throw error
	}
}
