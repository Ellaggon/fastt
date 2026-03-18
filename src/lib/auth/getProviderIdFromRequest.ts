import { getSession } from "auth-astro/server"
import { providerRepository } from "@/container"

/**
 * Recupera el provider.id del usuario logueado (por email).
 * Retorna null si no hay sesión o no es proveedor.
 *
 * Nota: esto NO vive en `src/lib/db/*` para evitar que exista una “segunda capa”
 * de persistencia paralela. El acceso a DB ocurre detrás de ProviderRepository.
 */
export async function getProviderIdFromRequest(request: Request): Promise<string | null> {
	const session = await getSession(request)
	if (!session?.user?.email) return null

	const r = await providerRepository.getProviderByEmail(session.user.email)
	return r?.id ?? null
}
