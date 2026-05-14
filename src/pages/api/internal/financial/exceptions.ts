import type { APIRoute } from "astro"

import { financialExceptionRepository } from "@/container/financial.container"
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

type OverlayFinancialException = Omit<
	FinancialExceptionRecord,
	"id" | "openedAt" | "createdAt" | "updatedAt"
> & {
	id: string
	openedAt: Date | null
	createdAt: Date | null
	updatedAt: Date | null
	overlaySource: "persisted" | "derived_only" | "persisted_overlay"
	persistedId: string | null
	derived: boolean
}

const CLOSED_STATUSES = new Set<FinancialExceptionStatus>(["resolved", "dismissed"])

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

function exceptionKey(input: { bookingId: string; code: string }): string {
	return `${input.bookingId}::${input.code}`
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

function buildOverlay(params: {
	persisted: FinancialExceptionRecord[]
	derived: DerivedFinancialException[]
	status: FinancialExceptionStatus | "all"
	code: FinancialExceptionCode | "all"
	nextOwner: string | "all"
	bookingId?: string
	limit: number
}): OverlayFinancialException[] {
	const persistedByKey = new Map(params.persisted.map((item) => [exceptionKey(item), item]))
	const overlay: OverlayFinancialException[] = params.persisted.map((item) => ({
		...item,
		id: item.id,
		overlaySource: "persisted",
		persistedId: item.id,
		derived: false,
	}))

	for (const item of params.derived) {
		const persisted = persistedByKey.get(exceptionKey(item))
		if (persisted) {
			if (CLOSED_STATUSES.has(persisted.status)) continue
			const existingIndex = overlay.findIndex((entry) => entry.id === persisted.id)
			const overlayItem: OverlayFinancialException = {
				...persisted,
				reason: persisted.reason || item.reason,
				nextOwner: persisted.nextOwner || item.nextOwner,
				overlaySource: "persisted_overlay",
				persistedId: persisted.id,
				derived: true,
			}
			if (existingIndex >= 0) overlay[existingIndex] = overlayItem
			else overlay.push(overlayItem)
			continue
		}

		overlay.push({
			id: `derived:${item.bookingId}:${item.code}`,
			bookingId: item.bookingId,
			providerId: item.providerId,
			code: item.code,
			severity: item.severity,
			status: "open",
			basis: item.basis,
			reason: item.reason,
			nextOwner: item.nextOwner,
			source: item.source,
			openedAt: null,
			acknowledgedAt: null,
			resolvedAt: null,
			resolvedBy: null,
			resolutionNote: null,
			createdAt: null,
			updatedAt: null,
			overlaySource: "derived_only",
			persistedId: null,
			derived: true,
		})
	}

	return overlay
		.filter((item) => (params.status === "all" ? true : item.status === params.status))
		.filter((item) => (params.code === "all" ? true : item.code === params.code))
		.filter((item) => (params.nextOwner === "all" ? true : item.nextOwner === params.nextOwner))
		.filter((item) => (params.bookingId ? item.bookingId === params.bookingId : true))
		.slice(0, params.limit)
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
	const items = buildOverlay({
		persisted,
		derived: derivedResult.derived,
		status,
		code,
		nextOwner,
		bookingId,
		limit,
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
