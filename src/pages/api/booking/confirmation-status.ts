import type { APIRoute } from "astro"
import { and, Booking, db, eq, first, InventoryLock, sql } from "@/shared/infrastructure/db/compat"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

const holdIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const privateHeaders = { "Cache-Control": "private, no-store" }

/** Recovery probe used after a browser loses the confirm response. */
export const GET: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id)
		return Response.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders })
	const holdId = String(url.searchParams.get("holdId") ?? "").trim()
	if (!holdIdPattern.test(holdId))
		return Response.json({ error: "validation_error" }, { status: 400, headers: privateHeaders })

	const linked = await db
		.select({ bookingId: Booking.id })
		.from(InventoryLock)
		.innerJoin(Booking, eq(Booking.id, InventoryLock.bookingId))
		.where(and(eq(InventoryLock.holdId, holdId), eq(Booking.userId, user.id)))
		.then(first)
	if (linked?.bookingId)
		return Response.json(
			{ state: "confirmed", bookingId: String(linked.bookingId) },
			{ headers: privateHeaders }
		)

	const pending = await db
		.select({ expiresAt: InventoryLock.expiresAt })
		.from(InventoryLock)
		.where(and(eq(InventoryLock.holdId, holdId), sql`${InventoryLock.bookingId} is null`))
		.then(first)
	if (!pending) return Response.json({ state: "missing" }, { status: 404, headers: privateHeaders })
	return Response.json(
		{
			state: new Date(pending.expiresAt).getTime() <= Date.now() ? "expired" : "pending",
		},
		{ headers: privateHeaders }
	)
}
