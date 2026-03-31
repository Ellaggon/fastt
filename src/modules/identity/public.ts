// Public API for the identity module.
// External consumers MUST import from "@/modules/identity/public".

export async function ensureUserForSession(params: { email: string }) {
	const { ensureUserForSessionUseCase } = await import("@/container/identity.container")
	return ensureUserForSessionUseCase(params)
}
