/** @jsxRuntime classic */
import React, { startTransition, useEffect, useMemo, useRef, useState } from "react"

import CalendarResponsiveDrawer from "@/components/rates/CalendarResponsiveDrawer"
import PricingBulkJobOperationPanel, {
	type PricingBulkJobView,
} from "@/components/pricing/PricingBulkJobOperationPanel"
import {
	Badge,
	Button,
	Card,
	ChoiceCard,
	FloatingPopover,
	IconButton,
	Input,
	Notice,
	Select,
} from "@/components/ui-react"
import {
	type CalendarControlMode,
	visibleCalendarActions,
} from "@/lib/rates/calendarControlCatalog"
import { CALENDAR_ACTION_ICONS } from "@/lib/rates/calendarActionIcons"
import { createBoundedClientCache } from "@/lib/rates/calendarSurfaceClientCache"
import type { SingleCalendarDay, SingleCalendarSurface } from "@/lib/rates/singleCalendarSurface"

type Props = {
	initialRatePlanId?: string
	initialVariantId?: string
	initialMonth?: string
	isProfessional: boolean
	initialMode?: CalendarControlMode
	guidedAvailability?: {
		playbook: "add-room" | "launch" | "launch-tour" | null
		productName: string
		variantName: string
		ratePlanName: string
		requiredDays: number
		initialInventoryDays: number
	}
}

type DrawerAction = "manual_price" | "inventory_units" | "stop_sell" | "min_los" | null

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const RANGE_PRESETS = [
	["visible_weekend", "Fin de semana"],
	["visible_month", "Vista visible"],
	["next_7", "Prox. 7 días"],
	["next_30", "Prox. 30 días"],
] as const
const CLIENT_SURFACE_TTL_MS = 60_000
const surfaceCache = createBoundedClientCache<SingleCalendarSurface>(12, CLIENT_SURFACE_TTL_MS)
const prefetches = new Map<string, Promise<SingleCalendarSurface>>()

function currentMonth() {
	return new Date().toISOString().slice(0, 7)
}

function surfaceCacheKey(ratePlanId: string, variantId: string, month: string) {
	return `${ratePlanId || "default"}:${variantId || "default"}:${month || currentMonth()}`
}

async function fetchCalendarSurface(
	request: { ratePlanId: string; variantId: string; month: string },
	signal?: AbortSignal
): Promise<SingleCalendarSurface> {
	const query = new URLSearchParams({ month: request.month })
	if (request.ratePlanId) query.set("ratePlanId", request.ratePlanId)
	if (request.variantId) query.set("variantId", request.variantId)
	const response = await fetch(`/api/rates/calendar?${query.toString()}`, { signal })
	const body = await response.json().catch(() => ({}))
	if (!response.ok || !body?.surface) {
		throw new Error(body?.error || "No se pudo actualizar el calendario")
	}
	const surface = body.surface as SingleCalendarSurface
	surfaceCache.set(
		surfaceCacheKey(surface.selectedRatePlanId, surface.selectedVariantId, surface.month),
		surface
	)
	surfaceCache.set(surfaceCacheKey(request.ratePlanId, request.variantId, request.month), surface)
	return surface
}

function prefetchCalendarSurface(request: {
	ratePlanId: string
	variantId: string
	month: string
}): Promise<SingleCalendarSurface> {
	const key = surfaceCacheKey(request.ratePlanId, request.variantId, request.month)
	const cached = surfaceCache.get(key)
	if (cached) return Promise.resolve(cached)
	const existing = prefetches.get(key)
	if (existing) return existing
	const pending = fetchCalendarSurface(request).finally(() => prefetches.delete(key))
	prefetches.set(key, pending)
	return pending
}

