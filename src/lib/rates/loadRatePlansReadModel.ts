import { GET as listRatePlansGet } from "@/pages/api/rates/plans"

export type RatePlanListItem = {
	ratePlanId: string
	ratePlanName: string
	productId: string
	productName: string
	variantId: string
	variantName: string
	isActive: boolean
	isDefault: boolean
	status: "active" | "inactive"
	summary: {
		priceRulesCount: number
		activeRestrictionsCount: number
	}
	policyCoverage?: {
		totalCategories: number
		coveredCategories: number
		missingCategories: string[]
		isComplete: boolean
	}
	policySummary?: string
}

export async function loadRatePlansReadModel(input: {
	request: Request
	checkIn?: string
	checkOut?: string
	channel?: string
}): Promise<RatePlanListItem[]> {
	const url = new URL("http://localhost:4321/api/rates/plans")
	if (input.checkIn) url.searchParams.set("checkIn", input.checkIn)
	if (input.checkOut) url.searchParams.set("checkOut", input.checkOut)
	if (input.channel) url.searchParams.set("channel", input.channel)

	const headers = new Headers()
	const cookie = input.request.headers.get("cookie")
	if (cookie) headers.set("cookie", cookie)
	const authorization = input.request.headers.get("authorization")
	if (authorization) headers.set("authorization", authorization)

	const response = await listRatePlansGet({
		request: new Request(url.toString(), {
			method: "GET",
			headers,
		}),
		url,
	} as any)
	if (!response.ok) return []

	const payload = await response.json().catch(() => null)
	if (!Array.isArray(payload?.ratePlans)) return []
	return payload.ratePlans as RatePlanListItem[]
}

export async function loadRatePlanReadModelById(input: {
	request: Request
	ratePlanId: string
	checkIn?: string
	checkOut?: string
	channel?: string
}): Promise<RatePlanListItem | null> {
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!ratePlanId) return null
	const rows = await loadRatePlansReadModel(input)
	return rows.find((row) => String(row.ratePlanId) === ratePlanId) ?? null
}
