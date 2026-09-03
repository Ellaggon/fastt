import { isLegacyInternalAdminEmail, requireInternalPermission } from "./internal-authorization"

export function isInternalAdminEmail(email: string | null | undefined): boolean {
	return isLegacyInternalAdminEmail(email)
}

export async function requireInternalAdmin(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: { id: string; email: string }; role: "internal_admin" }> {
	const principal = await requireInternalPermission(
		request,
		"internal.admin.access",
		undefined,
		opts
	)
	return { user: principal.user, role: "internal_admin" }
}
