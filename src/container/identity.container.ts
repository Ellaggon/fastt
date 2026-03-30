import { ensureUserForSession } from "@/modules/identity/application/use-cases/ensure-user-for-session"
import { UserRepository } from "@/modules/identity/infrastructure/repositories/UserRepository"

export const userRepository = new UserRepository()

export async function ensureUserForSessionUseCase(params: { email: string }) {
	return ensureUserForSession({ repo: userRepository }, params)
}