function localIsoDate() {
	const date = new Date()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
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

function monthLabel(value: string) {
	const label = new Intl.DateTimeFormat("es-BO", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${value}-01T12:00:00.000Z`))
	return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

function money(value: number | null, currency: string) {
	return value == null ? "Sin precio" : `${currency} ${Number(value).toFixed(0)}`
}

function cellPresentation(
	mode: CalendarControlMode,
	day: SingleCalendarDay,
	showComparison: boolean,
	showInventoryDetail: boolean
) {
	if (day.isPast) return { primary: "", secondary: "", tone: "past" }
	if (mode === "availability") {
		return {
			primary: `${day.availableUnits}/${day.totalUnits} cupos`,
			secondary: showInventoryDetail
				? `${day.bookedUnits} reservados · ${day.heldUnits} retenidos`
				: day.availableUnits > 0
					? "Disponible"
					: "Sin cupo",
			tone: day.availableUnits > 0 ? "neutral" : "warning",
		}
	}
	if (mode === "sellability") {
		return {
			primary: day.restrictionSignals.hasCommercialBlocker
				? "Venta cerrada"
				: day.restrictionSignals.count > 0
					? "Con reglas"
					: "Venta abierta",
			secondary: day.restrictionSignals.summary || "Sin restricciones",
			tone: day.restrictionSignals.hasCommercialBlocker
				? "danger"
				: day.restrictionSignals.count > 0
					? "info"
					: "neutral",
		}
	}
	if (mode === "conditions") {
		return {
			primary: "",
			secondary: "",
			tone: "neutral",
		}
	}
	return {
		primary: money(day.finalPrice, day.currency),
		secondary:
			showComparison && day.finalPrice != null
				? `Base ${money(day.baseComponent, day.currency)}`
				: day.finalPrice == null
					? ""
					: day.ruleAdjustment
						? `Ajuste ${day.ruleAdjustment > 0 ? "+" : ""}${day.ruleAdjustment}`
						: "Precio final",
		tone: day.finalPrice == null ? "warning" : "neutral",
	}
}

function toneClass(tone: string) {
	const tones: Record<string, string> = {
		past: "border-slate-100 bg-slate-50/50 text-slate-300",
		neutral: "border-slate-200 bg-white text-slate-950",
		warning: "border-slate-200 border-l-2 border-l-amber-400 bg-white text-slate-950",
		danger: "border-red-300 bg-red-50 text-red-950",
		info: "border-sky-300 bg-sky-50 text-sky-950",
	}
	return tones[tone] || tones.neutral
}

function actionTitle(action: DrawerAction) {
	if (action === "manual_price") return "Cambiar precio"
	if (action === "inventory_units") return "Cambiar cupo"
	if (action === "stop_sell") return "Cerrar venta"
	if (action === "min_los") return "Mínimo de noches"
	return "Editar selección"
}

export default function SingleCalendarWorkspace({
	initialRatePlanId = "",
	initialVariantId = "",
	initialMonth = currentMonth(),
	isProfessional,
	initialMode = "price",
	guidedAvailability,
}: Props) {
	const isTourGuidedAvailability = guidedAvailability?.playbook === "launch-tour"
	const guidedStartDate = isTourGuidedAvailability ? addDays(localIsoDate(), 1) : localIsoDate()
	const initialRequest = {
		ratePlanId: initialRatePlanId,
		variantId: initialVariantId,
		month: initialMonth,
	}
	const [surface, setSurface] = useState<SingleCalendarSurface | null>(() =>
		surfaceCache.get(surfaceCacheKey(initialRatePlanId, initialVariantId, initialMonth))
	)
	const [mode, setMode] = useState<CalendarControlMode>(
		!isProfessional && initialMode === "conditions" ? "price" : initialMode
	)
	const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
	const [rangeAnchor, setRangeAnchor] = useState("")
	const [drawerAction, setDrawerAction] = useState<DrawerAction>(null)
	const [showComparison, setShowComparison] = useState(false)
	const [showInventoryDetail, setShowInventoryDetail] = useState(false)
	const [value, setValue] = useState("")
	const [reviewed, setReviewed] = useState(false)
	const [loading, setLoading] = useState(!surface)
	const [feedback, setFeedback] = useState("")
	const [selectionHint, setSelectionHint] = useState("")
	const [selectionHintAction, setSelectionHintAction] = useState("")
	const [guidedFeedback, setGuidedFeedback] = useState("")
	const [guidedInventoryDays, setGuidedInventoryDays] = useState(
		Math.max(0, Number(guidedAvailability?.initialInventoryDays ?? 0))
	)
	const [guidedRange, setGuidedRange] = useState<"next_30" | "next_60" | "custom">("next_30")
	const [guidedFrom, setGuidedFrom] = useState(guidedStartDate)
	const [guidedTo, setGuidedTo] = useState(addDays(guidedStartDate, 29))
	const [guidedUnits, setGuidedUnits] = useState(1)
	const [gridDirection, setGridDirection] = useState<"previous" | "next" | "neutral">("neutral")
	const [updatedDates, setUpdatedDates] = useState<Set<string>>(new Set())
	const [pricingJobId, setPricingJobId] = useState<string | null>(null)
	const activeRequest = useRef<AbortController | null>(null)
	const requestSequence = useRef(0)
	const today = localIsoDate()
	const isGuidedAvailability = Boolean(guidedAvailability)
	const requiredGuidedDays = Math.max(1, Number(guidedAvailability?.requiredDays ?? 30))
	const guidedProgressPercent = Math.min(
		100,
		Math.round((guidedInventoryDays / requiredGuidedDays) * 100)
	)
	const guidedIsReady = guidedInventoryDays >= requiredGuidedDays

	const selected = useMemo(() => [...selectedDates].sort(), [selectedDates])

	useEffect(() => {
		if (!selectionHint) return
		const timeout = window.setTimeout(() => {
			setSelectionHint("")
			setSelectionHintAction("")
		}, 6000)
		return () => window.clearTimeout(timeout)
	}, [selectionHint])

	useEffect(() => {
		function onCalendarMode(event: Event) {
			const nextMode = String((event as CustomEvent<{ mode?: string }>).detail?.mode ?? "").trim()
			if (
				nextMode !== "price" &&
				nextMode !== "availability" &&
				nextMode !== "sellability" &&
				nextMode !== "conditions"
			) {
				return
			}
			if (!isProfessional && nextMode === "conditions") {
				setMode("price")
				return
			}
			setMode(nextMode)
		}
		window.addEventListener("fastt:calendar-mode", onCalendarMode)
		return () => window.removeEventListener("fastt:calendar-mode", onCalendarMode)
	}, [isProfessional])

	async function loadSurface(
		params: { ratePlanId?: string; variantId?: string; month?: string } = {},
		options: { force?: boolean; updateUrl?: boolean } = {}
	) {
		const requestedRatePlanId =
			params.ratePlanId || surface?.selectedRatePlanId || initialRatePlanId
		const requestedVariantId = params.variantId || surface?.selectedVariantId || initialVariantId
		const requestedMonth = params.month || surface?.month || initialMonth
		setGridDirection(
			surface && requestedMonth < surface.month
				? "previous"
				: surface && requestedMonth > surface.month
					? "next"
					: "neutral"
		)
		setFeedback("")
		const key = surfaceCacheKey(requestedRatePlanId, requestedVariantId, requestedMonth)
		if (options.force) surfaceCache.delete(key)
		const cached = options.force ? null : surfaceCache.get(key)
		if (cached) {
			activeRequest.current?.abort()
			startTransition(() => {
				setSurface(cached)
				setSelectedDates(new Set())
				setRangeAnchor("")
			})
			if (options.updateUrl !== false) {
				const nextUrl = new URL(window.location.href)
				nextUrl.searchParams.set("ratePlanId", cached.selectedRatePlanId)
				nextUrl.searchParams.set("month", cached.month)
				nextUrl.searchParams.set("focus", mode)
				window.history.replaceState(null, "", nextUrl)
			}
			setLoading(false)
			return
		}

		activeRequest.current?.abort()
		const prefetched = options.force ? null : prefetches.get(key)
		const controller = prefetched ? null : new AbortController()
		activeRequest.current = controller
		const sequence = ++requestSequence.current
		setLoading(true)
		try {
			const nextSurface = prefetched
				? await prefetched
				: await fetchCalendarSurface(
						{
							ratePlanId: requestedRatePlanId,
							variantId: requestedVariantId,
							month: requestedMonth,
						},
						controller?.signal
					)
			if (sequence !== requestSequence.current) return
			startTransition(() => {
				setSurface(nextSurface)
				setSelectedDates(new Set())
				setRangeAnchor("")
			})
			if (options.updateUrl !== false) {
				const nextUrl = new URL(window.location.href)
				nextUrl.searchParams.set("ratePlanId", nextSurface.selectedRatePlanId)
				nextUrl.searchParams.set("month", nextSurface.month)
				nextUrl.searchParams.set("focus", mode)
				window.history.replaceState(null, "", nextUrl)
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return
			setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el calendario")
		} finally {
			if (sequence === requestSequence.current) setLoading(false)
		}
	}

	useEffect(() => {
		if (surface) {
			setLoading(false)
			return
		}
		void loadSurface(initialRequest, { updateUrl: false })
		return () => activeRequest.current?.abort()
	}, [])

	useEffect(() => {
		if (!surface) return
		const firstAvailable = surface.days.find((day) => !day.isPast && day.totalUnits > 0)
		if (firstAvailable) setGuidedUnits(Math.max(1, Number(firstAvailable.totalUnits)))
		const idleWindow = window as Window & {
			requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
			cancelIdleCallback?: (handle: number) => void
		}
		const prefetch = () => {
			void Promise.allSettled(
				[surface.previousMonth, surface.nextMonth].map((month) =>
					prefetchCalendarSurface({
						ratePlanId: surface.selectedRatePlanId,
						variantId: surface.selectedVariantId,
						month,
					})
				)
			)
		}
		const handle = idleWindow.requestIdleCallback
			? idleWindow.requestIdleCallback(prefetch, { timeout: 1200 })
			: window.setTimeout(prefetch, 500)
		return () => {
			if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(handle)
			else window.clearTimeout(handle)
		}
	}, [surface])

	useEffect(() => {
		if (!updatedDates.size) return
		const timeout = window.setTimeout(() => setUpdatedDates(new Set()), 850)
		return () => window.clearTimeout(timeout)
	}, [updatedDates])

	if (!surface) {
		return (
			<section
				className="fastt-workspace-panel overflow-hidden border border-slate-200 bg-white p-4 text-slate-900"
				aria-busy="true"
			>
				<div className="animate-pulse">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="space-y-2">
							<div className="h-3 w-16 rounded-md bg-neutral-200" />
							<div className="h-10 w-72 max-w-[75vw] rounded-md bg-neutral-100" />
						</div>
						<div className="flex gap-2">
							<div className="h-9 w-24 rounded-md bg-neutral-100" />
							<div className="h-9 w-32 rounded-md bg-neutral-100" />
						</div>
					</div>
					<div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
						<div className="h-3 w-24 rounded-md bg-neutral-200" />
						<div className="mt-3 grid gap-3 sm:grid-cols-3">
							{Array.from({ length: 3 }).map((_, index) => (
								<div key={index} className="h-10 rounded-md border border-neutral-200 bg-white" />
							))}
						</div>
					</div>
					<div className="mt-5 flex items-center justify-between border-b border-neutral-200 pb-3">
						<div className="h-7 w-36 rounded-md bg-neutral-200" />
						<div className="flex gap-2">
							<div className="size-8 rounded-md bg-neutral-100" />
							<div className="size-8 rounded-md bg-neutral-100" />
						</div>
					</div>
					<div className="mt-3 grid grid-cols-7 gap-1.5 md:gap-2">
						{Array.from({ length: 7 }).map((_, index) => (
							<div
								key={`weekday-${index}`}
								className="mx-auto h-3 w-5 rounded-md bg-neutral-100 sm:w-10"
							/>
						))}
						{Array.from({ length: 28 }).map((_, index) => (
							<div
								key={index}
								className="min-h-20 rounded-md border border-neutral-200 bg-neutral-50 p-2 md:min-h-24"
							>
								<div className="size-4 rounded-md bg-neutral-200" />
								{index % 3 !== 0 && <div className="mt-5 h-2.5 w-3/5 rounded-md bg-neutral-100" />}
							</div>
						))}
					</div>
				</div>
				{feedback && (
					<div className="mt-4 flex items-center justify-between gap-3 text-sm text-red-700">
						<span>{feedback}</span>
						<Button
							type="button"
							variant="secondary"
							onClick={() => void loadSurface(initialRequest)}
						>
							Reintentar
						</Button>
					</div>
				)}
				<span className="sr-only">Cargando calendario</span>
			</section>
		)
	}

	const readySurface = surface
	const selection = {
		from: selected[0] || "",
		to: selected[selected.length - 1] || "",
		count: selected.length,
	}
	const selectedExternalDays = readySurface.days.filter(
		(day) => selectedDates.has(day.date) && day.externalCalendar
	)
	const externalDays = readySurface.days.filter((day) => day.externalCalendar?.eventCount)
	const conflictDays = readySurface.days.filter((day) => day.externalCalendar?.conflictCount)

	function selectDate(day: SingleCalendarDay) {
		if (day.isPast) return
		setSelectionHint("")
		setSelectionHintAction("")
		if (!rangeAnchor || selectedDates.size !== 1) {
			setSelectedDates(new Set([day.date]))
			setRangeAnchor(day.date)
			return
		}
		const from = rangeAnchor < day.date ? rangeAnchor : day.date
		const to = rangeAnchor < day.date ? day.date : rangeAnchor
		setSelectedDates(
			new Set(
				readySurface.days
					.filter((item) => !item.isPast && item.date >= from && item.date <= to)
					.map((item) => item.date)
			)
		)
		setRangeAnchor("")
	}

	function applyPreset(kind: string) {
		setSelectionHint("")
		setSelectionHintAction("")
		const today = new Date().toISOString().slice(0, 10)
		const max =
			kind === "next_7" ? addDays(today, 6) : kind === "next_30" ? addDays(today, 29) : "9999-12-31"
		setSelectedDates(
			new Set(
				readySurface.days
					.filter((day) => {
						if (day.isPast) return false
						const weekday = new Date(`${day.date}T12:00:00.000Z`).getUTCDay()
						if (kind === "visible_weekend") return weekday === 5 || weekday === 6
						if (kind === "visible_month") return true
						return day.date >= today && day.date <= max
					})
					.map((day) => day.date)
			)
		)
		setRangeAnchor("")
	}

	function setGuidedPreset(kind: "next_30" | "next_60" | "custom") {
		setGuidedRange(kind)
		const start = guidedStartDate
		if (kind === "next_30") {
			setGuidedFrom(start)
			setGuidedTo(addDays(start, 29))
		}
		if (kind === "next_60") {
			setGuidedFrom(start)
			setGuidedTo(addDays(start, 59))
		}
	}

	function guidedNightCount() {
		if (!guidedFrom || !guidedTo || guidedTo < guidedFrom) return 0
		const start = new Date(`${guidedFrom}T12:00:00.000Z`)
		const end = new Date(`${guidedTo}T12:00:00.000Z`)
		return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
	}

	async function applyGuidedAvailability() {
		const nights = guidedNightCount()
		const units = Math.trunc(Number(guidedUnits))
		if (!readySurface.selectedVariantId) {
			setGuidedFeedback(
				isTourGuidedAvailability
					? "No hay una salida seleccionada para abrir disponibilidad."
					: "No hay una habitación seleccionada para abrir disponibilidad."
			)
			return
		}
		if (!guidedFrom || !guidedTo || guidedTo < guidedFrom || nights <= 0) {
			setGuidedFeedback("Elige un rango de fechas válido.")
			return
		}
		if (isTourGuidedAvailability && guidedFrom <= localIsoDate()) {
			setGuidedFeedback("La primera fecha reservable debe ser futura.")
			return
		}
		if (!Number.isFinite(units) || units < 1) {
			setGuidedFeedback(
				isTourGuidedAvailability
					? "El cupo de participantes debe ser al menos 1."
					: "El cupo por noche debe ser al menos 1."
			)
			return
		}

		setLoading(true)
		setGuidedFeedback("Abriendo disponibilidad inicial...")
		try {
			const response = await fetch("/api/inventory/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selection: { variantIds: [readySurface.selectedVariantId] },
					dateRange: { from: guidedFrom, to: addDays(guidedTo, 1) },
					operation: { type: "SET_INVENTORY", value: units },
					context: { source: "playbook-availability" },
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0) {
				throw new Error(
					body?.failures?.[0]?.error || body?.error || "No se pudo abrir disponibilidad"
				)
			}
			const changedDates = new Set(
				readySurface.days
					.filter((day) => day.date >= guidedFrom && day.date <= guidedTo)
					.map((day) => day.date)
			)
			surfaceCache.clear()
			await loadSurface({}, { force: true })
			setUpdatedDates(changedDates)
			setSelectedDates(changedDates)
			setRangeAnchor("")
			setGuidedInventoryDays((current) => Math.max(current, nights))
			setGuidedFeedback(
				isTourGuidedAvailability
					? `Disponibilidad abierta para ${nights} ${nights === 1 ? "fecha" : "fechas"} con cupo para ${units} ${units === 1 ? "participante" : "participantes"} por salida.`
					: `Disponibilidad abierta para ${nights} ${nights === 1 ? "noche" : "noches"} con ${units} ${units === 1 ? "unidad" : "unidades"} por noche.`
			)
		} catch (error) {
			setGuidedFeedback(error instanceof Error ? error.message : "No se pudo abrir disponibilidad")
		} finally {
			setLoading(false)
		}
	}

	function multiCalendarHref(tab: string) {
		const query = new URLSearchParams({
			tab,
			ratePlanId: readySurface.selectedRatePlanId,
			month: readySurface.month,
		})
		if (selection.from) query.set("from", selection.from)
		if (selection.to) query.set("to", selection.to)
		return `/rates/multi-calendar?${query.toString()}`
	}

	function openAction(id: string) {
		if (id === "price_comparison") return setShowComparison((current) => !current)
		if (id === "inventory_detail") return setShowInventoryDetail((current) => !current)
		if (id === "conditions") {
			window.location.href = `/rates/plans/${encodeURIComponent(readySurface.selectedRatePlanId)}?vista=conditions`
			return
		}
		if (["price_rules", "availability_scale", "sellability_rules", "applied_rules"].includes(id)) {
			window.location.href = multiCalendarHref(
				id === "price_rules"
					? "price"
					: id === "availability_scale"
						? "availability"
						: id === "applied_rules"
							? "rules"
							: "sellability"
			)
			return
		}
		if (!selection.count) {
			setSelectionHint(
				id === "manual_price"
					? "Selecciona una fecha o rango para cambiar el precio."
					: "Selecciona una fecha o rango antes de aplicar este cambio."
			)
			setSelectionHintAction(id)
			return
		}
		setSelectionHint("")
		setSelectionHintAction("")
		setValue(id === "min_los" ? "2" : "")
		setReviewed(false)
		setPricingJobId(null)
		setFeedback("")
		setDrawerAction(id as DrawerAction)
	}

	async function enqueueManualPricingJob() {
		const idempotencyKey = `calendar-pricing:apply:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
		const response = await fetch("/api/pricing/bulk-jobs", {
			method: "POST",
			headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
			body: JSON.stringify({
				ratePlanIds: [readySurface.selectedRatePlanId],
				operation: {
					type: "fixed_override",
					value: Number(value),
					conditions: {
						priority: 1000,
						dateFrom: selection.from,
						dateTo: selection.to,
						previewFrom: selection.from,
						effectiveFrom: selection.from,
						effectiveTo: addDays(selection.to, 1),
						contextKey: "manual",
					},
				},
			}),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok || !body?.job?.id)
			throw new Error(body?.error || "No se pudo preparar la operación de precios.")
		setPricingJobId(String(body.job.id))
		setFeedback("La operación fue preparada y se aplicará en segundo plano.")
	}

	async function reviewMutation() {
		const numeric = drawerAction === "stop_sell" ? 0 : Number(value)
		if (!Number.isFinite(numeric) || numeric < 0) return setFeedback("Ingresa un valor válido.")
		setLoading(true)
		try {
			if (drawerAction === "manual_price") {
				const response = await fetch("/api/pricing/rules/v2/bulk-preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						ratePlanIds: [readySurface.selectedRatePlanId],
						operation: {
							type: "fixed_override",
							value: numeric,
							conditions: {
								priority: 1000,
								dateFrom: selection.from,
								dateTo: selection.to,
								previewFrom: selection.from,
								effectiveFrom: selection.from,
								effectiveTo: addDays(selection.to, 1),
								contextKey: "manual",
							},
						},
						dryRun: true,
					}),
				})
				const body = await response.json().catch(() => ({}))
				if (!response.ok) throw new Error(body?.error || "No se pudo revisar el cambio")
			}
			if (drawerAction === "inventory_units") {
				const response = await fetch("/api/inventory/bulk-preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						selection: { variantIds: [readySurface.selectedVariantId] },
						dateRange: { from: selection.from, to: addDays(selection.to, 1) },
						operation: { type: "SET_INVENTORY", value: Math.trunc(numeric) },
						context: { dryRun: true, source: "calendar" },
					}),
				})
				const body = await response.json().catch(() => ({}))
				if (!response.ok) throw new Error(body?.error || "No se pudo revisar el cupo")
			}
			setReviewed(true)
			setFeedback(`Impactará ${selection.count} ${selection.count === 1 ? "noche" : "noches"}.`)
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "No se pudo revisar el cambio")
		} finally {
			setLoading(false)
		}
	}

	async function saveMutation() {
		if (!drawerAction || !reviewed) return
		const numeric = Number(value)
		setLoading(true)
		try {
			let response: Response
			if (drawerAction === "manual_price") {
				await enqueueManualPricingJob()
				return
			} else if (drawerAction === "inventory_units") {
				response = await fetch("/api/inventory/bulk-apply", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						selection: { variantIds: [readySurface.selectedVariantId] },
						dateRange: { from: selection.from, to: addDays(selection.to, 1) },
						operation: { type: "SET_INVENTORY", value: Math.trunc(numeric) },
						context: { source: "calendar" },
					}),
				})
			} else {
				const form = new FormData()
				form.set("action", "create")
				form.set("scope", "rate_plan")
				form.set("rate_planScopeId", readySurface.selectedRatePlanId)
				form.set("startDate", selection.from)
				form.set("endDate", selection.to)
				form.set("type", drawerAction)
				if (drawerAction === "min_los") form.set("value", String(Math.trunc(numeric)))
				response = await fetch("/api/rates/commercial-rules", {
					method: "POST",
					body: form,
					headers: { Accept: "application/json" },
				})
			}
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0) {
				throw new Error(body?.failures?.[0]?.error || body?.error || "No se pudo guardar")
			}
			const changedDates = new Set(selected)
			surfaceCache.clear()
			await loadSurface({}, { force: true })
			setUpdatedDates(changedDates)
			setDrawerAction(null)
			setFeedback("Cambio guardado.")
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "No se pudo guardar")
		} finally {
			setLoading(false)
		}
	}

	const actions = visibleCalendarActions(mode, isProfessional)
	const activeDays = readySurface.days.filter((day) => !day.isPast)
	const missingPriceDays = activeDays.filter((day) => day.finalPrice == null).length
	const noInventoryDays = activeDays.filter((day) => day.availableUnits <= 0).length
	const closedDays = activeDays.filter((day) => day.restrictionSignals.hasCommercialBlocker).length
	const summary =
		mode === "price"
			? missingPriceDays
				? `${missingPriceDays} días sin precio`
				: "Precios completos"
			: mode === "availability"
				? noInventoryDays
					? `${noInventoryDays} días sin cupo`
					: "Cupo disponible"
				: mode === "sellability"
					? closedDays
						? `${closedDays} días cerrados`
						: "Venta abierta"
					: readySurface.conditions.complete
						? "Condiciones completas"
						: readySurface.conditions.missingSummary
	const summaryIsHealthy =
		mode === "price"
			? missingPriceDays === 0
			: mode === "availability"
				? noInventoryDays === 0
				: mode === "sellability"
					? closedDays === 0
					: readySurface.conditions.complete
	const guidedNights = guidedNightCount()

	return (
		<div className="space-y-5" aria-busy={loading}>
			{isGuidedAvailability && guidedAvailability && (
				<Card as="section" className="fastt-workspace-panel overflow-hidden p-0 text-slate-900">
					<div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
						<div className="space-y-5 p-5 md:p-6">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<h2 className="text-xl font-semibold text-slate-950">
											{isTourGuidedAvailability
												? "Abre la primera fecha reservable"
												: "Abrir disponibilidad inicial"}
										</h2>
										<Badge variant={guidedIsReady ? "success" : "warning"}>
											{guidedIsReady ? "Lista" : "Pendiente"}
										</Badge>
									</div>
									<p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
										{isTourGuidedAvailability
											? "Elige una o más fechas futuras y asigna el cupo de participantes. Con al menos una fecha con cupo, la salida queda lista para reservar."
											: "Configura un primer rango vendible. Esto solo abre cupo; precios y condiciones ya se revisaron en los pasos anteriores."}
									</p>
								</div>
								<div className="min-w-36 text-right">
									<p className="text-xs font-semibold text-slate-500 uppercase">Meta</p>
									<p className="mt-1 text-sm font-semibold text-slate-950">
										{Math.min(guidedInventoryDays, requiredGuidedDays)}/{requiredGuidedDays}{" "}
										{isTourGuidedAvailability
											? requiredGuidedDays === 1
												? "fecha futura"
												: "fechas futuras"
											: "noches"}
									</p>
									<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
										<div
											className="h-full rounded-full bg-[var(--fastt-color-selection)]"
											style={{ width: `${guidedProgressPercent}%` }}
										/>
									</div>
								</div>
							</div>

							<div className="grid gap-3 md:grid-cols-3">
								<ChoiceCard
									selected={guidedRange === "next_30"}
									onClick={() => setGuidedPreset("next_30")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Próximos 30 días</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">
										Recomendado para publicar.
									</p>
								</ChoiceCard>
								<ChoiceCard
									selected={guidedRange === "next_60"}
									onClick={() => setGuidedPreset("next_60")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Próximos 60 días</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">Más margen para reservas.</p>
								</ChoiceCard>
								<ChoiceCard
									selected={guidedRange === "custom"}
									onClick={() => setGuidedPreset("custom")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Personalizado</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">Elige fechas exactas.</p>
								</ChoiceCard>
							</div>

							<div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
								<label className="block text-sm">
									<span className="font-medium text-slate-800">Desde</span>
									<Input
										type="date"
										value={guidedFrom}
										min={guidedStartDate}
										onChange={(event) => {
											setGuidedRange("custom")
											setGuidedFrom(event.target.value)
										}}
										className="mt-1.5"
									/>
								</label>
								<label className="block text-sm">
									<span className="font-medium text-slate-800">Hasta</span>
									<Input
										type="date"
										value={guidedTo}
										min={guidedFrom || localIsoDate()}
										onChange={(event) => {
											setGuidedRange("custom")
											setGuidedTo(event.target.value)
										}}
										className="mt-1.5"
									/>
								</label>
								<label className="block text-sm">
									<span className="font-medium text-slate-800">
										{isTourGuidedAvailability ? "Cupo de participantes" : "Cupo por noche"}
									</span>
									<Input
										type="number"
										min="1"
										step="1"
										value={guidedUnits}
										onChange={(event) => setGuidedUnits(Number(event.target.value))}
										className="mt-1.5"
									/>
								</label>
							</div>

							<div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm leading-6 text-slate-500">
									{guidedNights > 0
										? isTourGuidedAvailability
											? `Abrirás ${guidedNights} ${guidedNights === 1 ? "fecha" : "fechas"} con cupo para ${guidedUnits || 0} ${Number(guidedUnits) === 1 ? "participante" : "participantes"} por salida.`
											: `Abrirás ${guidedNights} ${guidedNights === 1 ? "noche" : "noches"} con ${guidedUnits || 0} ${Number(guidedUnits) === 1 ? "unidad" : "unidades"} disponible por noche.`
										: "Selecciona un rango para calcular la disponibilidad inicial."}
								</p>
								<Button
									type="button"
									onClick={() => void applyGuidedAvailability()}
									disabled={loading}
									className="fastt-playbook-cta"
								>
									Abrir disponibilidad
								</Button>
							</div>

							{guidedFeedback && (
								<Notice variant={guidedIsReady ? "success" : "info"}>{guidedFeedback}</Notice>
							)}
						</div>

						<aside className="border-t border-slate-200 bg-slate-50 p-5 md:p-6 lg:border-t-0 lg:border-l">
							<p className="text-xs font-semibold text-slate-500 uppercase">Contexto</p>
							<dl className="mt-4 space-y-4 text-sm">
								<div>
									<dt className="text-slate-500">
										{isTourGuidedAvailability ? "Salida" : "Habitación"}
									</dt>
									<dd className="mt-1 font-semibold text-slate-950">
										{guidedAvailability.variantName || readySurface.selectedContext}
									</dd>
								</div>
								<div>
									<dt className="text-slate-500">Tarifa</dt>
									<dd className="mt-1 font-semibold text-slate-950">
										{guidedAvailability.ratePlanName || readySurface.selectedRatePlanName}
									</dd>
								</div>
								<div>
									<dt className="text-slate-500">Después de este paso</dt>
									<dd className="mt-1 leading-6 text-slate-700">
										Podrás ajustar cierres, reglas y cupos diarios desde el calendario operativo.
									</dd>
								</div>
							</dl>
						</aside>
					</div>
				</Card>
			)}

			<Card
				as="section"
				className="fastt-workspace-panel relative z-10 !overflow-visible p-4 text-slate-900"
			>
				{loading && <span className="calendar-loading-bar" aria-hidden="true" />}

				{!isGuidedAvailability ? (
					<div className="flex flex-wrap items-center gap-3 lg:gap-4">
						<div className="flex shrink-0 items-center gap-2">
							<IconButton
								onClick={() => void loadSurface({ month: readySurface.previousMonth })}
								label="Mes anterior"
								size="sm"
							>
								‹
							</IconButton>
							<h2 className="min-w-[10rem] text-center text-base font-semibold text-slate-950">
								{monthLabel(readySurface.month)}
							</h2>
							<IconButton
								onClick={() => void loadSurface({ month: readySurface.nextMonth })}
								label="Mes siguiente"
								size="sm"
							>
								›
							</IconButton>
						</div>
						<label className="fastt-prompt-field min-w-0 flex-1" htmlFor="calendar-rate-plan">
							<span className="fastt-prompt-field__copy">
								<span className="fastt-prompt-field__label">Tarifa</span>
								<Select
									id="calendar-rate-plan"
									value={readySurface.selectedRatePlanId}
									onChange={(event) => void loadSurface({ ratePlanId: event.target.value })}
								>
									{readySurface.ratePlans.map((ratePlan) => (
										<option key={ratePlan.id} value={ratePlan.id}>
											{ratePlan.context} · {ratePlan.name}
										</option>
									))}
								</Select>
							</span>
						</label>
					</div>
				) : null}

				<div className="fastt-calendar-toolbar sticky top-3 z-20 mt-4 p-3">
					{isGuidedAvailability ? (
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-semibold text-slate-950">Vista de apoyo</p>
								<p className="text-xs text-slate-500">
									{isTourGuidedAvailability
										? "Revisa visualmente las fechas y los cupos de esta salida."
										: "Revisa visualmente los cupos abiertos para esta habitación."}
								</p>
							</div>
							<Button
								type="button"
								onClick={() => setShowInventoryDetail((current) => !current)}
								variant="secondary"
								size="sm"
							>
								{showInventoryDetail ? "Ocultar detalle" : "Ver detalle físico"}
							</Button>
						</div>
					) : (
						<>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex flex-wrap gap-2">
									{actions.map((action) => {
										const ActionIcon = CALENDAR_ACTION_ICONS[action.id]
										const actionLabel =
											action.id === "price_comparison" && showComparison
												? "Ocultar base y final"
												: action.id === "inventory_detail" && showInventoryDetail
													? "Ocultar detalle físico"
													: action.label
										return (
											<div key={action.id} className="relative">
												<Button
													type="button"
													onClick={() => openAction(action.id)}
													variant={action.kind === "mutation" ? "primary" : "secondary"}
													size="sm"
													aria-describedby={
														selectionHintAction === action.id
															? "calendar-selection-hint"
															: undefined
													}
												>
													{ActionIcon ? (
														<ActionIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
													) : null}
													{actionLabel}
												</Button>
												{selectionHintAction === action.id && selectionHint ? (
													<FloatingPopover
														id="calendar-selection-hint"
														title="Selecciona fechas para continuar"
													>
														<p>{selectionHint} Usa una fecha del calendario o un rango rápido.</p>
													</FloatingPopover>
												) : null}
											</div>
										)
									})}
									{selection.count > 0 && (
										<Button
											type="button"
											onClick={() => {
												setSelectedDates(new Set())
												setRangeAnchor("")
												setSelectionHint("")
												setSelectionHintAction("")
											}}
											variant="ghost"
											size="sm"
										>
											Limpiar
										</Button>
									)}
								</div>
								<p
									className={`shrink-0 text-xs font-medium ${
										summaryIsHealthy ? "text-slate-500" : "text-amber-700"
									}`}
								>
									{summary}
								</p>
							</div>
						</>
					)}
				</div>

				{selectedExternalDays.length > 0 && (
					<Notice
						variant={
							selectedExternalDays.some((day) => day.externalCalendar?.conflictCount)
								? "warning"
								: "info"
						}
					>
						<p className="font-semibold">
							{selectedExternalDays.length === 1
								? "La fecha seleccionada tiene actividad externa"
								: `${selectedExternalDays.length} fechas seleccionadas tienen actividad externa`}
						</p>
						<p className="mt-1">
							Los bloqueos ya están incluidos en el cupo disponible. Revisa la conexión antes de
							abrir inventario sobre estas fechas.
						</p>
						<Button
							href="/rates/calendar/connections?view=conflicts"
							variant="secondary"
							size="sm"
							className="mt-3"
						>
							Revisar calendarios
						</Button>
					</Notice>
				)}
			</Card>

			<Card as="section" className="fastt-workspace-panel overflow-hidden p-0 text-slate-900">
				<div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-2 sm:justify-between">
					{isGuidedAvailability ? (
						<div className="flex items-center gap-2">
							<IconButton
								onClick={() => void loadSurface({ month: readySurface.previousMonth })}
								label="Mes anterior"
								size="sm"
							>
								‹
							</IconButton>
							<h2 className="text-base font-semibold text-slate-950">
								{monthLabel(readySurface.month)}
							</h2>
							<IconButton
								onClick={() => void loadSurface({ month: readySurface.nextMonth })}
								label="Mes siguiente"
								size="sm"
							>
								›
							</IconButton>
						</div>
					) : (
						<div className="min-w-0">
							<p className="font-semibold text-slate-950">
								{selection.count
									? formatRange(selection.from, selection.to, true)
									: mode === "conditions"
										? readySurface.conditions.summary
										: "Selecciona una fecha o rango"}
							</p>
							{selection.count > 0 && (
								<p className="text-xs text-slate-500">
									{selection.count} {selection.count === 1 ? "noche" : "noches"} ·{" "}
									{readySurface.selectedRatePlanName}
								</p>
							)}
						</div>
					)}
					{isGuidedAvailability ? (
						<p
							className={`text-xs font-medium ${
								summaryIsHealthy ? "text-slate-500" : "text-amber-700"
							}`}
						>
							{summary}
						</p>
					) : (
						<>
							<div className="hidden flex-wrap gap-1.5 sm:flex" aria-label="Atajos de rango">
								{RANGE_PRESETS.map(([id, label]) => (
									<button
										key={id}
										type="button"
										onClick={() => applyPreset(id)}
										className="inline-flex h-8 items-center rounded-full px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
									>
										{label}
									</button>
								))}
							</div>
							<details className="relative sm:hidden">
								<summary className="fastt-button inline-flex min-h-8 cursor-pointer list-none items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
									Rangos
								</summary>
								<div className="fastt-soft-box absolute top-full right-0 z-30 mt-2 w-44 space-y-1 border border-slate-200 bg-white p-1.5 shadow-lg">
									{RANGE_PRESETS.map(([id, label]) => (
										<Button
											key={id}
											type="button"
											onClick={(event) => {
												applyPreset(id)
												event.currentTarget.closest("details")?.removeAttribute("open")
											}}
											variant="ghost"
											size="sm"
											className="w-full justify-start"
										>
											{label}
										</Button>
									))}
								</div>
							</details>
						</>
					)}
				</div>
				<div className="px-4 pb-4">
					{(externalDays.length > 0 || conflictDays.length > 0) && (
						<div
							className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600"
							aria-label="Leyenda de calendarios externos"
						>
							<span className="inline-flex items-center gap-2">
								<span className="size-2 rounded-full bg-sky-500" aria-hidden="true" />
								Bloqueo externo
							</span>
							{conflictDays.length > 0 && (
								<span className="inline-flex items-center gap-2">
									<span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
									Conflicto por revisar
								</span>
							)}
						</div>
					)}

					<div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 md:gap-2 md:text-xs">
						{WEEKDAYS.map((weekday) => (
							<div key={weekday}>{weekday}</div>
						))}
					</div>
					<div
						key={`${readySurface.selectedRatePlanId}:${readySurface.month}`}
						data-direction={gridDirection}
						className="calendar-grid-enter mt-1 grid grid-cols-7 gap-1 md:gap-2"
					>
						{Array.from({ length: readySurface.leadingBlankDays }).map((_, index) => (
							<div key={`blank-${index}`} className="min-h-20 md:min-h-28" />
						))}
						{readySurface.days.map((day) => {
							const presentation = cellPresentation(mode, day, showComparison, showInventoryDetail)
							const external = day.externalCalendar
							const isSelected = selectedDates.has(day.date)
							const isToday = day.date === today
							const selectionEdge = !isSelected
								? undefined
								: selection.count === 1
									? "single"
									: day.date === selection.from
										? "start"
										: day.date === selection.to
											? "end"
											: "middle"
							return (
								<button
									key={day.date}
									type="button"
									disabled={day.isPast}
									onClick={() => selectDate(day)}
									aria-label={`${formatDate(day.date, true)}${presentation.primary ? ` · ${presentation.primary}` : ""}${external?.eventCount ? ` · ${external.eventCount} bloqueo externo` : ""}${external?.conflictCount ? ` · ${external.conflictCount} conflicto` : ""}`}
									aria-pressed={isSelected}
									data-external-calendar-day={external?.eventCount ? "true" : undefined}
									data-external-calendar-conflict={external?.conflictCount ? "true" : undefined}
									data-selected={isSelected}
									data-selection-edge={selectionEdge}
									data-today={isToday}
									className={`calendar-cell fastt-calendar-cell min-h-20 border p-1.5 text-left disabled:cursor-default md:min-h-28 md:p-2 ${updatedDates.has(day.date) ? "calendar-updated" : ""} ${external?.conflictCount ? "ring-1 ring-amber-400" : external?.eventCount ? "border-sky-300" : ""} ${toneClass(presentation.tone)}`}
								>
									<div className="flex items-start justify-end gap-1.5">
										{isToday && (
											<span
												className="mt-1.5 size-1.5 rounded-full bg-slate-950"
												aria-label="Hoy"
											/>
										)}
										<span
											className={`text-sm font-semibold md:text-base ${isToday ? "text-sky-700" : ""}`}
										>
											{day.day}
										</span>
									</div>
									{!day.isPast && presentation.primary && (
										<div key={mode} className="calendar-cell-content">
											<p className="mt-2 truncate text-[11px] font-semibold md:text-sm">
												{presentation.primary}
											</p>
											{presentation.secondary && (
												<p className="mt-1 line-clamp-2 hidden text-[9px] leading-4 opacity-65 sm:block md:text-[11px]">
													{presentation.secondary}
												</p>
											)}
										</div>
									)}
									{!day.isPast && external?.eventCount ? (
										<div className="mt-1 flex items-center gap-1 overflow-hidden">
											<span
												className={`size-1.5 shrink-0 rounded-full ${
													external.conflictCount ? "bg-amber-500" : "bg-sky-500"
												}`}
												aria-hidden="true"
											/>
											<span className="truncate text-[9px] font-semibold text-slate-600 md:text-[10px]">
												{external.conflictCount
													? `${external.conflictCount} conflicto${external.conflictCount === 1 ? "" : "s"}`
													: `${external.eventCount} externo${external.eventCount === 1 ? "" : "s"}`}
											</span>
										</div>
									) : null}
								</button>
							)
						})}
					</div>
				</div>
			</Card>

			{feedback && !drawerAction && (
				<p className="text-sm font-medium text-slate-200">{feedback}</p>
			)}

			{drawerAction && (
				<CalendarResponsiveDrawer
					title={actionTitle(drawerAction)}
					meta={`${formatRange(selection.from, selection.to, true)} · ${readySurface.selectedRatePlanName}`}
					onClose={() => {
						setDrawerAction(null)
						setPricingJobId(null)
					}}
				>
					{pricingJobId ? (
						<div className="mt-5">
							<PricingBulkJobOperationPanel
								jobId={pricingJobId}
								onTerminal={(result: PricingBulkJobView) => {
									if (result.job.status === "succeeded" || result.job.status === "partial") {
										surfaceCache.clear()
										void loadSurface({}, { force: true })
										setUpdatedDates(new Set(selectedDates))
										setReviewed(false)
									}
								}}
							/>
						</div>
					) : (
						<div className="mt-5 space-y-4">
							{drawerAction === "stop_sell" ? (
								<Notice variant="warning">
									Cerrará la venta de esta tarifa durante el rango seleccionado.
								</Notice>
							) : (
								<label className="block text-sm font-medium text-slate-700">
									{drawerAction === "manual_price"
										? "Precio final"
										: drawerAction === "inventory_units"
											? "Cupo físico total"
											: "Noches mínimas"}
									<Input
										type="number"
										min="0"
										value={value}
										onChange={(event) => {
											setValue(event.target.value)
											setReviewed(false)
										}}
										className="mt-1.5"
									/>
								</label>
							)}
							{feedback && <p className="text-sm text-slate-600">{feedback}</p>}
							<div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
								<Button
									type="button"
									disabled={loading}
									onClick={() => void reviewMutation()}
									variant="secondary"
								>
									Revisar
								</Button>
								<Button
									type="button"
									disabled={loading || !reviewed}
									onClick={() => void saveMutation()}
								>
									Guardar
								</Button>
							</div>
						</div>
					)}
				</CalendarResponsiveDrawer>
			)}
		</div>
	)
}
