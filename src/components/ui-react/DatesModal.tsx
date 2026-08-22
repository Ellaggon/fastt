import { useEffect, useId, useMemo, useRef, useState } from "react"

import Button from "./Button"
import { cn } from "./utils"

type Props = {
	id?: string
	label: string
	value: string
	onChange: (value: string) => void
	min?: string
	max?: string
	required?: boolean
	placeholder?: string
	error?: string
	compact?: boolean
	className?: string
}

function formatIsoDate(date: Date) {
	return date.toISOString().slice(0, 10)
}

function parseIsoDate(value?: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null
	const parsed = new Date(`${value}T00:00:00.000Z`)
	if (Number.isNaN(parsed.getTime()) || formatIsoDate(parsed) !== value) return null
	return parsed
}

function monthLabel(date: Date) {
	return date.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
}

function mondayStartOffset(date: Date) {
	const sundayBased = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay()
	return (sundayBased + 6) % 7
}

function formatDisplayDate(value: string, placeholder: string) {
	const parsed = parseIsoDate(value)
	if (!parsed) return placeholder
	return parsed.toLocaleDateString("es-CL", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	})
}

export default function DatesModal({
	id,
	label,
	value,
	onChange,
	min,
	max,
	required = false,
	placeholder = "Seleccionar fecha",
	error,
	compact = false,
	className,
}: Props) {
	const [open, setOpen] = useState(false)
	const generatedId = useId()
	const triggerId = id ?? generatedId
	const panelId = `${triggerId}-panel`
	const rootRef = useRef<HTMLDivElement>(null)
	const selected = parseIsoDate(value)
	const minDate = parseIsoDate(min)
	const maxDate = parseIsoDate(max)
	const today = useMemo(() => new Date(), [])
	const [currentMonth, setCurrentMonth] = useState(() => {
		const initial = selected ?? today
		return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1))
	})

	useEffect(() => {
		const parsed = parseIsoDate(value)
		if (!parsed) return
		setCurrentMonth(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)))
	}, [value])

	useEffect(() => {
		if (!open) return
		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false)
		}
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	const days = useMemo(() => {
		const year = currentMonth.getUTCFullYear()
		const month = currentMonth.getUTCMonth()
		const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
		const offset = mondayStartOffset(currentMonth)
		const cells: Array<{ iso: string; day: number; disabled: boolean } | null> = []
		for (let i = 0; i < offset; i++) cells.push(null)
		for (let day = 1; day <= totalDays; day++) {
			const date = new Date(Date.UTC(year, month, day))
			const iso = formatIsoDate(date)
			cells.push({
				iso,
				day,
				disabled: Boolean((minDate && date < minDate) || (maxDate && date > maxDate)),
			})
		}
		return cells
	}, [currentMonth, minDate, maxDate])

	return (
		<div ref={rootRef} className={cn("relative h-full min-w-0", className)}>
			<button
				type="button"
				id={triggerId}
				className={cn(
					"fastt-prompt-field h-full w-full text-left",
					compact && "fastt-prompt-field--compact",
					error && "fastt-prompt-field--invalid"
				)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				aria-invalid={Boolean(error)}
				onClick={() => setOpen((current) => !current)}
			>
				<span className="fastt-prompt-field__copy">
					<span className="fastt-prompt-field__label">
						{label}
						{required ? (
							<span className="fastt-prompt-field__required" aria-hidden="true">
								*
							</span>
						) : null}
					</span>
					<span className="fastt-prompt-field__value">{formatDisplayDate(value, placeholder)}</span>
				</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					className="h-4 w-4 shrink-0 text-slate-500"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fillRule="evenodd"
						d="M6 2a1 1 0 112 0v1h4V2a1 1 0 112 0v1h1a2 2 0 012 2v2H3V5a2 2 0 012-2h1V2zm11 7H3v6a2 2 0 002 2h10a2 2 0 002-2V9z"
						clipRule="evenodd"
					/>
				</svg>
			</button>
			{open ? (
				<div
					id={panelId}
					role="dialog"
					aria-label={label}
					className="absolute left-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
				>
					<div className="mb-2 flex items-center justify-between gap-2">
						<button
							type="button"
							className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
							aria-label="Mes anterior"
							onClick={() =>
								setCurrentMonth(
									new Date(
										Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 1, 1)
									)
								)
							}
						>
							‹
						</button>
						<p className="text-sm font-semibold text-slate-900">{monthLabel(currentMonth)}</p>
						<button
							type="button"
							className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
							aria-label="Mes siguiente"
							onClick={() =>
								setCurrentMonth(
									new Date(
										Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1)
									)
								)
							}
						>
							›
						</button>
					</div>
					<div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
						<span>L</span>
						<span>M</span>
						<span>X</span>
						<span>J</span>
						<span>V</span>
						<span>S</span>
						<span>D</span>
					</div>
					<div className="grid grid-cols-7 gap-1">
						{days.map((cell, index) =>
							cell ? (
								<button
									key={cell.iso}
									type="button"
									disabled={cell.disabled}
									className={cn(
										"h-8 rounded text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30",
										value === cell.iso && "bg-slate-950 text-white hover:bg-slate-950"
									)}
									onClick={() => onChange(cell.iso)}
								>
									{cell.day}
								</button>
							) : (
								<span key={`pad-${index}`} className="h-8" />
							)
						)}
					</div>
					<div className="mt-3 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								onChange("")
							}}
						>
							Limpiar
						</Button>
						<Button type="button" size="sm" onClick={() => setOpen(false)}>
							Listo
						</Button>
					</div>
				</div>
			) : null}
			{error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
		</div>
	)
}
