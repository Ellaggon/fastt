import type { APIRoute } from "astro"
import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { refreshProviderConfigurationState } from "@/lib/provider-governance"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const governance = await refreshProviderConfigurationState({
			providerId: provider.providerId,
			currentUserId: user.id,
		})
		await invalidateProvider(provider.providerId)
		return json({
			ok: true,
			providerId: provider.providerId,
			capabilities: governance.capabilities,
			progress: governance.progress,
			updatedAt: new Date().toISOString(),
		})
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "Unknown error"
		return json({ error: message }, 500)
	}
}
