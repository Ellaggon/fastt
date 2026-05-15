import type { APIRoute } from "astro"

import { financialExceptionRepository } from "@/container/financial.container"
import { buildFinancialReviewOverlay } from "@/modules/financial/application/use-cases/build-financial-review-overlay"
import { listFinancialExceptions } from "@/modules/financial/application/use-cases/list-financial-exceptions"
import type {
	FinancialExceptionCode,
	FinancialExceptionRecord,
	FinancialExceptionStatus,
} from "@/modules/financial/public"

import { json, requireFinancialProvider } from "./_stage2"
import { GET as getFinancialOperations } from "./operations"

type DerivedFinancialException = {
	bookingId: string
	providerId: string
	code: FinancialExceptionCode
	severity: FinancialExceptionRecord["severity"]
	basis: FinancialExceptionRecord["basis"]
	reason: string
	nextOwner: FinancialExceptionRecord["nextOwner"]
	source: "derived_queue"
}

function readStatusFilter(value: string): FinancialExceptionStatus | "all" {
	const allowed = new Set<FinancialExceptionStatus | "all">([
		"all",
		"open",
		"acknowledged",
		"waiting_external",
		"resolved",
		"dismissed",
	])
	return allowed.has(value as FinancialExceptionStatus | "all")
		? (value as FinancialExceptionStatus | "all")
		: "all"
}

async function readOperationsDerivedExceptions(context: Parameters<APIRoute>[0]) {
	const response = await getFinancialOperations(context)
	if (!response.ok) return { response, derived: [] as DerivedFinancialException[] }
	const payload = (await response.json()) as {
		items?: Array<{
			operationalException?: { all?: DerivedFinancialException[] }
		}>
	}
	const derived =
		payload.items?.flatMap((item) => item.operationalException?.all ?? []).filter(Boolean) ?? []
	return { response: null, derived }
}

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const status = readStatusFilter(String(url.searchParams.get("status") ?? "all"))
	const code = String(url.searchParams.get("code") ?? "all") as FinancialExceptionCode | "all"
	const nextOwner = String(url.searchParams.get("owner") ?? "all")
	const bookingId = String(url.searchParams.get("bookingId") ?? "").trim() || undefined
	const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") ?? 100) || 100))
	const derivedResult = await readOperationsDerivedExceptions({
		request,
		url,
	} as Parameters<APIRoute>[0])
	if (derivedResult.response) return derivedResult.response
	const persisted = await listFinancialExceptions(
		{ exceptions: financialExceptionRepository },
		{
			providerId: auth.providerId,
			status: "all",
			code: "all",
			nextOwner: "all",
			bookingId,
			limit: 500,
		}
	)
	const items = buildFinancialReviewOverlay({
		persisted,
		derived: derivedResult.derived,
		filter: {
			status,
			code,
			nextOwner,
			bookingId,
			limit,
		},
	})
	const persistedCount = items.filter((item) => item.overlaySource !== "derived_only").length
	const derivedOnlyCount = items.filter((item) => item.overlaySource === "derived_only").length
	const persistedOverlayCount = items.filter(
		(item) => item.overlaySource === "persisted_overlay"
	).length
	return json({
		items,
		summary: {
			total: items.length,
			open: items.filter((item) => item.status === "open").length,
			acknowledged: items.filter((item) => item.status === "acknowledged").length,
			waitingExternal: items.filter((item) => item.status === "waiting_external").length,
			resolved: items.filter((item) => item.status === "resolved").length,
			dismissed: items.filter((item) => item.status === "dismissed").length,
			persisted: persistedCount,
			derivedOnly: derivedOnlyCount,
			persistedOverlay: persistedOverlayCount,
		},
		overlay: {
			mode: "persisted_plus_derived_readonly_overlay",
			derivedQueueSource: "/api/internal/financial/operations",
			autoBackfill: false,
			autoReopen: false,
			readOnly: true,
		},
	})
}
