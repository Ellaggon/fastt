import type { PricingCalendarDay } from "@/lib/rates/calendarSurfaces"
import { buildPricingCalendarSurface } from "@/lib/rates/calendarSurfaces"
import type { RatePlanListItem } from "@/lib/rates/loadRatePlansReadModel"
import { routes } from "@/lib/routes"

export type MultiCalendarTab =
	| "price"
	| "availability"
	| "sellability"
	| "stay"
	| "arrival_departure"
	| "conditions"
	| "rules"
export type MultiCalendarRangeSize = 14 | 30 | 60

export type MultiCalendarCell = {
	date: string
	day: number
	weekday: string
	isPast: boolean
	price: string
	basePrice: string
	currency: string
	hasPrice: boolean
	availableUnits: number
	totalUnits: number
	bookedUnits: number
	heldUnits: number
	operationalStatus: PricingCalendarDay["operationalStatus"]
	operationalStatusLabel: string
	restrictionSummary: string
	restrictionCount: number
	hasCommercialBlocker: boolean
	conditionsComplete: boolean
	conditionsSummary: string
	conditionsMissingSummary: string
	conditionsMissingCategories: string[]
}

export type MultiCalendarRow = {
	ratePlanId: string
	ratePlanName: string
	productId: string
	productName: string
	variantId: string
	variantName: string
	status: "active" | "inactive"
	isDefault: boolean
	calendarHref: string
	policiesHref: string
	rulesHref: string
	readiness: {
		priceReady: boolean
		availabilityReady: boolean
		conditionsReady: boolean
		sellableDays: number
		attentionDays: number
	}
	cells: MultiCalendarCell[]
}

export type MultiCalendarSurface = {
	tab: MultiCalendarTab
	rangeSize: MultiCalendarRangeSize
	month: string
	previousMonth: string
	nextMonth: string
	startDate: string
	endDate: string
	days: Array<{
		date: string
		day: number
		weekday: string
		monthLabel: string
	}>
	rows: MultiCalendarRow[]
	filters: {
		productId: string
		variantId: string
		ratePlanId: string
		status: "all" | "ready" | "attention"
	}
	options: {
		products: Array<{ id: string; name: string }>
		variants: Array<{ id: string; name: string; productId: string; productName: string }>
		ratePlans: Array<{
			id: string
			name: string
			variantId: string
			variantName: string
			productId: string
			productName: string
		}>
	}
	stats: {
		totalRows: number
		readyRows: number
		attentionRows: number
		missingPriceCells: number
		noInventoryCells: number
		closedCells: number
		incompleteConditionRows: number
	}
}

const VALID_TABS = new Set<MultiCalendarTab>([
	"price",
	"availability",
	"sellability",
	"stay",
	"arrival_departure",
	"conditions",
	"rules",
])

const VALID_RANGE_SIZES = new Set<MultiCalendarRangeSize>([14, 30, 60])

function normalizeTab(value: string | null): MultiCalendarTab {
	const tab = String(value ?? "").trim()
	return VALID_TABS.has(tab as MultiCalendarTab) ? (tab as MultiCalendarTab) : "price"
}

function normalizeRangeSize(value: string | null): MultiCalendarRangeSize {
	const parsed = Number(value)
	return VALID_RANGE_SIZES.has(parsed as MultiCalendarRangeSize)
		? (parsed as MultiCalendarRangeSize)
		: 30
}

function todayDate(): string {
	return new Date().toISOString().slice(0, 10)
}

function currentOrFutureMonth(value: string | null, today: string): string {
	const requested = String(value ?? "").trim()
	const currentMonth = today.slice(0, 7)
	return /^\d{4}-\d{2}$/.test(requested) && requested >= currentMonth ? requested : currentMonth
}

function formatMoney(amount: number | null, currency: string): string {
	if (amount == null) return "Sin precio"
	return `${currency} ${Number(amount).toFixed(0)}`
}

