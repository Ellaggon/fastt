import type { UserRepositoryPort } from "../ports/UserRepositoryPort"

export async function ensureUserForSession(
	deps: { repo: UserRepositoryPort },
	params: { email: string }
): Promise<{ userId: string; created: boolean }> {
	const email = String(params.email ?? "")
		.trim()
		.toLowerCase()
	if (!email) throw new Error("Missing email")

	const existing = await deps.repo.findByEmail(email)
	if (existing) return { userId: existing.id, created: false }

	const userId = crypto.randomUUID()
	await deps.repo.create({ id: userId, email, username: email })
	return { userId, created: true }
}
