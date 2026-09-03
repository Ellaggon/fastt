import {
	and,
	db,
	eq,
	InternalRole,
	InternalRolePermission,
	InternalUserRole,
} from "@/shared/infrastructure/db/compat"

import type { AuthUser } from "./getUserFromRequest"
import { getUserFromRequest } from "./getUserFromRequest"

export const INTERNAL_PERMISSIONS = [
	"internal.admin.access",
	"provider.compliance.read",
	"provider.document.review",
	"provider.fiscal.review",
	"provider.payment.review",
	"provider.verification.review",
	"case.assign",
	"case.decision.propose",
	"case.decision.approve_high_risk",
	"audit.read",
	"audit.export",
	"sensitive_data.reveal",
	"sensitive_data.download",
	"policy.edit",
	"policy.publish",
	"access.manage",
	"payout.release",
] as const

export type InternalPermission = (typeof INTERNAL_PERMISSIONS)[number]
export type InternalScope = { type?: "global" | "provider" | "country"; id?: string | null }

export type InternalPermissionGrant = {
	permission: InternalPermission
	roleKey: string
	scopeType: "global" | "provider" | "country"
	scopeId: string | null
}

export type InternalPrincipal = {
	user: AuthUser
	mode: "iam" | "legacy_allowlist"
	roles: string[]
	grants: InternalPermissionGrant[]
}

function configuredAdminEmails(): Set<string> {
	const raw =
		process.env.INTERNAL_ADMIN_EMAILS ??
		process.env.PLATFORM_ADMIN_EMAILS ??
		process.env.ADMIN_EMAILS ??
		""
	const emails = String(raw)
		.split(",")
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean)
	if (!emails.length && process.env.NODE_ENV !== "production") emails.push("ellaggon@proton.me")
	return new Set(emails)
}

export function isLegacyInternalAdminEmail(email: string | null | undefined): boolean {
	const normalized = String(email ?? "")
		.trim()
		.toLowerCase()
	return Boolean(normalized && configuredAdminEmails().has(normalized))
}

function legacyFallbackEnabled(): boolean {
	return process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK !== "false"
}

function isInternalPermission(value: string): value is InternalPermission {
	return (INTERNAL_PERMISSIONS as readonly string[]).includes(value)
}

function scopeAllows(grant: InternalPermissionGrant, requested?: InternalScope): boolean {
	if (grant.scopeType === "global") return true
	const requestedType = requested?.type ?? "global"
	const requestedId = String(requested?.id ?? "").trim()
	return grant.scopeType === requestedType && Boolean(requestedId) && grant.scopeId === requestedId
}

export function principalHasPermission(
	principal: InternalPrincipal,
	permission: InternalPermission,
	scope?: InternalScope
): boolean {
	if (principal.mode === "legacy_allowlist") return true
	return principal.grants.some(
		(grant) => grant.permission === permission && scopeAllows(grant, scope)
	)
}

export function assertSeparationOfDuties(params: {
	makerUserId: string | null | undefined
	checkerUserId: string | null | undefined
}) {
	const maker = String(params.makerUserId ?? "").trim()
	const checker = String(params.checkerUserId ?? "").trim()
	if (!maker || !checker || maker === checker) {
		const error = new Error("maker_checker_separation_required")
		;(error as Error & { status?: number }).status = 409
		throw error
	}
}

export async function loadInternalPrincipal(user: AuthUser): Promise<InternalPrincipal> {
	const now = new Date()
	let rows: Array<{
		roleKey: string
		permissionKey: string | null
		scopeType: string
		scopeId: string | null
		expiresAt: Date | null
	}>
	try {
		rows = await db
			.select({
				roleKey: InternalRole.key,
				permissionKey: InternalRolePermission.permissionKey,
				scopeType: InternalUserRole.scopeType,
				scopeId: InternalUserRole.scopeId,
				expiresAt: InternalUserRole.expiresAt,
			})
			.from(InternalUserRole)
			.innerJoin(InternalRole, eq(InternalUserRole.roleId, InternalRole.id))
			.innerJoin(InternalRolePermission, eq(InternalRolePermission.roleId, InternalRole.id))
			.where(and(eq(InternalUserRole.userId, user.id), eq(InternalUserRole.status, "active")))
	} catch (error) {
		// Deployment order: existing internal routes retain their explicitly configured
		// allowlist until the additive IAM migration exists. Once fallback is disabled,
		// a missing IAM table or unavailable database produces no grants rather than an
		// implicit grant. This is fail-closed for non-legacy principals.
		if (legacyFallbackEnabled() && isLegacyInternalAdminEmail(user.email)) {
			return { user, mode: "legacy_allowlist", roles: ["legacy_internal_admin"], grants: [] }
		}
		console.error("internal.authorization.load_failed", {
			userId: user.id,
			error: error instanceof Error ? error.message : String(error),
		})
		return { user, mode: "iam", roles: [], grants: [] }
	}

	const activeRows = rows.filter((row) => !row.expiresAt || row.expiresAt > now)
	if (activeRows.length) {
		const grants = activeRows.flatMap((row): InternalPermissionGrant[] => {
			if (!row.permissionKey || !isInternalPermission(row.permissionKey)) return []
			const scopeType = ["global", "provider", "country"].includes(row.scopeType)
				? (row.scopeType as InternalPermissionGrant["scopeType"])
				: "global"
			return [
				{
					permission: row.permissionKey,
					roleKey: row.roleKey,
					scopeType,
					scopeId: row.scopeId ?? null,
				},
			]
		})
		return {
			user,
			mode: "iam",
			roles: [...new Set(activeRows.map((row) => row.roleKey))],
			grants,
		}
	}

	if (legacyFallbackEnabled() && isLegacyInternalAdminEmail(user.email)) {
		return { user, mode: "legacy_allowlist", roles: ["legacy_internal_admin"], grants: [] }
	}

	return { user, mode: "iam", roles: [], grants: [] }
}

export async function requireInternalPermission(
	request: Request,
	permission: InternalPermission,
	scope?: InternalScope,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<InternalPrincipal> {
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		throw (
			opts?.unauthorizedResponse ??
			new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		)
	}

	const principal = await loadInternalPrincipal(user)
	if (!principalHasPermission(principal, permission, scope)) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
		)
	}
	return principal
}
