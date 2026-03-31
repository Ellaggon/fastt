import { db, eq, User } from "astro:db"
import type { UserRepositoryPort } from "../../application/ports/UserRepositoryPort"

export class UserRepository implements UserRepositoryPort {
	async findByEmail(email: string) {
		const row = await db
			.select({ id: User.id, email: User.email })
			.from(User)
			.where(eq(User.email, email))
			.get()
		return row ?? null
	}

	async create(params: { id: string; email: string; username?: string | null }) {
		// Idempotent behavior under concurrency: the unique(email) constraint is canonical.
		await db
			.insert(User)
			.values({
				id: params.id,
				email: params.email,
				username: params.username ?? null,
			})
			.onConflictDoNothing({ target: [User.email] })
	}
}
