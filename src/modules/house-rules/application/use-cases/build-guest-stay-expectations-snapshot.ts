import {
	buildGuestStayExpectationsSnapshot as buildSnapshot,
	type GuestStayExpectationsSnapshot,
} from "../../domain/guestStayExpectationsSnapshot"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

export async function buildGuestStayExpectationsSnapshot(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string,
	options?: { capturedAt?: Date }
): Promise<GuestStayExpectationsSnapshot> {
	const pid = String(productId ?? "").trim()
	if (!pid) {
		return buildSnapshot({
			productId: "",
			rules: [],
			capturedAt: options?.capturedAt,
		})
	}

	const rules = await deps.repo.listByProduct(pid)
	return buildSnapshot({
		productId: pid,
		rules: rules.map((rule) => ({
			id: rule.id,
			type: rule.type,
			payloadJson: rule.payloadJson,
			createdAt: rule.createdAt,
		})),
		capturedAt: options?.capturedAt,
	})
}
