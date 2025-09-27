import { db, Provider, eq } from "astro:db"
import { getSession } from "auth-astro/server"

export async function getProviderByEmail(email: string) {
	if (!email) return null
	return await db
		.select({ id: Provider.id })
		.from(Provider)
		.where(eq(Provider.userEmail, email))
		.get()
}
/**
 * Recupera el provider.id del usuario logueado (por email).
 * Retorna null si no hay sesión o no es proveedor.
 */

export async function getProviderIdFromRequest(request: Request): Promise<string | null> {
	const session = await getSession(request)
	if (!session?.user?.email) return null
	const r = await getProviderByEmail(session.user.email)
	return r?.id ?? null
}
