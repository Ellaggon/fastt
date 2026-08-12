import type { APIRoute } from "astro"
import { z } from "zod"
import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import { getProviderFiscalReport } from "@/lib/taxes-fees/fiscal-report"
import { db, eq, FiscalReconciliationCase } from "@/shared/infrastructure/db/compat"
import { writeFiscalActivity } from "@/lib/taxes-fees/fiscal-activity"

export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProviderFiscalityManager(request)
	const today = new Date().toISOString().slice(0, 10),
		from = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10)
	const report = await getProviderFiscalReport({ providerId, from, to: today })
	const cases = await db
		.select()
		.from(FiscalReconciliationCase)
		.where(eq(FiscalReconciliationCase.providerId, providerId))
	return Response.json({
		cases: report.rows
			.filter((row) => row.reconciliationStatus !== "reconciled")
			.map((row) => ({
				...row,
				case: cases.find((item) => item.bookingId === row.bookingId) ?? null,
			})),
	})
}
const schema = z.object({
	bookingId: z.string().min(1),
	status: z.enum(["open", "resolved"]),
	comment: z.string().max(1000).optional().default(""),
})
export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProviderFiscalityManager(request),
		input = schema.parse(await request.json())
	const existing = await db
		.select()
		.from(FiscalReconciliationCase)
		.where(eq(FiscalReconciliationCase.bookingId, input.bookingId))
		.then((rows) => rows.find((row) => row.providerId === providerId) ?? null)
	if (existing)
		await db
			.update(FiscalReconciliationCase)
			.set({
				status: input.status,
				resolutionComment: input.comment,
				resolvedAt: input.status === "resolved" ? new Date() : null,
				resolvedByUserId: input.status === "resolved" ? user.id : null,
			})
			.where(eq(FiscalReconciliationCase.id, existing.id))
	else
		await db
			.insert(FiscalReconciliationCase)
			.values({
				id: crypto.randomUUID(),
				providerId,
				bookingId: input.bookingId,
				status: input.status,
				assigneeUserId: user.id,
				resolutionComment: input.comment || null,
				evidenceJson: { source: "fiscal_report" },
				openedAt: new Date(),
				resolvedAt: input.status === "resolved" ? new Date() : null,
				resolvedByUserId: input.status === "resolved" ? user.id : null,
			})
	await writeFiscalActivity({
		providerId,
		actorUserId: user.id,
		eventType: input.status === "resolved" ? "reconciliation_reviewed" : "reconciliation_opened",
		result: "succeeded",
		riskLevel: "medium",
		context: { bookingId: input.bookingId, comment: input.comment },
	})
	return Response.json({ ok: true })
}
