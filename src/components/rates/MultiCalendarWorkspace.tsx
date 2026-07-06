/** @jsxRuntime classic */
import React, { memo, startTransition, useEffect, useMemo, useRef, useState } from "react"

import CalendarResponsiveDrawer from "@/components/rates/CalendarResponsiveDrawer"
import {
	Badge,
	Button,
	Card,
	Checkbox,
	IconButton,
	Input,
	Notice,
	SegmentedControl,
	SegmentedItem,
	Select,
} from "@/components/ui-react"
import { CALENDAR_CONTROL_MODES } from "@/lib/rates/calendarControlCatalog"
import type {
	MultiCalendarCell,
	MultiCalendarRow,
	MultiCalendarSurface,
	MultiCalendarTab,
} from "@/lib/rates/multiCalendarSurface"
import type { MultiCalendarAppliedRule } from "@/lib/rates/loadMultiCalendarWorkspace"

type Props = {
	initialSurface: MultiCalendarSurface
	initialRules: MultiCalendarAppliedRule[]
}

type CancellationOption = {
	id: string
	label: string
	presetLabel: string
	description: string
}

type CancellationPreset = {
	key: string
	label: string
	description: string
}

type CancellationPreviewItem = {
	key: string
	label: string
	value: string
	detail?: string
}

type Selection = {
	cells: Array<{ row: MultiCalendarRow; cell: MultiCalendarCell }>
	dates: string[]
	ratePlanIds: string[]
	variantIds: string[]
	productIds: string[]
	from: string
	to: string
}

const TABS: Array<{ key: MultiCalendarTab; label: string; helper: string }> = [
	...CALENDAR_CONTROL_MODES.filter((mode) => mode.key !== "conditions").map((mode) => ({
		key: mode.key as MultiCalendarTab,
		label: mode.label,
		helper:
			mode.key === "price"
				? "Ajustes, descuentos y promociones."
				: mode.key === "availability"
					? "Cupos y bloqueo físico."
					: "Vendible, cerrado o ventana de reserva.",
	})),
	{ key: "stay", label: "Estancia", helper: "Mínimo, máximo y huecos." },
	{ key: "arrival_departure", label: "Llegada/salida", helper: "Check-in y check-out permitidos." },
	{
		key: "conditions",
		label: CALENDAR_CONTROL_MODES.find((mode) => mode.key === "conditions")?.label ?? "Condiciones",
		helper: "Condiciones de cada tarifa.",
	},
	{ key: "rules", label: "Reglas aplicadas", helper: "Automatizaciones activas y conflictos." },
]

const ACTIONS: Record<MultiCalendarTab, Array<{ id: string; label: string }>> = {
	price: [
		{ id: "price_base", label: "Ajuste de precio" },
		{ id: "price_stay", label: "Descuento por estadía" },
		{ id: "price_early", label: "Anticipada" },
		{ id: "price_last", label: "Último minuto" },
		{ id: "price_promo", label: "Promoción" },
	],
	availability: [
		{ id: "availability_units", label: "Cambiar cupo" },
		{ id: "availability_block", label: "Bloquear fechas" },
	],
	sellability: [
		{ id: "stop_sell", label: "Cerrar venta" },
		{ id: "min_lead_time", label: "Anticipación mínima" },
		{ id: "max_lead_time", label: "Anticipación máxima" },
	],
	stay: [
		{ id: "min_los", label: "Mínimo de noches" },
		{ id: "max_los", label: "Máximo de noches" },
	],
	arrival_departure: [
		{ id: "cta", label: "Bloquear llegada" },
		{ id: "ctd", label: "Bloquear salida" },
	],
	conditions: [
		{ id: "cancellation_dates", label: "Cancelación por fechas" },
		{ id: "conditions", label: "Ver contrato" },
	],
	rules: [
		{ id: "rules", label: "Editar reglas" },
		{ id: "conflicts", label: "Ver conflictos" },
		{ id: "history", label: "Historial" },
	],
}

const PRICE_ACTIONS: Record<
	string,
	{ title: string; contextKey: string; fixedMode?: string; defaultValue: number }
> = {
	price_base: {
		title: "Ajuste de precio base",
		contextKey: "multi_calendar_price_adjustment",
		defaultValue: 10,
	},
	price_stay: {
		title: "Descuento por estadía",
		contextKey: "los_discount",
		fixedMode: "percentage_discount",
		defaultValue: 12,
	},
	price_early: {
		title: "Descuento anticipado",
		contextKey: "early_bird",
		fixedMode: "percentage_discount",
		defaultValue: 15,
	},
	price_last: {
		title: "Descuento de último minuto",
		contextKey: "last_minute",
		fixedMode: "percentage_discount",
		defaultValue: 15,
	},
	price_promo: {
		title: "Promoción especial",
		contextKey: "promotion",
		fixedMode: "percentage_discount",
		defaultValue: 10,
	},
}

const CONDITION_LABELS: Record<string, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	NoShow: "No presentación",
	CheckIn: "Llegada y salida",
}

