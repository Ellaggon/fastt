import type { APIRoute } from "astro"
import { legacyCancellationPolicyGone } from "@/lib/policies/legacyCancellationPolicyApi"

const SUCCESSOR_API = "/provider/policies"

export const GET: APIRoute = async () => {
	return legacyCancellationPolicyGone(SUCCESSOR_API)
}
