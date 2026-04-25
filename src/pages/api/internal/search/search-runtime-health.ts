import type { APIRoute } from "astro"

import { GET as getSearchDecision } from "@/pages/api/internal/observability/search-decision"

// Alias endpoint kept for internal naming consistency:
// runtime health is sourced from the single decision endpoint.
export const GET: APIRoute = async (context) => getSearchDecision(context)