function addDays(value: string, days: number) {
	const date = new Date(`${value}T12:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function formatDate(value: string, weekday = false) {
	if (!value) return "Sin fecha"
	return new Intl.DateTimeFormat("es-BO", {
		...(weekday ? { weekday: "short" as const } : {}),
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	})
		.format(new Date(`${value}T12:00:00.000Z`))
		.replaceAll(".", "")
		.toLowerCase()
}

function formatRange(from: string, to: string, weekday = false) {
	return !to || from === to
		? formatDate(from, weekday)
		: `${formatDate(from, weekday)} → ${formatDate(to, weekday)}`
}

function cellText(tab: MultiCalendarTab, cell: MultiCalendarCell) {
	if (cell.isPast) return { primary: "Pasado", secondary: "", tone: "past" }
	if (tab === "availability")
		return {
			primary: `${cell.availableUnits}/${cell.totalUnits} cupos`,
			secondary: `${cell.bookedUnits} reservas · ${cell.heldUnits} retenidos`,
			tone: cell.availableUnits > 0 ? "ok" : "warning",
		}
	if (tab === "sellability")
		return {
			primary: cell.operationalStatusLabel,
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "stay")
		return {
			primary: cell.restrictionCount ? "Con regla" : "Sin regla",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "arrival_departure")
		return {
			primary: cell.restrictionCount ? "Con regla" : "Entrada libre",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "conditions")
		return {
			primary: cell.cancellationDateLabel || (cell.conditionsComplete ? "Listas" : "Faltan"),
			secondary: cell.cancellationDateLabel
				? "Aplicación por fecha"
				: cell.conditionsMissingSummary || cell.conditionsSummary,
			tone: cell.cancellationDateLabel ? "info" : cell.conditionsComplete ? "ok" : "warning",
		}
	if (tab === "rules")
		return {
			primary: cell.hasCommercialBlocker
				? "Cerrado"
				: cell.restrictionCount
					? `${cell.restrictionCount} reglas`
					: "Sin reglas",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	return {
		primary: cell.price,
		secondary:
			cell.hasPrice &&
			cell.basePrice &&
			cell.basePrice !== cell.price &&
			!cell.basePrice.endsWith(" 0")
				? `Base ${cell.basePrice}`
				: "",
		tone: cell.hasPrice ? "ok" : "warning",
	}
}

function toneClass(tone: string) {
	const tones: Record<string, string> = {
		past: "border-slate-200 bg-slate-50/70 text-slate-400",
		ok: "border-slate-200 bg-white text-slate-950",
		warning: "border-slate-200 border-l-2 border-l-amber-400 bg-white text-slate-950",
		danger: "border-slate-200 border-l-2 border-l-red-500 bg-white text-slate-950",
		info: "border-slate-200 border-l-2 border-l-sky-500 bg-white text-slate-950",
	}
	return tones[tone] || tones.ok
}

function statsFromRows(rows: MultiCalendarRow[]) {
	const cells = rows.flatMap((row) => row.cells.filter((cell) => !cell.isPast))
	const readyRows = rows.filter(
		(row) =>
			row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady
	).length
	return {
		totalRows: rows.length,
		readyRows,
		attentionRows: rows.length - readyRows,
		missingPriceCells: cells.filter((cell) => !cell.hasPrice).length,
		noInventoryCells: cells.filter((cell) => cell.availableUnits <= 0).length,
		closedCells: cells.filter((cell) => cell.hasCommercialBlocker).length,
		incompleteConditionRows: rows.filter((row) => !row.readiness.conditionsReady).length,
	}
}

function rowMatchesStatus(
	row: MultiCalendarRow,
	status: MultiCalendarSurface["filters"]["status"]
) {
	const ready =
		row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady
	if (status === "ready") return ready
	if (status === "attention") return !ready
	return true
}

type CalendarRowProps = {
	row: MultiCalendarRow
	tab: MultiCalendarTab
	selected: Set<string>
	onToggle: (ratePlanId: string, date: string) => void
	onToggleRow: (ratePlanId: string) => void
	recentlyUpdated: Set<string>
	showLabel: boolean
	compact: boolean
}

function rowSelectionChanged(previous: CalendarRowProps, next: CalendarRowProps) {
	return previous.row.cells.some((cell) => {
		const key = `${previous.row.ratePlanId}:${cell.date}`
		return previous.selected.has(key) !== next.selected.has(key)
	})
}

const CalendarRow = memo(
	function CalendarRow(props: CalendarRowProps) {
		const { row, tab, selected, onToggle, onToggleRow, recentlyUpdated, showLabel, compact } = props
		const selectableKeys = row.cells
			.filter((cell) => !cell.isPast)
			.map((cell) => `${row.ratePlanId}:${cell.date}`)
		const wholeRowSelected =
			selectableKeys.length > 0 && selectableKeys.every((key) => selected.has(key))
		return (
			<>
				{showLabel && (
					<div className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white/95 p-3 backdrop-blur">
						<p className="truncate text-sm font-semibold text-slate-950">{row.ratePlanName}</p>
						<p className="truncate text-xs text-slate-500">
							{row.productName} · {row.variantName}
						</p>
						<div className="mt-2 flex items-center gap-2">
							<Badge
								variant={
									row.readiness.priceReady &&
									row.readiness.availabilityReady &&
									row.readiness.conditionsReady
										? "success"
										: "warning"
								}
							>
								{row.readiness.priceReady &&
								row.readiness.availabilityReady &&
								row.readiness.conditionsReady
									? "Lista"
									: "Con pendientes"}
							</Badge>
							<Checkbox
								checked={wholeRowSelected}
								onChange={() => onToggleRow(row.ratePlanId)}
								aria-label={`Seleccionar ${row.ratePlanName}`}
							>
								Fila
							</Checkbox>
						</div>
					</div>
				)}
				{row.cells.map((cell) => {
					const key = `${row.ratePlanId}:${cell.date}`
					const text = cellText(tab, cell)
					const isSelected = selected.has(key)
					const selectedDates = row.cells.filter((item) =>
						selected.has(`${row.ratePlanId}:${item.date}`)
					)
					const firstSelectedDate = selectedDates[0]?.date
					const lastSelectedDate = selectedDates.at(-1)?.date
					const selectionEdge = !isSelected
						? undefined
						: firstSelectedDate === lastSelectedDate
							? "single"
							: cell.date === firstSelectedDate
								? "start"
								: cell.date === lastSelectedDate
									? "end"
									: "middle"
					return (
						<button
							key={key}
							type="button"
							disabled={cell.isPast}
							onClick={() => onToggle(row.ratePlanId, cell.date)}
							data-selected={isSelected}
							data-selection-edge={selectionEdge}
							className={`calendar-cell border-r border-b ${compact ? "min-h-16 p-1 text-center" : "min-h-20 p-2 text-left"} ${recentlyUpdated.has(key) ? "calendar-updated" : ""} ${toneClass(text.tone)} ${cell.isPast ? "cursor-default" : "hover:brightness-[0.98]"}`}
						>
							<div key={tab} className="calendar-cell-content">
								<p
									className={
										compact
											? "text-[10px] leading-3 font-semibold"
											: "truncate text-sm font-semibold"
									}
								>
									{text.primary}
								</p>
								{text.secondary && (
									<p
										className={
											compact
												? "mt-1 line-clamp-2 text-[9px] leading-3 text-slate-500"
												: "mt-1 line-clamp-2 text-xs text-slate-500"
										}
									>
										{text.secondary}
									</p>
								)}
							</div>
						</button>
					)
				})}
			</>
		)
	},
	(previous, next) =>
		previous.row === next.row &&
		previous.tab === next.tab &&
		previous.showLabel === next.showLabel &&
		previous.compact === next.compact &&
		previous.recentlyUpdated === next.recentlyUpdated &&
		!rowSelectionChanged(previous, next)
)

export default function MultiCalendarWorkspace({ initialSurface, initialRules }: Props) {
	const [surface, setSurface] = useState(initialSurface)
	const [rules, setRules] = useState(initialRules)
	const [activeTab, setActiveTab] = useState<MultiCalendarTab>(initialSurface.tab)
	const [selected, setSelected] = useState<Set<string>>(() => new Set())
	const [activeAction, setActiveAction] = useState("")
	const [drawerOpen, setDrawerOpen] = useState(false)
	const [loading, setLoading] = useState(false)
	const [feedback, setFeedback] = useState("")
	const [gridDirection, setGridDirection] = useState<"previous" | "next" | "neutral">("neutral")
	const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set())
	const [priceMode, setPriceMode] = useState("percentage_discount")
	const [value, setValue] = useState("")
	const [previewReady, setPreviewReady] = useState(false)
	const [editingRule, setEditingRule] = useState<MultiCalendarAppliedRule | null>(null)
	const [editingMode, setEditingMode] = useState<"edit" | "variant">("edit")
	const [filters, setFilters] = useState(initialSurface.filters)
	const [isMobile, setIsMobile] = useState(false)
	const [mobileRatePlanId, setMobileRatePlanId] = useState(initialSurface.rows[0]?.ratePlanId || "")
	const [cancellationOptions, setCancellationOptions] = useState<CancellationOption[]>([])
	const [cancellationPresets, setCancellationPresets] = useState<CancellationPreset[]>([])
	const [cancellationSource, setCancellationSource] = useState("")
	const [cancellationPreview, setCancellationPreview] = useState<CancellationPreviewItem[]>([])
	const [cancellationPreviewReady, setCancellationPreviewReady] = useState(false)
	const requestRef = useRef<AbortController | null>(null)
	const cacheRef = useRef(
		new Map<string, { surface: MultiCalendarSurface; appliedRules: MultiCalendarAppliedRule[] }>()
	)

	useEffect(() => {
		const media = window.matchMedia("(max-width: 639px)")
		const sync = () => setIsMobile(media.matches)
		sync()
		media.addEventListener("change", sync)
		return () => media.removeEventListener("change", sync)
	}, [])

	useEffect(() => {
		if (surface.rows.some((row) => row.ratePlanId === mobileRatePlanId)) return
		setMobileRatePlanId(surface.rows[0]?.ratePlanId || "")
	}, [mobileRatePlanId, surface.rows])

	const selection = useMemo<Selection>(() => {
		const cells: Selection["cells"] = []
		for (const row of surface.rows) {
			for (const cell of row.cells) {
				if (selected.has(`${row.ratePlanId}:${cell.date}`)) cells.push({ row, cell })
			}
		}
		const dates = [...new Set(cells.map((item) => item.cell.date))].sort()
		return {
			cells,
			dates,
			ratePlanIds: [...new Set(cells.map((item) => item.row.ratePlanId))],
			variantIds: [...new Set(cells.map((item) => item.row.variantId))],
			productIds: [...new Set(cells.map((item) => item.row.productId))],
			from: dates[0] || "",
			to: dates.at(-1) || "",
		}
	}, [selected, surface.rows])

	function queryUrl(
		overrides: Record<string, string> = {},
		endpoint = "/api/rates/multi-calendar"
	) {
		const url = new URL(endpoint, window.location.origin)
		const params = new URLSearchParams(window.location.search)
		for (const [key, entry] of Object.entries(overrides))
			entry ? params.set(key, entry) : params.delete(key)
		params.forEach((entry, key) => url.searchParams.set(key, entry))
		return url
	}

	async function loadWorkspace(overrides: Record<string, string> = {}, patchIds: string[] = []) {
		if (overrides.month) {
			setGridDirection(
				overrides.month < surface.month
					? "previous"
					: overrides.month > surface.month
						? "next"
						: "neutral"
			)
		}
		const url = queryUrl(overrides)
		if (patchIds.length) {
			url.searchParams.delete("ratePlanId")
			url.searchParams.set("status", "all")
			url.searchParams.set("ratePlanIds", [...new Set(patchIds)].join(","))
		}
		const cacheKey = url.toString()
		if (!patchIds.length && cacheRef.current.has(cacheKey)) {
			const cached = cacheRef.current.get(cacheKey)!
			startTransition(() => {
				setSurface(cached.surface)
				setRules(cached.appliedRules)
				setSelected(new Set())
			})
			return
		}
		requestRef.current?.abort()
		const controller = new AbortController()
		requestRef.current = controller
		setLoading(true)
		try {
			const response = await fetch(url, {
				headers: { Accept: "application/json" },
				signal: controller.signal,
			})
			const payload = await response.json()
			if (!response.ok) throw new Error(payload?.error || "No se pudo actualizar la vista")
			if (patchIds.length) {
				const patchedRows = new Map<string, MultiCalendarRow>(
					(payload.surface.rows as MultiCalendarRow[]).map((row) => [row.ratePlanId, row])
				)
				startTransition(() => {
					setSurface((current) => {
						const rows = current.rows
							.map((row) => patchedRows.get(row.ratePlanId) || row)
							.filter((row) => rowMatchesStatus(row, current.filters.status))
						return { ...current, rows, stats: statsFromRows(rows) }
					})
					setRules(payload.appliedRules)
				})
			} else {
				cacheRef.current.set(cacheKey, payload)
				startTransition(() => {
					setSurface(payload.surface)
					setRules(payload.appliedRules)
					setSelected(new Set())
					setFilters(payload.surface.filters)
				})
				const browserUrl = new URL(window.location.href)
				browserUrl.search = url.search
				window.history.replaceState({}, "", browserUrl)
			}
		} catch (error) {
			if ((error as Error).name !== "AbortError") setFeedback((error as Error).message)
		} finally {
			if (requestRef.current === controller) setLoading(false)
		}
	}

	useEffect(() => {
		if (!recentlyUpdated.size) return
		const timeout = window.setTimeout(() => setRecentlyUpdated(new Set()), 850)
		return () => window.clearTimeout(timeout)
	}, [recentlyUpdated])

	useEffect(() => {
		const listener = (event: Event) => {
			const detail = (event as CustomEvent<{ scope?: string; scopeId?: string }>).detail
			if (detail?.scope !== "rate_plan" || !detail.scopeId) return
			event.preventDefault()
			void loadWorkspace({}, [detail.scopeId])
		}
		document.addEventListener("policy-assignment-saved", listener)
		return () => document.removeEventListener("policy-assignment-saved", listener)
	})

	function changeTab(tab: MultiCalendarTab) {
		setActiveTab(tab)
		setActiveAction("")
		setDrawerOpen(false)
		const url = new URL(window.location.href)
		url.searchParams.set("tab", tab)
		window.history.replaceState({}, "", url)
	}

	function toggleCell(ratePlanId: string, date: string) {
		setSelected((current) => {
			const next = new Set(current)
			const key = `${ratePlanId}:${date}`
			next.has(key) ? next.delete(key) : next.add(key)
			return next
		})
	}

	function toggleMany(keys: string[]) {
		setSelected((current) => {
			const next = new Set(current)
			const shouldSelect = keys.some((key) => !next.has(key))
			for (const key of keys) shouldSelect ? next.add(key) : next.delete(key)
			return next
		})
	}

	function applyPreset(kind: string) {
		const today = new Date().toISOString().slice(0, 10)
		const max =
			kind === "next_7" ? addDays(today, 6) : kind === "next_30" ? addDays(today, 29) : "9999-12-31"
		const keys: string[] = []
		for (const row of surface.rows)
			for (const cell of row.cells) {
				const weekday = new Date(`${cell.date}T12:00:00Z`).getUTCDay()
				const include =
					kind === "visible_weekend"
						? weekday === 5 || weekday === 6
						: kind === "visible_month"
							? true
							: cell.date >= today && cell.date <= max
				if (!cell.isPast && include) keys.push(`${row.ratePlanId}:${cell.date}`)
			}
		setSelected(new Set(keys))
	}

	function openAction(id: string) {
		setActiveAction(id)
		setFeedback("")
		setPreviewReady(false)
		setValue("")
		setEditingRule(null)
		setEditingMode("edit")
		if (PRICE_ACTIONS[id]) {
			setValue(String(PRICE_ACTIONS[id].defaultValue))
			setPriceMode(PRICE_ACTIONS[id].fixedMode || "percentage_discount")
		}
		if (id === "cancellation_dates") void loadCancellationOptions()
		if (id === "cancellation_dates") {
			const policyIds = [
				...new Set(
					selection.cells
						.map(({ cell }) => cell.cancellationDatePolicyId)
						.filter((policyId): policyId is string => Boolean(policyId))
				),
			]
			setCancellationSource(
				policyIds.length === 1 &&
					selection.cells.every(({ cell }) => cell.cancellationDatePolicyId === policyIds[0])
					? `existing:${policyIds[0]}`
					: ""
			)
			setCancellationPreview([])
			setCancellationPreviewReady(false)
		}
		setDrawerOpen(true)
	}

	async function loadCancellationOptions() {
		if (cancellationOptions.length || cancellationPresets.length) return
		try {
			const response = await fetch("/api/policies/assignment-options", {
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudieron cargar las condiciones.")
			setCancellationOptions(
				(body.policies || [])
					.filter((policy: any) => policy.category === "Cancellation")
					.map((policy: any) => ({
						id: String(policy.id),
						label: String(policy.label),
						presetLabel: String(policy.presetLabel || "Personalizada"),
						description: String(policy.description || ""),
					}))
			)
			setCancellationPresets(
				(body.presets || [])
					.filter((preset: any) => preset.category === "Cancellation")
					.map((preset: any) => ({
						key: String(preset.key),
						label: String(preset.label),
						description: String(preset.description || ""),
					}))
			)
		} catch (error) {
			setFeedback((error as Error).message)
		}
	}

	async function previewCancellationDateAssignment() {
		if (!cancellationSource) {
			setFeedback("Selecciona una condición de cancelación.")
			return
		}
		if (cancellationSource === "base") {
			setCancellationPreview([
				{
					key: "base",
					label: "Resultado",
					value: "Se usará la cancelación base de cada tarifa",
					detail: "La excepción anterior dejará de prevalecer en estas fechas.",
				},
			])
			setCancellationPreviewReady(true)
			setFeedback("")
			return
		}
		const [mode, id] = cancellationSource.split(":")
		setLoading(true)
		setFeedback("Calculando consecuencias...")
		try {
			const response = await fetch("/api/policies/preview", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode,
					...(mode === "existing"
						? { policyId: id }
						: { policyPresetKey: id, category: "Cancellation" }),
					scope: "rate_plan",
					scopeId: selection.ratePlanIds[0],
					checkIn: selection.from,
					checkOut: addDays(selection.to, 1),
					channel: "web",
					currency: selection.cells[0]?.cell.currency || "USD",
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo calcular la vista previa.")
			setCancellationPreview(Array.isArray(body.preview) ? body.preview : [])
			setCancellationPreviewReady(body.previewReady === true)
			setFeedback(
				body.previewReady === true
					? ""
					: "Esta condición todavía no produce un cálculo contractual completo."
			)
		} catch (error) {
			setCancellationPreview([])
			setCancellationPreviewReady(false)
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function saveCancellationDateAssignment() {
		if (!cancellationPreviewReady) {
			setFeedback("Revisa las consecuencias antes de guardar.")
			return
		}
		const [mode, id] = cancellationSource === "base" ? ["base", ""] : cancellationSource.split(":")
		setLoading(true)
		setFeedback("Guardando excepción...")
		try {
			const response = await fetch("/api/policies/date-cancellation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode,
					ratePlanIds: selection.ratePlanIds,
					effectiveFrom: selection.from,
					effectiveTo: selection.to,
					channel: "web",
					...(mode === "existing"
						? { policyId: id }
						: mode === "preset"
							? { policyPresetKey: id }
							: {}),
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo guardar la excepción.")
			await loadWorkspace({}, selection.ratePlanIds)
			setRecentlyUpdated(new Set(selected))
			setFeedback("Cancelación por fechas actualizada.")
			setDrawerOpen(false)
			setCancellationPreview([])
			setCancellationPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function savePrice() {
		const numeric = Number(value)
		if (!Number.isFinite(numeric) || numeric < 0) return setFeedback("Ingresa un valor válido.")
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		setLoading(true)
		setFeedback("Guardando precio...")
		const config = PRICE_ACTIONS[activeAction]
		try {
			const response = await fetch("/api/pricing/rules/v2/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					ratePlanIds: selection.ratePlanIds,
					operation: {
						type: priceMode,
						value: numeric,
						conditions: {
							priority: 1000,
							dateFrom: selection.from,
							dateTo: selection.to,
							previewFrom: selection.from,
							effectiveFrom: selection.from,
							effectiveTo: addDays(selection.to, 1),
							contextKey: config.contextKey,
							currency: selection.cells[0]?.cell.currency || "USD",
						},
					},
					dryRun: false,
					concurrency: 3,
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0)
				throw new Error(body?.failures?.[0]?.error || body?.error || "No se pudo guardar")
			await loadWorkspace({}, selection.ratePlanIds)
			setRecentlyUpdated(new Set(selected))
			setFeedback("Precio actualizado.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function saveAvailability() {
		const numeric = Number(value)
		if (!Number.isInteger(numeric) || numeric < 0)
			return setFeedback("Ingresa un cupo entero válido.")
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		setLoading(true)
		setFeedback("Guardando cupo...")
		try {
			const response = await fetch("/api/inventory/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selection: { variantIds: selection.variantIds },
					dateRange: { from: selection.from, to: addDays(selection.to, 1) },
					operation: { type: "SET_INVENTORY", value: numeric },
					context: { source: "multi-calendar" },
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo guardar")
			await loadWorkspace({}, selection.ratePlanIds)
			setRecentlyUpdated(new Set(selected))
			setFeedback("Cupo actualizado.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function saveSellabilityRule() {
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		const form = new FormData()
		form.set("action", "create-batch")
		form.set("scope", "rate_plan")
		form.set("scopeIds", selection.ratePlanIds.join(","))
		form.set("startDate", selection.from)
		form.set("endDate", selection.to)
		form.set("type", activeAction === "availability_block" ? "stop_sell" : activeAction)
		if (value) form.set("value", value)
		setLoading(true)
		try {
			const response = await fetch("/api/rates/commercial-rules", {
				method: "POST",
				body: form,
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo guardar la regla")
			await loadWorkspace({}, selection.ratePlanIds)
			setRecentlyUpdated(new Set(selected))
			setFeedback("Regla guardada.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	const selectedRules = useMemo(
		() =>
			rules.filter((rule) => {
				const target =
					rule.scope === "rate_plan" || rule.category === "price"
						? selection.ratePlanIds.includes(rule.ratePlanId || rule.scopeId)
						: rule.scope === "variant"
							? selection.variantIds.includes(rule.variantId || rule.scopeId)
							: selection.productIds.includes(rule.productId || rule.scopeId)
				if (!target) return false
				if (!rule.startDate && !rule.endDate) return true
				return (
					(rule.startDate || "0000-01-01") <= selection.to &&
					(rule.endDate || "9999-12-31") >= selection.from
				)
			}),
		[rules, selection]
	)
	const visibleRules = useMemo(() => {
		if (activeAction === "history") {
			return [...selectedRules].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
		}
		if (activeAction === "conflicts") {
			const conflictingIds = new Set<string>()
			for (let leftIndex = 0; leftIndex < selectedRules.length; leftIndex += 1) {
				for (let rightIndex = leftIndex + 1; rightIndex < selectedRules.length; rightIndex += 1) {
					const left = selectedRules[leftIndex]
					const right = selectedRules[rightIndex]
					if (!left.isActive || !right.isActive || left.category !== right.category) continue
					const overlaps =
						(left.startDate || "0000-01-01") <= (right.endDate || "9999-12-31") &&
						(right.startDate || "0000-01-01") <= (left.endDate || "9999-12-31")
					if (overlaps && (left.type === right.type || left.priority === right.priority)) {
						conflictingIds.add(left.id)
						conflictingIds.add(right.id)
					}
				}
			}
			return selectedRules.filter((rule) => conflictingIds.has(rule.id))
		}
		return [...selectedRules].sort((left, right) => Number(right.isActive) - Number(left.isActive))
	}, [activeAction, selectedRules])

	async function mutateRule(
		rule: MultiCalendarAppliedRule,
		action: string,
		values?: { startDate: string; endDate: string; value: string; priority: string }
	) {
		const form = new FormData()
		form.set("action", action)
		form.set("ruleId", rule.id)
		form.set("category", rule.category)
		form.set("scope", rule.scope)
		form.set("scopeId", rule.scopeId)
		form.set("ratePlanId", rule.ratePlanId)
		form.set("type", rule.type)
		form.set("value", values?.value ?? String(rule.value ?? ""))
		form.set("startDate", values?.startDate ?? rule.startDate)
		form.set("endDate", values?.endDate ?? rule.endDate)
		form.set("priority", values?.priority ?? String(rule.priority))
		form.set("contextKey", rule.contextKey || "")
		form.set("isActive", String(rule.isActive))
		rule.validDays.forEach((day) => form.append("validDays", String(day)))
		setLoading(true)
		try {
			const response = await fetch("/api/rates/commercial-rules", {
				method: "POST",
				body: form,
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo actualizar la regla")
			await loadWorkspace({}, [rule.ratePlanId || rule.scopeId])
			setEditingRule(null)
			setFeedback("Regla actualizada.")
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	const actions = ACTIONS[activeTab]
	const selectedRows = [
		...new Map(selection.cells.map(({ row }) => [row.ratePlanId, row])).values(),
	]
	const activeFilterCount = [
		filters.productId,
		filters.variantId,
		filters.ratePlanId,
		filters.status === "all" ? "" : filters.status,
	].filter(Boolean).length
	const visibleDays = surface.days
	const visibleDateSet = new Set(visibleDays.map((day) => day.date))
	const baseVisibleRows = isMobile
		? surface.rows.filter((row) => row.ratePlanId === mobileRatePlanId)
		: surface.rows
	const visibleRows = baseVisibleRows.map((row) => ({
		...row,
		cells: row.cells.filter((cell) => visibleDateSet.has(cell.date)),
	}))

	return (
		<div className="space-y-5" aria-busy={loading}>
			<Card
				as="section"
				className="fastt-workspace-panel relative overflow-hidden p-4 text-slate-900"
			>
				{loading && <span className="calendar-loading-bar" aria-hidden="true" />}
				<details className="fastt-soft-box group border border-slate-200 bg-slate-50/70">
					<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
						<span>Filtros{activeFilterCount ? ` · ${activeFilterCount} activos` : ""}</span>
						<span className="text-xs font-medium text-slate-500 group-open:hidden">
							{surface.stats.totalRows} tarifas visibles
						</span>
						<span className="hidden text-xs font-medium text-slate-500 group-open:inline">
							Cerrar
						</span>
					</summary>
					<form
						onSubmit={(event) => {
							event.preventDefault()
							void loadWorkspace({
								productId: filters.productId,
								variantId: filters.variantId,
								ratePlanId: filters.ratePlanId,
								status: filters.status,
							})
						}}
						className="grid gap-3 border-t border-slate-200 bg-white p-3 lg:grid-cols-[1fr_1fr_1fr_0.8fr_auto] lg:items-end"
					>
						{(["productId", "variantId", "ratePlanId"] as const).map((key) => (
							<label key={key} className="space-y-1 text-sm">
								<span className="text-xs font-semibold text-slate-500">
									{key === "productId" ? "Hotel" : key === "variantId" ? "Habitación" : "Tarifa"}
								</span>
								<Select
									value={filters[key]}
									onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
								>
									<option value="">
										{key === "productId"
											? "Todos los hoteles"
											: key === "variantId"
												? "Todas las habitaciones"
												: "Todas las tarifas"}
									</option>
									{(key === "productId"
										? surface.options.products
										: key === "variantId"
											? surface.options.variants
											: surface.options.ratePlans
									).map((option) => (
										<option key={option.id} value={option.id}>
											{"productName" in option
												? `${option.productName} · ${option.name}`
												: option.name}
										</option>
									))}
								</Select>
							</label>
						))}
						<label className="space-y-1 text-sm">
							<span className="text-xs font-semibold text-slate-500">Estado</span>
							<Select
								value={filters.status}
								onChange={(event) =>
									setFilters({ ...filters, status: event.target.value as typeof filters.status })
								}
							>
								<option value="all">Todas</option>
								<option value="ready">Listas</option>
								<option value="attention">Con pendientes</option>
							</Select>
						</label>
						<Button disabled={loading}>Filtrar</Button>
					</form>
				</details>
				<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 sm:justify-between">
					<div className="flex w-full min-w-0 items-center justify-center gap-2 sm:w-auto sm:justify-start">
						<IconButton
							disabled={!surface.previousMonth || loading}
							onClick={() => void loadWorkspace({ month: surface.previousMonth })}
							label="Mes anterior"
						>
							‹
						</IconButton>
						<div className="min-w-0 text-center">
							<p className="font-semibold whitespace-nowrap text-slate-950">
								{formatRange(surface.startDate, surface.endDate)}
							</p>
							<p className="text-xs whitespace-nowrap text-slate-500">
								{surface.stats.totalRows} tarifas · {surface.stats.attentionRows} con pendientes
							</p>
						</div>
						<IconButton
							disabled={loading}
							onClick={() => void loadWorkspace({ month: surface.nextMonth })}
							label="Mes siguiente"
						>
							›
						</IconButton>
					</div>
					<div
						className="hidden flex-wrap justify-end gap-1.5 sm:flex"
						data-multi-calendar-range-presets
					>
						{[
							["visible_weekend", "Fin de semana"],
							["visible_month", "Vista visible"],
							["next_7", "Prox. 7 días"],
							["next_30", "Prox. 30 días"],
						].map(([id, label]) => (
							<Button
								key={id}
								type="button"
								onClick={() => applyPreset(id)}
								variant="secondary"
								size="sm"
							>
								{label}
							</Button>
						))}
					</div>
				</div>
				<SegmentedControl className="mt-4" role="tablist">
					{TABS.map((tab) => (
						<SegmentedItem
							key={tab.key}
							role="tab"
							onClick={() => changeTab(tab.key)}
							aria-selected={activeTab === tab.key}
							active={activeTab === tab.key}
							className="min-w-max py-2 text-left"
						>
							<span className="block font-semibold">{tab.label}</span>
							{activeTab === tab.key && (
								<span className="mt-0.5 hidden text-[10px] font-medium text-slate-500 lg:block">
									{tab.helper}
								</span>
							)}
						</SegmentedItem>
					))}
				</SegmentedControl>
				{selection.cells.length > 0 && (
					<div className="fastt-calendar-toolbar mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div>
							<p className="text-sm font-semibold text-slate-950">
								{selection.cells.length}{" "}
								{selection.cells.length === 1 ? "celda seleccionada" : "celdas seleccionadas"}
							</p>
							<p className="text-xs text-slate-500">
								{formatRange(selection.from, selection.to, true)} · {selection.ratePlanIds.length}{" "}
								{selection.ratePlanIds.length === 1 ? "tarifa" : "tarifas"}
							</p>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{actions.map((action) => (
								<Button
									key={action.id}
									type="button"
									onClick={() => openAction(action.id)}
									variant={activeAction === action.id ? "primary" : "secondary"}
									size="sm"
								>
									{action.label}
								</Button>
							))}
							<Button
								type="button"
								onClick={() => setSelected(new Set())}
								variant="ghost"
								size="sm"
							>
								Limpiar
							</Button>
						</div>
					</div>
				)}
				{feedback && !drawerOpen && <p className="mt-3 text-sm text-red-700">{feedback}</p>}
			</Card>

			<Card as="section" className="fastt-workspace-panel overflow-hidden p-0 text-slate-900">
				<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<div>
						<h2 className="font-semibold text-slate-950">Operación por tarifa</h2>
						<p className="text-sm text-slate-500">
							Selecciona fechas o tarifas para operar en escala.
						</p>
					</div>
					{loading && <span className="text-xs font-semibold text-slate-500">Actualizando...</span>}
				</div>
				{surface.rows.length === 0 ? (
					<div className="p-10 text-center text-sm text-slate-500">
						No hay tarifas para esta vista.
					</div>
				) : (
					<>
						<label className="block border-b border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600 sm:hidden">
							Tarifa visible
							<Select
								value={mobileRatePlanId}
								onChange={(event) => {
									setMobileRatePlanId(event.target.value)
									setSelected(new Set())
								}}
								className="mt-1.5"
							>
								{surface.rows.map((row) => (
									<option key={row.ratePlanId} value={row.ratePlanId}>
										{row.ratePlanName} · {row.variantName}
									</option>
								))}
							</Select>
						</label>
						<div className="fastt-calendar-grid overflow-x-auto">
							<div
								key={`${surface.startDate}:${surface.endDate}:${mobileRatePlanId}:${isMobile}`}
								data-direction={gridDirection}
								className="calendar-grid-enter grid min-w-max bg-slate-100/70"
								style={{
									gridTemplateColumns: isMobile
										? `repeat(${visibleDays.length}, minmax(4.5rem, 1fr))`
										: `18rem repeat(${visibleDays.length}, minmax(6.25rem, 1fr))`,
								}}
							>
								{!isMobile && (
									<div className="sticky left-0 z-20 border-r border-b border-slate-200 bg-white p-3 text-xs font-semibold text-slate-500 uppercase">
										Tarifa
									</div>
								)}
								{visibleDays.map((day) => (
									<div
										key={day.date}
										className="border-b border-slate-200 bg-slate-50 p-2 text-center"
									>
										<button
											type="button"
											onClick={() =>
												toggleMany(
													visibleRows.flatMap((row) =>
														row.cells.some((cell) => cell.date === day.date && !cell.isPast)
															? [`${row.ratePlanId}:${day.date}`]
															: []
													)
												)
											}
											className="fastt-calendar-cell px-2 py-1 hover:bg-white"
										>
											<p className="text-[10px] font-semibold text-slate-500 uppercase">
												{day.weekday}
											</p>
											<p className="text-sm font-semibold text-slate-950">{day.day}</p>
											<p className="text-[10px] text-slate-400">{day.monthLabel}</p>
										</button>
									</div>
								))}
								{visibleRows.map((row) => (
									<CalendarRow
										key={row.ratePlanId}
										row={row}
										tab={activeTab}
										selected={selected}
										onToggle={toggleCell}
										onToggleRow={(id) =>
											toggleMany(
												row.cells.filter((cell) => !cell.isPast).map((cell) => `${id}:${cell.date}`)
											)
										}
										recentlyUpdated={recentlyUpdated}
										showLabel={!isMobile}
										compact={isMobile}
									/>
								))}
							</div>
						</div>
					</>
				)}
			</Card>

			{drawerOpen && (
				<CalendarResponsiveDrawer
					title={
						PRICE_ACTIONS[activeAction]?.title ||
						ACTIONS[activeTab].find((item) => item.id === activeAction)?.label ||
						"Detalle"
					}
					meta={`${formatRange(selection.from, selection.to, true)} · ${selection.ratePlanIds.length} ${selection.ratePlanIds.length === 1 ? "tarifa" : "tarifas"}`}
					onClose={() => setDrawerOpen(false)}
				>
					<div className="mt-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
						<p className="text-sm font-semibold text-slate-950">
							{selection.ratePlanIds.length === 1
								? selection.cells[0]?.row.ratePlanName
								: `${selection.ratePlanIds.length} tarifas seleccionadas`}
						</p>
						<p className="shrink-0 text-xs text-slate-500">
							{selection.cells.length} noches-tarifa impactadas
						</p>
					</div>
					{PRICE_ACTIONS[activeAction] && (
						<div className="mt-5 space-y-4">
							<div className="grid grid-cols-3 gap-2">
								{(!PRICE_ACTIONS[activeAction].fixedMode
									? [
											["percentage_markup", "Subir %"],
											["percentage_discount", "Bajar %"],
											["fixed_override", "Precio fijo"],
										]
									: [[PRICE_ACTIONS[activeAction].fixedMode!, "% descuento"]]
								).map(([mode, label]) => (
									<Button
										key={mode}
										type="button"
										onClick={() => {
											setPriceMode(mode)
											setPreviewReady(false)
										}}
										variant={priceMode === mode ? "primary" : "secondary"}
										size="sm"
									>
										{label}
									</Button>
								))}
							</div>
							<label className="block text-sm font-medium text-slate-700">
								Valor
								<Input
									type="number"
									min="0"
									value={value}
									onChange={(event) => {
										setValue(event.target.value)
										setPreviewReady(false)
									}}
									className="mt-1.5"
								/>
							</label>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									onClick={() => {
										setPreviewReady(true)
										setFeedback(`Se aplicará a ${selection.cells.length} noches-tarifa.`)
									}}
									variant="secondary"
								>
									Revisar
								</Button>
								<Button
									type="button"
									disabled={loading || !previewReady}
									onClick={() => void savePrice()}
								>
									Guardar
								</Button>
							</div>
						</div>
					)}
					{activeAction === "availability_units" && (
						<div className="mt-5 space-y-4">
							<label className="block text-sm font-medium text-slate-700">
								Cupo físico total
								<Input
									type="number"
									min="0"
									value={value}
									onChange={(event) => {
										setValue(event.target.value)
										setPreviewReady(false)
									}}
									className="mt-1.5"
								/>
							</label>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									onClick={() => {
										setPreviewReady(true)
										setFeedback(`Se actualizarán ${selection.variantIds.length} habitaciones.`)
									}}
									variant="secondary"
								>
									Revisar
								</Button>
								<Button
									type="button"
									disabled={loading || !previewReady}
									onClick={() => void saveAvailability()}
								>
									Guardar
								</Button>
							</div>
						</div>
					)}
					{[
						"availability_block",
						"stop_sell",
						"min_lead_time",
						"max_lead_time",
						"min_los",
						"max_los",
						"cta",
						"ctd",
					].includes(activeAction) && (
						<div className="mt-5 space-y-4">
							<p className="text-sm text-slate-600">
								La regla se aplicará a la selección y permanecerá activa durante este periodo.
							</p>
							{["min_lead_time", "max_lead_time", "min_los", "max_los"].includes(activeAction) && (
								<label className="block text-sm font-medium text-slate-700">
									Valor
									<Input
										type="number"
										min="1"
										value={value}
										onChange={(event) => {
											setValue(event.target.value)
											setPreviewReady(false)
										}}
										className="mt-1.5"
									/>
								</label>
							)}
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									onClick={() => {
										setPreviewReady(true)
										setFeedback(`La regla afectará ${selection.cells.length} noches-tarifa.`)
									}}
									variant="secondary"
								>
									Revisar
								</Button>
								<Button
									type="button"
									disabled={loading || !previewReady}
									onClick={() => void saveSellabilityRule()}
								>
									Guardar regla
								</Button>
							</div>
						</div>
					)}
					{activeAction === "cancellation_dates" && (
						<div className="mt-5 space-y-5">
							<div>
								<p className="text-sm font-semibold text-slate-950">Cancelación aplicable</p>
								<p className="mt-1 text-xs leading-5 text-slate-500">
									Se determina por la fecha de llegada. Las reservas ya confirmadas conservan su
									condición original.
								</p>
							</div>
							<label className="block text-sm font-medium text-slate-700">
								Condición
								<Select
									value={cancellationSource}
									onChange={(event) => {
										setCancellationSource(event.target.value)
										setCancellationPreview([])
										setCancellationPreviewReady(false)
										setFeedback("")
									}}
									className="mt-1.5"
								>
									<option value="">Seleccionar</option>
									<option value="base">Usar condición base de cada tarifa</option>
									{cancellationOptions.length > 0 && (
										<optgroup label="Condiciones publicadas">
											{cancellationOptions.map((policy) => (
												<option key={policy.id} value={`existing:${policy.id}`}>
													{policy.label}
												</option>
											))}
										</optgroup>
									)}
									{cancellationPresets.length > 0 && (
										<optgroup label="Plantillas">
											{cancellationPresets.map((preset) => (
												<option key={preset.key} value={`preset:${preset.key}`}>
													{preset.label}
												</option>
											))}
										</optgroup>
									)}
								</Select>
							</label>
							{cancellationPreview.length > 0 && (
								<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
									{cancellationPreview.map((item) => (
										<div
											key={item.key}
											className="border-b border-slate-100 px-3 py-2.5 last:border-b-0"
										>
											<p className="text-xs font-medium text-slate-500">{item.label}</p>
											<p className="mt-0.5 text-sm font-semibold text-slate-950">{item.value}</p>
											{item.detail && (
												<p className="mt-0.5 text-xs leading-5 text-slate-600">{item.detail}</p>
											)}
										</div>
									))}
								</div>
							)}
							<Notice variant="neutral">
								Al finalizar el rango, cada tarifa vuelve automáticamente a su condición base.
							</Notice>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									onClick={() => void previewCancellationDateAssignment()}
									variant="secondary"
									disabled={loading || !cancellationSource}
								>
									Revisar impacto
								</Button>
								<Button
									type="button"
									onClick={() => void saveCancellationDateAssignment()}
									disabled={loading || !cancellationPreviewReady}
								>
									{cancellationSource === "base" ? "Restaurar condición base" : "Guardar excepción"}
								</Button>
							</div>
						</div>
					)}
					{activeTab === "conditions" && activeAction === "conditions" && (
						<div className="mt-5 space-y-3">
							{selectedRows.map((row) => {
								const missing = row.cells[0]?.conditionsMissingCategories || []
								return (
									<article key={row.ratePlanId} className="fastt-row-card p-4">
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="font-semibold text-slate-950">{row.ratePlanName}</p>
												<p className="text-xs text-slate-500">
													{row.productName} · {row.variantName}
												</p>
											</div>
											<Badge variant={missing.length ? "warning" : "success"}>
												{missing.length ? `${missing.length} pendientes` : "Completo"}
											</Badge>
										</div>
										<p className="mt-2 line-clamp-2 text-sm text-slate-600">
											{row.cells[0]?.conditionsSummary}
										</p>
										{missing.length > 0 && (
											<details className="fastt-soft-box mt-3 border border-slate-200 bg-slate-50">
												<summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-700">
													Resolver pendientes
												</summary>
												<div className="flex flex-wrap gap-2 border-t border-slate-200 bg-white p-3">
													{missing.map((category) =>
														category === "CheckIn" ? (
															<Button
																key={category}
																href={`/provider/house-rules?productId=${encodeURIComponent(row.productId)}&focus=arrival`}
																size="sm"
															>
																Configurar llegada y salida
															</Button>
														) : (
															<Button
																key={category}
																type="button"
																className="policy-assignment-open"
																size="sm"
																data-assignment-mode="preset"
																data-assignment-scope="rate_plan"
																data-assignment-scope-id={row.ratePlanId}
																data-assignment-category={category}
															>
																Completar {CONDITION_LABELS[category] ?? category}
															</Button>
														)
													)}
												</div>
											</details>
										)}
										<div className="mt-3 flex justify-end">
											<Button href={row.policiesHref} variant="secondary" size="sm">
												{missing.length ? "Ver condiciones" : "Editar condiciones"}
											</Button>
										</div>
									</article>
								)
							})}
						</div>
					)}
					{activeTab === "rules" && (
						<div className="mt-5 space-y-3">
							{visibleRules.length === 0 ? (
								<Notice variant="neutral">
									{activeAction === "conflicts"
										? "No hay conflictos en esta selección."
										: "No hay reglas en esta selección."}
								</Notice>
							) : (
								visibleRules.map((rule) => (
									<article key={rule.id} className="fastt-row-card p-4">
										<div className="flex justify-between gap-3">
											<div>
												<Badge variant={rule.isActive ? "success" : "neutral"}>
													{rule.isActive ? "Activa" : "Pausada"}
												</Badge>
												<h3 className="mt-2 font-semibold text-slate-950">{rule.typeLabel}</h3>
												<p className="text-xs text-slate-500">{rule.targetName}</p>
											</div>
											<span className="text-xs font-semibold text-slate-700">
												{rule.valueLabel}
											</span>
										</div>
										<p className="mt-3 text-xs text-slate-600">
											Vigencia: {formatRange(rule.startDate, rule.endDate)}
										</p>
										<details className="mt-3 border-t border-slate-100 pt-3">
											<summary className="cursor-pointer list-none text-xs font-semibold text-slate-600 hover:text-slate-950">
												Gestionar regla
											</summary>
											<div className="mt-3 flex flex-wrap gap-2">
												<Button
													type="button"
													onClick={() => {
														setEditingMode("edit")
														setEditingRule(rule)
													}}
													variant="secondary"
													size="sm"
												>
													Editar
												</Button>
												<Button
													type="button"
													onClick={() => void mutateRule(rule, "toggle-rule")}
													variant="secondary"
													size="sm"
												>
													{rule.isActive ? "Pausar" : "Activar"}
												</Button>
												{rule.category === "price" && (
													<Button
														type="button"
														onClick={() => {
															setEditingMode("variant")
															setEditingRule(rule)
														}}
														variant="secondary"
														size="sm"
													>
														Crear variante
													</Button>
												)}
												<Button
													type="button"
													onClick={() => {
														if (window.confirm("¿Eliminar esta regla?"))
															void mutateRule(rule, "delete-rule")
													}}
													className="ml-auto"
													variant="danger"
													size="sm"
												>
													Eliminar
												</Button>
											</div>
											{editingRule?.id === rule.id && (
												<RuleEditor
													rule={rule}
													mode={editingMode}
													loading={loading}
													onCancel={() => setEditingRule(null)}
													onSave={(values) =>
														void mutateRule(
															rule,
															editingMode === "variant" ? "create-variant" : "update-rule",
															values
														)
													}
												/>
											)}
										</details>
									</article>
								))
							)}
						</div>
					)}
					{feedback && (
						<Notice variant="neutral" className="mt-4">
							{feedback}
						</Notice>
					)}
				</CalendarResponsiveDrawer>
			)}
		</div>
	)
}

function RuleEditor({
	rule,
	mode,
	loading,
	onCancel,
	onSave,
}: {
	rule: MultiCalendarAppliedRule
	mode: "edit" | "variant"
	loading: boolean
	onCancel: () => void
	onSave: (values: { startDate: string; endDate: string; value: string; priority: string }) => void
}) {
	const [startDate, setStartDate] = useState(rule.startDate)
	const [endDate, setEndDate] = useState(rule.endDate)
	const [value, setValue] = useState(String(rule.value ?? ""))
	const [priority, setPriority] = useState(String(rule.priority))
	return (
		<div className="fastt-soft-box mt-4 space-y-3 bg-slate-50 p-3">
			<p className="text-xs font-semibold text-slate-500 uppercase">
				{mode === "variant" ? "Nueva variante" : "Editar regla"}
			</p>
			<div className="grid grid-cols-2 gap-2">
				<label className="text-xs font-medium text-slate-600">
					Desde
					<Input
						type="date"
						value={startDate}
						onChange={(event) => setStartDate(event.target.value)}
						className="mt-1"
					/>
				</label>
				<label className="text-xs font-medium text-slate-600">
					Hasta
					<Input
						type="date"
						value={endDate}
						onChange={(event) => setEndDate(event.target.value)}
						className="mt-1"
					/>
				</label>
			</div>
			{rule.value != null && (
				<label className="block text-xs font-medium text-slate-600">
					Valor
					<Input
						type="number"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						className="mt-1"
					/>
				</label>
			)}
			<label className="block text-xs font-medium text-slate-600">
				Prioridad
				<Input
					type="number"
					min="0"
					max="1000"
					value={priority}
					onChange={(event) => setPriority(event.target.value)}
					className="mt-1"
				/>
			</label>
			<div className="flex justify-end gap-2">
				<Button type="button" onClick={onCancel} variant="ghost" size="sm">
					Cancelar
				</Button>
				<Button
					type="button"
					disabled={loading}
					onClick={() => onSave({ startDate, endDate, value, priority })}
					size="sm"
				>
					{mode === "variant" ? "Guardar variante" : "Guardar cambios"}
				</Button>
			</div>
		</div>
	)
}
