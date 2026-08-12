import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { getProviderFiscalReport } from "@/lib/taxes-fees/fiscal-report"
import { fiscalReportCsv } from "@/modules/taxes-fees/public"
import { db, FiscalExportJob } from "@/shared/infrastructure/db/compat"
import { writeFiscalActivity } from "@/lib/taxes-fees/fiscal-activity"

function validDate(value: string | null, fallback: string) {
	const normalized = String(value ?? fallback).slice(0, 10)
	return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : fallback
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const { provider, user } = await requireProviderSessionSurface(request)
		const today = new Date().toISOString().slice(0, 10)
		const ninetyDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
		const from = validDate(url.searchParams.get("from"), ninetyDaysAgo)
		const to = validDate(url.searchParams.get("to"), today)
		if (from > to)
			return new Response(JSON.stringify({ error: "invalid_date_range" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		const report = await getProviderFiscalReport({ providerId: provider.providerId, from, to })
		if (report.truncated)
			return new Response(
				JSON.stringify({
					error: "report_too_large",
					message: "El periodo supera el límite síncrono; solicita una exportación asíncrona.",
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json", "X-Report-Truncated": "true" },
				}
			)
		if (url.searchParams.get("async") === "1") {
			const correlationId = crypto.randomUUID()
			await db
				.insert(FiscalExportJob)
				.values({
					id: crypto.randomUUID(),
					providerId: provider.providerId,
					requestedByUserId: user.id,
					format: url.searchParams.get("format") === "json" ? "json" : "csv",
					status: "preparing",
					from,
					to,
					correlationId,
					createdAt: new Date(),
				})
			await writeFiscalActivity({
				providerId: provider.providerId,
				actorUserId: user.id,
				eventType: "export_requested",
				correlationId,
				result: "pending",
				riskLevel: "medium",
				context: { from, to, timezone: "UTC", schemaVersion: "fiscal_report_v1" },
			})
			return Response.json({ status: "preparing", correlationId }, { status: 202 })
		}
		if (url.searchParams.get("format") === "csv") {
			const correlationId = crypto.randomUUID()
			await db
				.insert(FiscalExportJob)
				.values({
					id: crypto.randomUUID(),
					providerId: provider.providerId,
					requestedByUserId: user.id,
					format: "csv",
					status: "completed",
					from,
					to,
					correlationId,
					createdAt: new Date(),
					completedAt: new Date(),
				})
			await writeFiscalActivity({
				providerId: provider.providerId,
				actorUserId: user.id,
				eventType: "export_requested",
				correlationId,
				result: "succeeded",
				riskLevel: "medium",
				context: { format: "csv", from, to },
			})
			return new Response(fiscalReportCsv(report), {
				headers: {
					"Content-Type": "text/csv; charset=utf-8",
					"Content-Disposition": `attachment; filename=\"reporte-fiscal-${from}-${to}.csv\"`,
					"X-Report-Truncated": String(report.truncated),
				},
			})
		}
		return new Response(
			JSON.stringify({
				schemaVersion: "fiscal_report_v1",
				timezone: "UTC",
				range: { from, to },
				report,
			}),
			{
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		if (error instanceof Response) return error
		return new Response(JSON.stringify({ error: "fiscal_report_unavailable" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
