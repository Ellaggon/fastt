import {
	first,
	and,
	db,
	eq,
	Provider,
	ProviderInvitation,
	ProviderUser,
	sql,
} from "@/shared/infrastructure/db/compat"

import { invalidateAuthContextForUser } from "@/lib/auth/authCache"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { formatProviderRoleLabel } from "@/lib/provider-permissions"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { routes } from "@/lib/routes"

export type ProviderInvitationAcceptPreview = {
	id: string
	providerId: string
	providerDisplayName: string
	email: string
	role: string
	roleLabel: string
	status: string
	expiresAt: Date | null
	token: string
	isExpired: boolean
	canAccept: boolean
}

export function createProviderInvitationToken(): string {
	const a = crypto.randomUUID().replace(/-/g, "")
	const b = crypto.randomUUID().replace(/-/g, "")
	return `${a}${b}`
}

export function buildProviderInvitationAcceptPath(token: string): string {
	const value = String(token ?? "").trim()
	return `${routes.providerInvitationAccept()}?token=${encodeURIComponent(value)}`
}

export function buildProviderInvitationAcceptUrl(requestUrl: string | URL, token: string): string {
	return new URL(buildProviderInvitationAcceptPath(token), requestUrl).toString()
}

export async function getProviderInvitationByToken(
	token: unknown
): Promise<ProviderInvitationAcceptPreview | null> {
	const value = String(token ?? "").trim()
	if (!value) return null

	const row = await db
		.select({
			id: ProviderInvitation.id,
			providerId: ProviderInvitation.providerId,
			email: ProviderInvitation.email,
			role: ProviderInvitation.role,
			status: ProviderInvitation.status,
			token: ProviderInvitation.token,
			expiresAt: ProviderInvitation.expiresAt,
			displayName: Provider.displayName,
			legalName: Provider.legalName,
		})
		.from(ProviderInvitation)
		.leftJoin(Provider, eq(Provider.id, ProviderInvitation.providerId))
		.where(eq(ProviderInvitation.token, value))
		.then(first)
		.catch(() => null)

	if (!row?.id || !row.token) return null

	const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null
	const isExpired =
		row.status === "expired" ||
		(row.status === "pending" && Boolean(expiresAt && expiresAt.getTime() < Date.now()))
	const canAccept = row.status === "pending" && !isExpired

	return {
		id: row.id,
		providerId: row.providerId,
		providerDisplayName: row.displayName || row.legalName || "Proveedor Fastt",
		email: String(row.email ?? "")
			.trim()
			.toLowerCase(),
		role: row.role,
		roleLabel: formatProviderRoleLabel(row.role),
		status: isExpired && row.status === "pending" ? "expired" : row.status,
		expiresAt,
		token: row.token,
		isExpired,
		canAccept,
	}
}

export async function acceptProviderInvitation(params: {
	token: unknown
	actorUserId: string
	actorEmail: string
}): Promise<{ providerId: string; invitationId: string; role: string }> {
	const preview = await getProviderInvitationByToken(params.token)
	if (!preview) {
		const error = new Error("invitation_not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}
	if (!preview.canAccept) {
		const error = new Error(preview.isExpired ? "invitation_expired" : "invitation_not_pending")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const actorEmail = String(params.actorEmail ?? "")
		.trim()
		.toLowerCase()
	if (!actorEmail || actorEmail !== preview.email) {
		const error = new Error("email_mismatch")
		;(error as Error & { status?: number }).status = 403
		throw error
	}

	const role = preview.role === "admin" || preview.role === "staff" ? preview.role : "staff"
	const now = new Date()

	const existingLink = await db
		.select({ id: ProviderUser.id, role: ProviderUser.role })
		.from(ProviderUser)
		.where(
			and(
				eq(ProviderUser.providerId, preview.providerId),
				eq(ProviderUser.userId, params.actorUserId)
			)
		)
		.then(first)
		.catch(() => null)

	if (!existingLink?.id) {
		await db.insert(ProviderUser).values({
			id: crypto.randomUUID(),
			providerId: preview.providerId,
			userId: params.actorUserId,
			role,
			createdAt: now,
		})
	}

	await db
		.update(ProviderInvitation)
		.set({
			status: "accepted",
			acceptedAt: now,
			updatedAt: now,
		})
		.where(eq(ProviderInvitation.id, preview.id))

	await writeProviderAuditLog({
		providerId: preview.providerId,
		actorUserId: params.actorUserId,
		action: "provider.invitation.accept",
		entityType: "ProviderInvitation",
		entityId: preview.id,
		beforeJson: {
			email: preview.email,
			role: preview.role,
			status: "pending",
		},
		afterJson: {
			email: preview.email,
			role,
			status: "accepted",
			acceptedAt: now,
			userId: params.actorUserId,
			alreadyLinked: Boolean(existingLink?.id),
		},
		riskLevel: inferSettingsRiskLevel({ domain: "team" }),
	})

	await invalidateProvider(preview.providerId)
	await invalidateProviderGovernance(preview.providerId, "provider_invitation_accepted")
	void invalidateAuthContextForUser(params.actorUserId).catch(() => {})

	return { providerId: preview.providerId, invitationId: preview.id, role }
}

/** Ensure pending invites always have a usable accept token. */
export async function ensureProviderInvitationToken(invitationId: string): Promise<string | null> {
	const id = String(invitationId ?? "").trim()
	if (!id) return null
	const existing = await db
		.select({
			id: ProviderInvitation.id,
			token: ProviderInvitation.token,
			status: ProviderInvitation.status,
		})
		.from(ProviderInvitation)
		.where(eq(ProviderInvitation.id, id))
		.then(first)
		.catch(() => null)
	if (!existing?.id || existing.status !== "pending") return existing?.token ?? null
	if (existing.token) return existing.token

	const token = createProviderInvitationToken()
	await db
		.update(ProviderInvitation)
		.set({ token, updatedAt: new Date() })
		.where(and(eq(ProviderInvitation.id, id), sql`${ProviderInvitation.token} is null`))
		.catch(async () => {
			await db
				.update(ProviderInvitation)
				.set({ token, updatedAt: new Date() })
				.where(eq(ProviderInvitation.id, id))
		})
	return token
}
