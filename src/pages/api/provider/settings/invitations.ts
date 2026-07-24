import type { APIRoute } from "astro"
import { first, and, db, eq, ProviderInvitation, sql } from "@/shared/infrastructure/db/compat"
import { z, ZodError } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"

const inviteSchema = z.object({
	email: z
		.string()
		.trim()
		.email()
		.transform((value) => value.toLowerCase()),
	role: z.enum(["admin", "staff"]),
})

const cancelSchema = z.object({
	id: z.string().trim().min(1),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function shouldReturnHtmlRedirect(request: Request) {
	const accept = request.headers.get("accept") ?? ""
	return accept.includes("text/html")
}

function redirectToTeam(request: Request, result: string) {
	return Response.redirect(new URL(`/provider/settings/team?result=${result}`, request.url), 303)
}

function redirectToTeamError(request: Request, error: string) {
	return Response.redirect(
		new URL(`/provider/settings/team?error=${encodeURIComponent(error)}`, request.url),
		303
	)
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId
		const permissions = provider.permissions
		if (!permissions.canInviteTeam) {
			return shouldReturnHtmlRedirect(request)
				? redirectToTeamError(request, "forbidden")
				: json({ error: "forbidden" }, 403)
		}

		const form = await request.formData()
		const action = String(form.get("action") ?? "create")
		const teamRisk = inferSettingsRiskLevel({ domain: "team" })

		if (action === "cancel") {
			const parsed = cancelSchema.parse({ id: form.get("id") })
			const existing = await db
				.select({
					id: ProviderInvitation.id,
					email: ProviderInvitation.email,
					role: ProviderInvitation.role,
					status: ProviderInvitation.status,
					expiresAt: ProviderInvitation.expiresAt,
				})
				.from(ProviderInvitation)
				.where(
					and(eq(ProviderInvitation.id, parsed.id), eq(ProviderInvitation.providerId, providerId))
				)
				.then(first)

			if (!existing?.id) {
				return shouldReturnHtmlRedirect(request)
					? redirectToTeamError(request, "not_found")
					: json({ error: "not_found" }, 404)
			}
			if (existing.status !== "pending") {
				return shouldReturnHtmlRedirect(request)
					? redirectToTeamError(request, "not_pending")
					: json({ error: "not_pending" }, 409)
			}

			await db
				.update(ProviderInvitation)
				.set({ status: "canceled", updatedAt: new Date() })
				.where(eq(ProviderInvitation.id, parsed.id))

			await writeProviderAuditLog({
				providerId,
				actorUserId: user.id,
				action: "provider.invitation.cancel",
				entityType: "ProviderInvitation",
				entityId: parsed.id,
				beforeJson: {
					email: existing.email,
					role: existing.role,
					status: existing.status,
					expiresAt: existing.expiresAt,
				},
				afterJson: {
					email: existing.email,
					role: existing.role,
					status: "canceled",
					expiresAt: existing.expiresAt,
				},
				riskLevel: teamRisk,
			})
			await invalidateProvider(providerId)
			await invalidateProviderGovernance(providerId, "provider_invitation_canceled")

			return shouldReturnHtmlRedirect(request)
				? redirectToTeam(request, "canceled")
				: json({ ok: true })
		}

		const parsed = inviteSchema.parse({
			email: form.get("email"),
			role: form.get("role"),
		})
		const pending = await db
			.select({ id: ProviderInvitation.id })
			.from(ProviderInvitation)
			.where(
				and(
					eq(ProviderInvitation.providerId, providerId),
					sql`lower(${ProviderInvitation.email}) = ${parsed.email}`,
					eq(ProviderInvitation.status, "pending")
				)
			)
			.then(first)

		if (pending?.id) {
			return shouldReturnHtmlRedirect(request)
				? redirectToTeamError(request, "duplicate_pending_invitation")
				: json({ error: "duplicate_pending_invitation" }, 409)
		}

		const now = new Date()
		const expiresAt = new Date(now)
		expiresAt.setDate(expiresAt.getDate() + 14)
		const id = crypto.randomUUID()

		await db.insert(ProviderInvitation).values({
			id,
			providerId,
			email: parsed.email,
			role: parsed.role,
			status: "pending",
			invitedBy: user.id,
			expiresAt,
			createdAt: now,
			updatedAt: now,
		})

		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action: "provider.invitation.create",
			entityType: "ProviderInvitation",
			entityId: id,
			beforeJson: null,
			afterJson: {
				email: parsed.email,
				role: parsed.role,
				status: "pending",
				expiresAt,
				invitedBy: user.id,
			},
			riskLevel: teamRisk,
		})
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_invitation_created")

		return shouldReturnHtmlRedirect(request)
			? redirectToTeam(request, "invited")
			: json({ id, status: "pending", expiresAt }, 201)
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return shouldReturnHtmlRedirect(request)
				? redirectToTeamError(request, "validation_error")
				: json({ error: "validation_error", details: err.issues }, 400)
		}
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}
