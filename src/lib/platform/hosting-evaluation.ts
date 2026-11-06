/** HTTP write pause for a hosting evaluation, not a database read-only role. */
export function hostingEvaluationResponse(request: Request): Response | null {
	if (process.env.FASTT_HOSTING_EVALUATION_READ_ONLY !== "true") return null
	const { pathname } = new URL(request.url)
	const sessionAction =
		request.method === "POST" && ["/api/auth/signin", "/api/auth/logout"].includes(pathname)
	const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method)
	if ((safeMethod && !pathname.startsWith("/api/cron/")) || sessionAction) return null
	return Response.json(
		{
			error: "hosting_evaluation_read_only",
			message: "Esta evaluación permite navegar, pero no guardar cambios.",
		},
		{ status: 403, headers: { "Cache-Control": "no-store" } }
	)
}
