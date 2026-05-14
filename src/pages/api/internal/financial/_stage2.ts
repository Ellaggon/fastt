import { and, BookingRoomDetail, db, eq, Product, sql, Variant } from "astro:db"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

type FinancialProviderAuth =
	| {
			ok: true
			user: NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>>
			providerId: string
	  }
	| { ok: false; response: Response }

export async function requireFinancialProvider(request: Request): Promise<FinancialProviderAuth> {
	const user = await getUserFromRequest(request)
	if (!user?.email) return { ok: false, response: json({ error: "Unauthorized" }, 401) }
	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) return { ok: false, response: json({ error: "Provider not found" }, 404) }
	return { ok: true, user, providerId }
}

export function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export async function bookingBelongsToProvider(
	bookingId: string,
	providerId: string
): Promise<boolean> {
	const row = await db
		.select({ id: BookingRoomDetail.id })
		.from(BookingRoomDetail)
		.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
		.leftJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				eq(BookingRoomDetail.bookingId, bookingId),
				sql`(${Product.providerId} = ${providerId} OR ${BookingRoomDetail.providerIdSnapshot} = ${providerId})`
			)
		)
		.get()
	return Boolean(row)
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json()
		return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}