function monthLabel(date: string): string {
	return new Intl.DateTimeFormat("es-CL", {
		month: "short",
		timeZone: "UTC",
	})
		.format(new Date(`${date}T12:00:00.000Z`))
		.replace(".", "")
		.toUpperCase()
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
	return [...new Map(items.map((item) => [item.id, item])).values()]
}

function rowMatchesFilters(
	row: RatePlanListItem,
	filters: MultiCalendarSurface["filters"]
): boolean {
	if (filters.productId && String(row.productId) !== filters.productId) return false
	if (filters.variantId && String(row.variantId) !== filters.variantId) return false
	if (filters.ratePlanId && String(row.ratePlanId) !== filters.ratePlanId) return false
	return true
}

function computeReadiness(cells: MultiCalendarCell[], row: RatePlanListItem) {
	const activeCells = cells.filter((cell) => !cell.isPast)
	const missingPriceCells = activeCells.filter((cell) => !cell.hasPrice).length
	const noInventoryCells = activeCells.filter((cell) => cell.availableUnits <= 0).length
	const blockedCells = activeCells.filter((cell) => cell.hasCommercialBlocker).length
	const conditionsReady = Boolean(row.policyCoverage?.isComplete)
	const attentionDays = activeCells.filter((cell) =>
		["no_price", "no_inventory", "closed"].includes(cell.operationalStatus)
	).length
	return {
		priceReady: missingPriceCells === 0,
		availabilityReady: noInventoryCells === 0,
		conditionsReady,
		sellableDays: activeCells.filter((cell) => cell.operationalStatus === "sellable").length,
		attentionDays: attentionDays + blockedCells + (conditionsReady ? 0 : activeCells.length),
	}
}

function shouldKeepRowByStatus(
	readiness: MultiCalendarRow["readiness"],
	status: MultiCalendarSurface["filters"]["status"]
): boolean {
	if (status === "ready") {
		return readiness.priceReady && readiness.availabilityReady && readiness.conditionsReady
	}
	if (status === "attention") {
		return !readiness.priceReady || !readiness.availabilityReady || !readiness.conditionsReady
	}
	return true
}

