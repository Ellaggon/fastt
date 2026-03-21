import type { AuthUser } from "./getUserFromRequest"
import { getUserFromRequest } from "./getUserFromRequest"

export async function requireAuth(
	request: Request,
	opts?: { unauthorizedResponse?: Response }
): Promise<AuthUser> {
	const user = await getUserFromRequest(request)
	if (user) return user
	throw (
		opts?.unauthorizedResponse ??
		new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
	)
}
