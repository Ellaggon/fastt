import type { ProviderRepositoryPort } from "../ports/ProviderRepositoryPort"

export async function createProvider(
	deps: { repo: ProviderRepositoryPort },
	params: {
		sessionEmail: string
		displayName: string
		legalName: string
	}
): Promise<Response> {
	const newProviderId = crypto.randomUUID()

	await deps.repo.createProviderAndAssignToUser({
		providerId: newProviderId,
		sessionEmail: params.sessionEmail,
		provider: {
			id: newProviderId,
			displayName: params.displayName,
			legalName: params.legalName,
			status: "draft",
		},
	})

	return new Response(
		JSON.stringify({ message: "Proveedor creado con éxito", providerId: newProviderId }),
		{ status: 200 }
	)
}
