import type { APIRoute } from "astro"

function gone() {
	return new Response(
		JSON.stringify({
			error: "Legacy product taxes endpoint retired",
			message:
				"Usa /api/provider/tax-fees/definitions y /api/provider/tax-fees/assignments. TaxFeeDefinition + TaxFeeAssignment son la fuente canónica.",
		}),
		{
			status: 410,
			headers: {
				"Content-Type": "application/json",
				"Deprecation": "true",
				"Link": '</provider/settings/tax-fees>; rel="canonical"',
			},
		}
	)
}

export const POST: APIRoute = async () => gone()
