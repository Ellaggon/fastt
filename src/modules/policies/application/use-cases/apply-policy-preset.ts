import { POLICY_PRESETS } from "@/data/policy/policy-presets"
import type { PolicyCommandRepositoryPort } from "../ports/PolicyCommandRepositoryPort"
import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function applyPolicyPreset(
	deps: { commandRepo: PolicyCommandRepositoryPort; queryRepo: PolicyQueryRepositoryPort },
	params: { policyId: string; presetKey: string }
) {
	const policy = await deps.queryRepo.getPolicyById(params.policyId)
	if (!policy) return { ok: false as const, status: 404 as const, message: "Policy not found" }

	if (policy.status !== "draft") {
		return {
			ok: false as const,
			status: 400 as const,
			message: "Only draft policies can be modified",
		}
	}

	const preset = Object.values(POLICY_PRESETS)
		.flat()
		.find((p) => p.key === params.presetKey)

	if (!preset) return { ok: false as const, status: 404 as const, message: "Preset not found" }

	await deps.commandRepo.applyPreset({
		policyId: params.policyId,
		presetKey: params.presetKey,
		description: preset.description,
	})

	return { ok: true as const }
}
