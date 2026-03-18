import type { APIRoute } from "astro"
import { getRestrictionRooms } from "@/modules/catalog/application/use-cases/get-restriction-rooms"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictionRooms(String(params.id || ""))
}
