import type { APIRoute } from "astro"

import seedFinancialOperationalDemo from "@/scripts/seed-financial-operational-demo"

export const POST: APIRoute = async () => {
	if (process.env.NODE_ENV === "production") {
		return new Response(JSON.stringify({ error: "not_found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	await seedFinancialOperationalDemo()

	return new Response(
		JSON.stringify({
			ok: true,
			message: "Seed financiero operacional aplicado en la base que usa el dev server actual.",
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
