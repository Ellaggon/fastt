import type { CancellationPolicyRepositoryPort } from "../ports/CancellationPolicyRepositoryPort"

export async function toggleCancellationPolicyAssignment(params: {
	repo: CancellationPolicyRepositoryPort
	assignmentId: string
	isActive: boolean
}): Promise<Response> {
	const { repo, assignmentId, isActive } = params
	await repo.toggleAssignment({ assignmentId, isActive })
	return new Response(JSON.stringify({ success: true }))
}
