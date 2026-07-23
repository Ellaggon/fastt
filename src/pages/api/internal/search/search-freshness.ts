import type { APIRoute } from "astro"

import { GET as getSearchFreshness } from "@/pages/api/internal/observability/search-freshness"

export const GET: APIRoute = async (context) => getSearchFreshness(context)
