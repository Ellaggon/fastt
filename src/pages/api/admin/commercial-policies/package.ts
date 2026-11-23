import type { APIRoute } from "astro"
import { z } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import {
	idempotencyKeyFromRequest,
	IdempotencyConflictError,
	IdempotencyKeyError,
} from "@/lib/commands/command-idempotency"
import { CommercialPolicyRatificationError } from "@/lib/commercial-policy/ratification"
import { canRetireCommercialVersion } from "@/lib/commercial-policy/retirement-access"
import {
	packageVersionIdsSchema,
	laPazGuideCleanup,
	packageApprovalAreas,
	PolicyPackageError,
	previewCommercialPolicyPackage,
	ratifyCommercialPolicyPackage,
} from "@/lib/commercial-policy/package-ratification"

const schema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("preview"),
			versionIds: packageVersionIdsSchema,
			cleanup: z.boolean().optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("approve"),
			cleanup: z.boolean().optional(),
			versionIds: packageVersionIdsSchema,
			fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
			approvalReference: z.string().trim().min(8).max(500),
			reviewedAreas: z.array(z.enum(packageApprovalAreas)).length(3),
		})
		.strict(),
])
const json = (value: unknown, status = 200) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})

export const POST: APIRoute = async ({ request }) => {
	if (
		request.headers.get("sec-fetch-site") === "cross-site" ||
		(request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
	)
		return json({ error: "invalid_origin" }, 403)
	const parsed = schema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return json({ error: "validation_error" }, 400)
	try {
		const principal = await requireInternalPermission(request, "internal.admin.access")
		const body = parsed.data
		if (body.action === "preview")
			return json({
				ok: true,
				canRetire: laPazGuideCleanup.retire.every((id) =>
					canRetireCommercialVersion(principal, id)
				),
				...(await previewCommercialPolicyPackage(body.versionIds, body.cleanup)),
			})
		if (
			body.cleanup &&
			!laPazGuideCleanup.retire.every((id) => canRetireCommercialVersion(principal, id))
		)
			return json({ error: "retirement_forbidden" }, 403)
		for (const permission of [
			"commercial_policy.policy.approve",
			"commercial_policy.finance.approve",
			"commercial_policy.tour_operations.approve",
		] as const)
			await requireInternalPermission(request, permission)
		await requireRecentInternalAuthentication({ request, user: principal.user })
		return json(
			await ratifyCommercialPolicyPackage({
				...body,
				approverUserId: principal.user.id,
				idempotencyKey: idempotencyKeyFromRequest(request),
			})
		)
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PolicyPackageError || error instanceof IdempotencyConflictError)
			return json({ error: error.code }, 409)
		if (error instanceof IdempotencyKeyError) return json({ error: error.code }, 400)
		if (error instanceof CommercialPolicyRatificationError) return json({ error: error.code }, 422)
		if (error instanceof Error && "code" in error && error.code === "40001")
			return json({ error: "policy_package_changed" }, 409)
		throw error
	}
}
