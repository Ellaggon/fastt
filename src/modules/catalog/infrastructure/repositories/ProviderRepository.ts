import {
	first,
	and,
	db,
	Provider,
	ProviderUser,
	User,
	eq,
	sql,
} from "@/shared/infrastructure/db/compat"
import { invalidateAuthContextForUser } from "@/lib/auth/authCache"
import {
	normalizeProviderRole,
	resolveHealedProviderRole,
	type ProviderRole,
} from "@/lib/provider-permissions"
import type { ProviderRepositoryPort } from "../../application/ports/ProviderRepositoryPort"

export class ProviderRepository implements ProviderRepositoryPort {
	async getProviderByUserId(userId: string) {
		if (!userId) return null
		if (!(User as any)?.id || !(ProviderUser as any)?.providerId || !(ProviderUser as any)?.userId)
			return null
		try {
			const link = await db
				.select({ providerId: ProviderUser.providerId })
				.from(ProviderUser)
				.where(eq(ProviderUser.userId, userId))
				.then(first)
			if (!link?.providerId) return null
			return await db
				.select({ id: Provider.id })
				.from(Provider)
				.where(eq(Provider.id, link.providerId))
				.then(first)
		} catch {
			return null
		}
	}

	async getProviderByUserEmail(email: string) {
		const normalizedEmail = String(email ?? "")
			.trim()
			.toLowerCase()
		if (!normalizedEmail) return null
		if (!(User as any)?.id || !(ProviderUser as any)?.providerId || !(ProviderUser as any)?.userId)
			return null
		try {
			const linkedUser = await db
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${normalizedEmail}`)
				.then(first)
			if (!linkedUser?.id) return null

			const link = await db
				.select({ providerId: ProviderUser.providerId })
				.from(ProviderUser)
				.where(eq(ProviderUser.userId, linkedUser.id))
				.then(first)
			if (!link?.providerId) return null

			return await db
				.select({ id: Provider.id })
				.from(Provider)
				.where(eq(Provider.id, link.providerId))
				.then(first)
		} catch {
			return null
		}
	}

	async createProviderAndAssignToUser(params: {
		providerId: string
		sessionEmail: string
		provider: {
			id: string
			displayName: string
			legalName: string
			status?: "draft" | "active" | "archived"
		}
	}): Promise<void> {
		await db.transaction(async (tx) => {
			await tx.insert(Provider).values(params.provider)

			const normalizedEmail = String(params.sessionEmail ?? "")
				.trim()
				.toLowerCase()
			if (!normalizedEmail) return
			const user = await tx
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${normalizedEmail}`)
				.then(first)
			if (!user?.id) return

			const existingLink = await tx
				.select({ id: ProviderUser.id })
				.from(ProviderUser)
				.where(
					and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, user.id))
				)
				.then(first)
			if (!existingLink) {
				await tx.insert(ProviderUser).values({
					id: crypto.randomUUID(),
					providerId: params.providerId,
					userId: user.id,
					role: "owner",
				})
				void invalidateAuthContextForUser(user.id).catch(() => {})
			}
		})
	}

	/**
	 * Promote this member to owner when the provider has no owner
	 * (or this is the sole member stuck as staff). Idempotent.
	 */
	async healProviderUserRoleIfNeeded(params: {
		providerId: string
		userId: string
	}): Promise<ProviderRole | null> {
		if (!params.providerId || !params.userId) return null
		try {
			const memberRows = await db
				.select({
					id: ProviderUser.id,
					userId: ProviderUser.userId,
					role: ProviderUser.role,
				})
				.from(ProviderUser)
				.where(eq(ProviderUser.providerId, params.providerId))

			const current = memberRows.find((row) => String(row.userId) === String(params.userId))
			if (!current) return null

			const heal = resolveHealedProviderRole({
				currentRole: current.role,
				memberRoles: memberRows.map((row) => row.role),
			})
			const nextRole = heal.role

			if (heal.shouldPromoteToOwner && normalizeProviderRole(current.role) !== "owner") {
				await db.update(ProviderUser).set({ role: "owner" }).where(eq(ProviderUser.id, current.id))
				void invalidateAuthContextForUser(params.userId).catch(() => {})
				return "owner"
			}

			// Persist canonical lowercase role when DB had "Owner" / whitespace.
			const normalizedStored = normalizeProviderRole(current.role)
			if (String(current.role ?? "").trim() !== normalizedStored) {
				await db
					.update(ProviderUser)
					.set({ role: normalizedStored })
					.where(eq(ProviderUser.id, current.id))
				void invalidateAuthContextForUser(params.userId).catch(() => {})
			}

			return nextRole
		} catch {
			return null
		}
	}

	async ensureProviderUserOwnerLink(params: {
		providerId: string
		userId: string
	}): Promise<boolean> {
		if (!params.providerId || !params.userId) return false
		try {
			const existingLink = await db
				.select({ id: ProviderUser.id, role: ProviderUser.role })
				.from(ProviderUser)
				.where(
					and(
						eq(ProviderUser.providerId, params.providerId),
						eq(ProviderUser.userId, params.userId)
					)
				)
				.then(first)
			if (existingLink?.id) {
				await this.healProviderUserRoleIfNeeded(params)
				return true
			}

			await db.insert(ProviderUser).values({
				id: crypto.randomUUID(),
				providerId: params.providerId,
				userId: params.userId,
				role: "owner",
			})
			void invalidateAuthContextForUser(params.userId).catch(() => {})
			return true
		} catch {
			return false
		}
	}
}
