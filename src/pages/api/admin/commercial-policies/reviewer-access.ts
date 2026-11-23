import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import {
	and,
	AuditEvent,
	db,
	eq,
	inArray,
	InternalRole,
	InternalUserRole,
	isNull,
	sql,
} from "@/shared/infrastructure/db/compat"

const roleKeys = [
	"commercial_policy_reviewer",
	"commercial_finance_reviewer",
	"tour_operations_reviewer",
]

export const POST: APIRoute = async ({ request }) => {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return Response.json({ error: "invalid_origin" }, { status: 403 })
	try {
		const { user, mode } = await requireInternalPermission(
			request,
			"commercial_policy.reviewer_access.request"
		)
		if (mode !== "iam") return Response.json({ error: "explicit_iam_required" }, { status: 403 })
		await requireRecentInternalAuthentication({ request, user })
		const changed = await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`)
			const roles = await tx.select().from(InternalRole).where(inArray(InternalRole.key, roleKeys))
			if (roles.length !== roleKeys.length) return false
			const now = new Date()
			const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000)
			for (const role of roles) {
				const [existing] = await tx
					.select()
					.from(InternalUserRole)
					.where(
						and(
							eq(InternalUserRole.userId, user.id),
							eq(InternalUserRole.roleId, role.id),
							eq(InternalUserRole.status, "active"),
							eq(InternalUserRole.scopeType, "global"),
							isNull(InternalUserRole.scopeId)
						)
					)
					.for("update")
				if (existing && (!existing.expiresAt || existing.expiresAt > now)) continue
				const id = existing?.id ?? crypto.randomUUID()
				const values = { expiresAt, grantedByUserId: user.id, updatedAt: now }
				if (existing)
					await tx.update(InternalUserRole).set(values).where(eq(InternalUserRole.id, id))
				else
					await tx
						.insert(InternalUserRole)
						.values({ id, userId: user.id, roleId: role.id, ...values })
				await tx.insert(AuditEvent).values({
					id: crypto.randomUUID(),
					requestId: crypto.randomUUID(),
					actorUserId: user.id,
					action: "commercial_policy.reviewer_access_granted",
					entityType: "InternalUserRole",
					entityId: id,
					riskLevel: "high",
					beforeJson: existing ? { expiresAt: existing.expiresAt } : null,
					afterJson: { role: role.key, expiresAt },
				})
			}
			return true
		})
		return changed
			? Response.json({ ok: true })
			: Response.json({ error: "reviewer_roles_unavailable" }, { status: 409 })
	} catch (error) {
		if (error instanceof Response) return error
		throw error
	}
}
