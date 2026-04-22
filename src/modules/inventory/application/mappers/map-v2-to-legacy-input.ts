import type {
	BulkInventoryInput,
	BulkInventoryOperationType,
} from "../use-cases/bulk-inventory-service"

export type BulkInventoryWeekday =
	| "SUN"
	| "MON"
	| "TUE"
	| "WED"
	| "THU"
	| "FRI"
	| "SAT"
	| "DOM"
	| "LUN"
	| "MAR"
	| "MIE"
	| "JUE"
	| "VIE"
	| "SAB"

export type BulkInventoryOperationInputV2 = {
	selection: {
		variantIds: string[]
	}
	dateRange: {
		from: string
		to: string
	}
	filters?: {
		daysOfWeek?: string[]
	}
	operation: {
		type: "OPEN" | "CLOSE" | "SET_INVENTORY"
		value?: number
	}
	context?: {
		dryRun?: boolean
		source?: string
	}
}

function normalizeOperationType(
	type: BulkInventoryOperationInputV2["operation"]["type"]
): BulkInventoryOperationType {
	if (type === "OPEN") return "open_sales"
	if (type === "CLOSE") return "close_sales"
	return "set_inventory"
}

function mapWeekdayLabelToNumber(label: string): number | null {
	const value = String(label ?? "")
		.trim()
		.toUpperCase()
	const table: Record<string, number> = {
		SUN: 0,
		DOM: 0,
		MON: 1,
		LUN: 1,
		TUE: 2,
		MAR: 2,
		WED: 3,
		MIE: 3,
		THU: 4,
		JUE: 4,
		FRI: 5,
		VIE: 5,
		SAT: 6,
		SAB: 6,
	}
	return Number.isInteger(table[value]) ? table[value] : null
}

export function mapV2ToLegacyInput(input: BulkInventoryOperationInputV2): BulkInventoryInput[] {
	const variantIds = Array.from(
		new Set(
			(input.selection?.variantIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
		)
	)
	const mappedDays = Array.from(
		new Set(
			(input.filters?.daysOfWeek ?? [])
				.map((label) => mapWeekdayLabelToNumber(label))
				.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6)
		)
	)

	return variantIds.map((variantId) => ({
		variantId,
		dateFrom: String(input.dateRange?.from ?? "").trim(),
		dateTo: String(input.dateRange?.to ?? "").trim(),
		daysOfWeek: mappedDays.length > 0 ? mappedDays : undefined,
		operation: {
			type: normalizeOperationType(input.operation.type),
			value: input.operation.value,
		},
	}))
}
