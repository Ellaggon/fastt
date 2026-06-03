import type { APIRoute } from "astro"
import { legacyCancellationPolicyGone } from "@/lib/policies/legacyCancellationPolicyApi"

const SUCCESSOR_API = "/api/policies/create-version"

export const POST: APIRoute = async () => {
	return legacyCancellationPolicyGone(SUCCESSOR_API)
}
