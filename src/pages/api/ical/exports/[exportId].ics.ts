import type { APIRoute } from "astro"
import { renderProviderExternalCalendarExport } from "@/lib/provider-external-calendars"

export const prerender = false

export const GET: APIRoute = async ({ params, request }) => {
	const url = new URL(request.url)
	try {
		const body = await renderProviderExternalCalendarExport({
			exportId: String(params.exportId ?? ""),
			token: String(url.searchParams.get("token") ?? ""),
		})
		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": "text/calendar; charset=utf-8",
				"Cache-Control": "no-store",
			},
		})
	} catch {
		return new Response("Calendar not found", {
			status: 404,
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "no-store",
			},
		})
	}
}
