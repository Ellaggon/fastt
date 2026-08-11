import type { APIRoute } from "astro"
import { and, db, eq, ProviderUser } from "@/shared/infrastructure/db/compat"
import { z, ZodError } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { invalidateAuthContextForUser } from "@/lib/auth/authCache"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { formatProviderRoleLabel, normalizeProviderRole } from "@/lib/provider-permissions"

const mutationSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("update_role"),
		userId: z.string().trim().min(1),
		role: z.enum(["admin", "staff"]),
	}),
	z.object({
		action: z.literal("remove"),
		userId: z.string().trim().min(1),
	}),
])

function wantsHtml(request: Request) {
	return (request.headers.get("accept") ?? "").includes("text/html")
}

function redirectToTeam(
	request: Request,
	key:
		| "member_updated"
		| "member_removed"
		| "forbidden"
		| "not_found"
		| "owner_protected"
		| "last_owner_protected"
		| "self_protected"
		| "validation_error"
) {
	const url = new URL("/provider/settings/team", request.url)
	if (key === "member_updated" || key === "member_removed") url.searchParams.set("result", key)
	else url.searchParams.set("error", key)
	return Response.redirect(url, 303)
}

function respond(request: Request, payload: Record<string, unknown>, status = 200) {
	if (wantsHtml(request)) {
		const key = String(payload.error ?? payload.result ?? "validation_error") as Parameters<
			typeof redirectToTeam
		>[1]
		return redirectToTeam(request, key)
	}
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		if (provider.role !== "owner") return respond(request, { error: "forbidden" }, 403)

		const form = await request.formData()
		const mutation = mutationSchema.parse({
			action: form.get("action"),
			userId: form.get("userId"),
			role: form.get("role"),
		})
		if (mutation.userId === user.id) return respond(request, { error: "self_protected" }, 409)

		const target = await db
			.select({
				id: ProviderUser.id,
				userId: ProviderUser.userId,
				role: ProviderUser.role,
				permissionsJson: ProviderUser.permissionsJson,
			})
			.from(ProviderUser)
			.where(
				and(
					eq(ProviderUser.providerId, provider.providerId),
					eq(ProviderUser.userId, mutation.userId)
				)
			)
			.then((rows) => rows[0] ?? null)

		if (!target?.id) return respond(request, { error: "not_found" }, 404)
		const targetRole = normalizeProviderRole(target.role)
		if (mutation.action === "remove" && targetRole === "owner") {
			return respond(request, { error: "owner_protected" }, 409)
		}
		if (mutation.action === "update_role" && targetRole === "owner") {
			const memberRoles = await db
				.select({ role: ProviderUser.role })
				.from(ProviderUser)
				.where(eq(ProviderUser.providerId, provider.providerId))
			const ownerCount = memberRoles.filter(
				(member) => normalizeProviderRole(member.role) === "owner"
			).length
			if (ownerCount <= 1) return respond(request, { error: "last_owner_protected" }, 409)
		}

		const riskLevel = inferSettingsRiskLevel({ domain: "team" })
		if (mutation.action === "update_role") {
			const previousRole = targetRole
			if (previousRole === mutation.role) {
				return respond(request, { ok: true, result: "member_updated", unchanged: true })
			}
			await db
				.update(ProviderUser)
				.set({ role: mutation.role, permissionsJson: null })
				.where(eq(ProviderUser.id, target.id))
			await writeProviderAuditLog({
				providerId: provider.providerId,
				actorUserId: user.id,
				action: "provider.team_member.role_updated",
				entityType: "ProviderUser",
				entityId: target.id,
				beforeJson: {
					userId: target.userId,
					role: previousRole,
					permissionsJson: target.permissionsJson,
				},
				afterJson: { userId: target.userId, role: mutation.role, permissionsJson: null },
				riskLevel,
			})
			await Promise.all([
				invalidateProvider(provider.providerId),
				invalidateProviderGovernance(provider.providerId, "provider_team_member_role_updated"),
				invalidateAuthContextForUser(target.userId),
			])
			return respond(request, {
				ok: true,
				result: "member_updated",
				role: mutation.role,
				roleLabel: formatProviderRoleLabel(mutation.role),
			})
		}

		await db.delete(ProviderUser).where(eq(ProviderUser.id, target.id))
		await writeProviderAuditLog({
			providerId: provider.providerId,
			actorUserId: user.id,
			action: "provider.team_member.removed",
			entityType: "ProviderUser",
			entityId: target.id,
			beforeJson: {
				userId: target.userId,
				role: normalizeProviderRole(target.role),
				permissionsJson: target.permissionsJson,
			},
			afterJson: { removed: true },
			riskLevel,
		})
		await Promise.all([
			invalidateProvider(provider.providerId),
			invalidateProviderGovernance(provider.providerId, "provider_team_member_removed"),
			invalidateAuthContextForUser(target.userId),
		])
		return respond(request, { ok: true, result: "member_removed" })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof ZodError) return respond(request, { error: "validation_error" }, 400)
		return respond(request, { error: "validation_error" }, 400)
	}
}
