import { GET as listRatePlansGet } from "@/pages/api/rates/plans"
import type { RatePlanListItem } from "./providerRatePlansSurface"

export type { RatePlanListItem } from "./providerRatePlansSurface"

export async function loadRatePlansReadModel(input: {
	request: Request
	checkIn?: string
	checkOut?: string
	channel?: string
}): Promise<RatePlanListItem[]> {
	const url = new URL("/api/rates/plans", input.request.url)
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
	if (!response.ok) {
		throw new Error(`No se pudieron cargar las tarifas (${response.status}).`)
	}

	const payload = await response.json().catch(() => null)
	if (!Array.isArray(payload?.ratePlans)) {
		throw new Error("La respuesta de tarifas no tiene el formato esperado.")
	}
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
