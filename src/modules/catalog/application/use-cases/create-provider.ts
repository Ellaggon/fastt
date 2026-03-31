import type { ProviderRepositoryPort } from "../ports/ProviderRepositoryPort"

export async function createProvider(
	deps: { repo: ProviderRepositoryPort },
	params: {
		sessionEmail: string
		userEmail?: string | null
		companyName: string
		contactName?: string | null
		contactEmail: string
		phone?: string | null
		type: string
	}
): Promise<Response> {
	const newProviderId = crypto.randomUUID()

	await deps.repo.createProviderAndAssignToUser({
		providerId: newProviderId,
		sessionEmail: params.sessionEmail,
		provider: {
			id: newProviderId,
			userEmail: params.userEmail ?? null,
			companyName: params.companyName,
			contactName: params.contactName ?? null,
			contactEmail: params.contactEmail,
			phone: params.phone ?? null,
			type: params.type,
		},
	})

	return new Response(
		JSON.stringify({ message: "Proveedor creado con éxito", providerId: newProviderId }),
		{ status: 200 }
	)
}
