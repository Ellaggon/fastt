import {
	Ban,
	Boxes,
	CircleDollarSign,
	Columns2,
	Eye,
	FileText,
	LayoutGrid,
	ListChecks,
	Moon,
	SlidersHorizontal,
	Sparkles,
	type LucideIcon,
} from "lucide-react"

export const CALENDAR_ACTION_ICONS: Record<string, LucideIcon> = {
	manual_price: CircleDollarSign,
	price_comparison: Columns2,
	price_rules: Sparkles,
	inventory_units: Boxes,
	inventory_detail: Eye,
	availability_scale: LayoutGrid,
	stop_sell: Ban,
	min_los: Moon,
	sellability_rules: SlidersHorizontal,
	applied_rules: ListChecks,
	conditions: FileText,
}
