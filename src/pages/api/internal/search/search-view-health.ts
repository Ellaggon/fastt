import type { APIRoute } from "astro"

import { GET as getSearchViewHealth } from "@/pages/api/internal/observability/search-view-health"

// Alias endpoint for internal Search namespace consistency.
export const GET: APIRoute = async (context) => getSearchViewHealth(context)
