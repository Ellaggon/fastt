import {
	buildGuestStayExpectationsSnapshot as buildSnapshot,
	type GuestStayExpectationsSnapshot,
} from "../../domain/guestStayExpectationsSnapshot"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"
import { listEffectiveHouseRules } from "./list-effective-house-rules"

export async function buildGuestStayExpectationsSnapshot(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string,
	options?: { capturedAt?: Date; variantId?: string | null }
): Promise<GuestStayExpectationsSnapshot> {
	const pid = String(productId ?? "").trim()
	const variantId = String(options?.variantId ?? "").trim() || null
	if (!pid) {
		return buildSnapshot({
			productId: "",
			variantId,
			rules: [],
			capturedAt: options?.capturedAt,
		})
	}

	const rules = await listEffectiveHouseRules(deps, pid, variantId)
	return buildSnapshot({
		productId: pid,
		variantId,
		rules: rules.map((rule) => ({
			id: rule.id,
			type: rule.type,
			payloadJson: rule.payloadJson,
			source: rule.source,
			createdAt: rule.createdAt,
		})),
		capturedAt: options?.capturedAt,
	})
}