export async function buildRatesMultiCalendarSurface(input: {
	rows: RatePlanListItem[]
	url: URL
}): Promise<MultiCalendarSurface> {
	const tab = normalizeTab(input.url.searchParams.get("tab"))
	const rangeSize = normalizeRangeSize(input.url.searchParams.get("range"))
	const today = todayDate()
	const requestedMonth = currentOrFutureMonth(input.url.searchParams.get("month"), today)
	const filters: MultiCalendarSurface["filters"] = {
		productId: String(input.url.searchParams.get("productId") ?? "").trim(),
		variantId: String(input.url.searchParams.get("variantId") ?? "").trim(),
		ratePlanId: String(input.url.searchParams.get("ratePlanId") ?? "").trim(),
		status: ["ready", "attention"].includes(String(input.url.searchParams.get("status")))
			? (String(input.url.searchParams.get("status")) as "ready" | "attention")
			: "all",
	}
	const visibleMonths = rangeSize === 60 ? 3 : 2
	const candidateRows = input.rows.filter((row) => rowMatchesFilters(row, filters))
	const projectedRows = await Promise.all(
		candidateRows.map(async (row) => {
			const surface = await buildPricingCalendarSurface({
				rows: input.rows,
				ratePlanId: String(row.ratePlanId),
				month: requestedMonth,
				visibleMonths,
			})
			const days = surface.days.filter((day) => day.date >= today).slice(0, rangeSize)
			const conditionsComplete = Boolean(row.policyCoverage?.isComplete)
			const conditionsMissingSummary = row.policyCoverage?.missingCategories?.length
				? `Faltan ${row.policyCoverage.missingCategories.length} categorías`
				: ""
			const cells: MultiCalendarCell[] = days.map((day) => ({
				date: day.date,
				day: day.day,
				weekday: day.weekday,
				isPast: day.isPast,
				price: formatMoney(day.finalPrice, day.currency),
				basePrice:
					day.baseComponent == null ? "Sin base" : formatMoney(day.baseComponent, day.currency),
				currency: day.currency,
				hasPrice: day.hasPrice,
				availableUnits: day.availableUnits,
				totalUnits: day.totalUnits,
				bookedUnits: day.bookedUnits,
				heldUnits: day.heldUnits,
				operationalStatus: day.operationalStatus,
				operationalStatusLabel: day.operationalStatusLabel,
				restrictionSummary: day.restrictionSignals.summary ?? "Venta estándar",
				restrictionCount: day.restrictionSignals.count,
				hasCommercialBlocker: day.restrictionSignals.hasCommercialBlocker,
				conditionsComplete,
				conditionsSummary:
					row.policySummary || (conditionsComplete ? "Condiciones listas" : "Faltan condiciones"),
				conditionsMissingSummary,
				conditionsMissingCategories: row.policyCoverage?.missingCategories ?? [],
			}))
			const readiness = computeReadiness(cells, row)
			return {
				ratePlanId: String(row.ratePlanId),
				ratePlanName: String(row.ratePlanName),
				productId: String(row.productId),
				productName: String(row.productName),
				variantId: String(row.variantId),
				variantName: String(row.variantName),
				status: row.status,
				isDefault: row.isDefault,
				calendarHref: `${routes.calendar()}?ratePlanId=${encodeURIComponent(String(row.ratePlanId))}&month=${encodeURIComponent(surface.month)}&focus=${tab === "availability" ? "availability" : tab === "sellability" || tab === "stay" || tab === "arrival_departure" || tab === "rules" ? "restrictions" : "price"}`,
				policiesHref: routes.ratePlanPolicies(String(row.ratePlanId)),
				rulesHref: `${routes.ratesMultiCalendar()}?tab=rules&ratePlanId=${encodeURIComponent(String(row.ratePlanId))}`,
				readiness,
				cells,
				_surface: surface,
			}
		})
	)
	const rows = projectedRows
		.filter((row) => shouldKeepRowByStatus(row.readiness, filters.status))
		.map(({ _surface, ...row }) => row)
	const firstSurface = projectedRows[0]?._surface
	const days =
		firstSurface?.days
			.filter((day) => day.date >= today)
			.slice(0, rangeSize)
			.map((day) => ({
				date: day.date,
				day: day.day,
				weekday: day.weekday,
				monthLabel: monthLabel(day.date),
			})) ?? []
	const activeCells = rows.flatMap((row) => row.cells.filter((cell) => !cell.isPast))
	const readyRows = rows.filter(
		(row) =>
			row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady
	).length
	return {
		tab,
		rangeSize,
		month: firstSurface?.month ?? requestedMonth,
		previousMonth:
			firstSurface && firstSurface.month > today.slice(0, 7) ? firstSurface.previousMonth : "",
		nextMonth: firstSurface?.nextMonth ?? "",
		startDate: days[0]?.date ?? "",
		endDate: days[days.length - 1]?.date ?? "",
		days,
		rows,
		filters,
		options: {
			products: uniqueById(
				input.rows.map((row) => ({
					id: String(row.productId),
					name: String(row.productName),
				}))
			),
			variants: uniqueById(
				input.rows.map((row) => ({
					id: String(row.variantId),
					name: String(row.variantName),
					productId: String(row.productId),
					productName: String(row.productName),
				}))
			),
			ratePlans: input.rows.map((row) => ({
				id: String(row.ratePlanId),
				name: String(row.ratePlanName),
				variantId: String(row.variantId),
				variantName: String(row.variantName),
				productId: String(row.productId),
				productName: String(row.productName),
			})),
		},
		stats: {
			totalRows: rows.length,
			readyRows,
			attentionRows: Math.max(0, rows.length - readyRows),
			missingPriceCells: activeCells.filter((cell) => !cell.hasPrice).length,
			noInventoryCells: activeCells.filter((cell) => cell.availableUnits <= 0).length,
			closedCells: activeCells.filter((cell) => cell.hasCommercialBlocker).length,
			incompleteConditionRows: rows.filter((row) => !row.readiness.conditionsReady).length,
		},
	}
}
