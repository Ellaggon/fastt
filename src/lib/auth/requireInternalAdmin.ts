import type { AuthUser } from "./getUserFromRequest"
import { getUserFromRequest } from "./getUserFromRequest"

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
	if (!emails.length && process.env.NODE_ENV !== "production") {
		emails.push("ellaggon@proton.me")
	}
	return new Set(emails)
}

export function isInternalAdminEmail(email: string | null | undefined): boolean {
	const normalized = String(email ?? "")
		.trim()
		.toLowerCase()
	return Boolean(normalized && configuredAdminEmails().has(normalized))
}

export async function requireInternalAdmin(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: AuthUser; role: "internal_admin" }> {
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		throw (
			opts?.unauthorizedResponse ??
			new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		)
	}
	if (!isInternalAdminEmail(user.email)) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
		)
	}
	return { user, role: "internal_admin" }
}
