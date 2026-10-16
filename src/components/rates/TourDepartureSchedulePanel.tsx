/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react"
import {
	tourScheduleSchema,
	tourScheduleConfirmation,
	type TourScheduleContext,
	type TourScheduleInput,
	type TourSchedulePreview,
	type TourScheduleResult,
} from "@/lib/tours/tourScheduleContract"
import {
	readCalendarResponse,
	calendarRecoveryReturnTo,
	CalendarReadError,
} from "@/lib/rates/calendarClientRequest"
import { Button, DatesModal, Notice } from "@/components/ui-react"
import { cn } from "@/components/ui-react/utils"

const endpoint = "/api/inventory/program-tour-departures"
const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const weekdayShort = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const weekdayLetter: Record<number, string> = {
	0: "D",
	1: "L",
	2: "M",
	3: "X",
	4: "J",
	5: "V",
	6: "S",
}
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const
const formatDate = (date: string) =>
	new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(
		new Date(`${date}T12:00:00Z`)
	)
const formatPreviewChip = (date: string) => {
	const day = new Date(`${date}T12:00:00Z`).getUTCDay()
	return `${weekdayShort[day]} · ${formatDate(date)}`
}
export default function TourDepartureSchedulePanel({
	variantId,
	onSaved,
	onPendingChange,
	embedded = false,
}: {
	variantId: string
	onSaved: (result: TourScheduleResult) => Promise<void>
	onPendingChange: (pending: boolean) => void
	/** Playbook/form host already titles the step; keep the scheduler open as the main form. */
	embedded?: boolean
}) {
	const [open, setOpen] = useState(
		() => embedded || new URLSearchParams(window.location.search).get("schedule") === "1"
	)
	useEffect(() => {
		if (embedded) setOpen(true)
	}, [embedded])
	const [context, setContext] = useState<TourScheduleContext | null>(null)
	const [input, setInput] = useState<TourScheduleInput>({
		variantId,
		from: "",
		to: "",
		weekdays: [1, 2, 3, 4, 5],
		excluded: [],
		capacity: 1,
	})
	const [preview, setPreview] = useState<TourSchedulePreview | null>(null)
	const [result, setResult] = useState<TourScheduleResult | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	const [fields, setFields] = useState<Record<string, string>>({})
	const [retryLoad, setRetryLoad] = useState(0)
	const [auth, setAuth] = useState(false)
	const [excludedDate, setExcludedDate] = useState("")
	const [excludePanelOpen, setExcludePanelOpen] = useState(false)
	const identity = useRef("")
	const heading = useRef<HTMLHeadingElement>(null)
	const inFlight = useRef(false)
	const dirty = useRef(false)
	const [hasChanges, setHasChanges] = useState(false)
	useEffect(() => {
		onPendingChange(hasChanges || busy || result?.refresh === "pending")
	}, [hasChanges, busy, result, onPendingChange])
	useEffect(() => () => onPendingChange(false), [onPendingChange])
	useEffect(() => {
		if (input.excluded.length > 0 || fields.excluded) setExcludePanelOpen(true)
	}, [input.excluded.length, fields.excluded])
	useEffect(() => {
		if (!open) return
		heading.current?.focus()
		const controller = new AbortController()
		setBusy(true)
		setError("")
		setContext(null)
		void readCalendarResponse(
			`${endpoint}?variantId=${encodeURIComponent(variantId)}`,
			controller.signal
		)
			.then((body) => {
				const ctx = body.surface as TourScheduleContext
				setContext(ctx)
				const start = new Date(`${ctx.today}T00:00:00Z`)
				start.setUTCDate(start.getUTCDate() + 1)
				setInput({
					variantId,
					from: start.toISOString().slice(0, 10),
					to: start.toISOString().slice(0, 10),
					weekdays: [1, 2, 3, 4, 5],
					capacity: ctx.capacity,
					excluded: [],
				})
				setPreview(null)
				setResult(null)
				dirty.current = false
				setHasChanges(false)
			})
			.catch((e: Error) => {
				if (!controller.signal.aborted) {
					setError(e.message)
					if (e instanceof CalendarReadError && e.requiresSignIn) setAuth(true)
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) setBusy(false)
			})
		return () => controller.abort()
	}, [open, variantId, retryLoad])
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty.current || inFlight.current) {
				event.preventDefault()
				event.returnValue = ""
			}
		}
		const navigate = (event: MouseEvent) => {
			if (
				(dirty.current || inFlight.current) &&
				(event.target as Element).closest("a[href]") &&
				!window.confirm("Hay una programación sin confirmar. ¿Quieres salir?")
			) {
				event.preventDefault()
				event.stopPropagation()
			}
		}
		window.addEventListener("beforeunload", warn)
		document.addEventListener("click", navigate, true)
		return () => {
			window.removeEventListener("beforeunload", warn)
			document.removeEventListener("click", navigate, true)
		}
	}, [])
	function toggleWeekday(day: number) {
		change({
			weekdays: input.weekdays.includes(day)
				? input.weekdays.filter((value) => value !== day)
				: [...input.weekdays, day],
		})
	}
	function change(next: Partial<TourScheduleInput>) {
		setInput((value) => ({ ...value, ...next }))
		setPreview(null)
		setResult(null)
		setError("")
		setFields({})
		identity.current = ""
		dirty.current = true
		setHasChanges(true)
	}
	async function submit(apply: boolean) {
		if (inFlight.current) return
		const parsed = tourScheduleSchema.safeParse(input)
		if (!parsed.success) {
			setFields(
				Object.fromEntries(
					parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
				)
			)
			return
		}
		inFlight.current = true
		setBusy(true)
		setError("")
		try {
			if (apply && !identity.current) identity.current = crypto.randomUUID()
			const controller = new AbortController()
			const timeout = window.setTimeout(() => controller.abort(), 30000)
			let response: Response
			try {
				response = await fetch(endpoint, {
					method: "POST",
					signal: controller.signal,
					headers: {
						"Content-Type": "application/json",
						...(apply ? { "Idempotency-Key": identity.current } : {}),
					},
					body: JSON.stringify({ input: parsed.data, ...(apply ? { token: preview?.token } : {}) }),
				})
			} finally {
				window.clearTimeout(timeout)
			}
			const body = await response.json()
			if (!response.ok) {
				if (response.status === 401) setAuth(true)
				if (response.status === 409) {
					setPreview(null)
					identity.current = ""
				}
				throw new Error(body.error)
			}
			if (apply) {
				const saved = body as TourScheduleResult
				setResult(saved)
				dirty.current = false
				setHasChanges(false)
				if (saved.refresh === "ready") {
					setPreview(null)
					await onSaved(saved)
				}
			} else setPreview(body as TourSchedulePreview)
		} catch (e) {
			setError(
				e instanceof Error && e.name !== "AbortError"
					? e.message
					: "No recibimos la respuesta. Reintenta para recuperar el resultado de esta operación."
			)
		} finally {
			inFlight.current = false
			setBusy(false)
		}
	}
	return (
		<section
			className={
				embedded
					? "fastt-workspace-panel overflow-visible border border-slate-200 bg-white p-3 text-slate-950 sm:p-5 md:p-6"
					: "rounded-xl border border-slate-200 bg-white p-3 text-slate-950 sm:p-5"
			}
		>
			{embedded ? null : (
				<Button
					type="button"
					variant="ghost"
					className="min-h-11 px-0 font-semibold underline"
					aria-expanded={open}
					aria-controls="tour-schedule-panel"
					onClick={() => {
						if (
							!busy &&
							(!dirty.current || window.confirm("¿Descartar esta programación sin confirmar?"))
						) {
							dirty.current = false
							setHasChanges(false)
							setOpen(!open)
						}
					}}
				>
					Programar fechas
				</Button>
			)}
			{open && (
				<div
					id="tour-schedule-panel"
					className={embedded ? "space-y-5" : "mt-4 space-y-5"}
					aria-busy={busy}
				>
					{embedded ? (
						<h2 ref={heading} tabIndex={-1} className="sr-only">
							Programar fechas
						</h2>
					) : (
						<h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
							Programar fechas
						</h2>
					)}
					{!context && busy && (
						<div role="status" className="animate-pulse space-y-3 motion-reduce:animate-none">
							<p>Cargando opción…</p>
							<div className="h-11 rounded bg-slate-100" />
							<div className="h-11 rounded bg-slate-100" />
						</div>
					)}
					{context && (
						<>
							<p className={embedded ? "text-sm text-slate-600" : undefined}>
								{context.name} · {context.time} · {context.timezone}
							</p>
							{context.mode === "private" ? (
								<p>
									Esta opción recibe solicitudes privadas. No necesita programar cupos compartidos.
								</p>
							) : (
								<>
									<div className="grid gap-4 sm:grid-cols-3">
										<DatesModal
											id="tour-schedule-from"
											label="Desde"
											value={String(input.from)}
											min={context.today}
											disabled={busy || !!result}
											error={fields.from}
											onChange={(next) => change({ from: next })}
										/>
										<DatesModal
											id="tour-schedule-to"
											label="Hasta"
											value={String(input.to)}
											min={String(input.from || context.today)}
											disabled={busy || !!result}
											error={fields.to}
											onChange={(next) => change({ to: next })}
										/>
										<div className="min-w-0">
											<label
												className={cn(
													"fastt-prompt-field h-full w-full cursor-text",
													fields.capacity && "fastt-prompt-field--invalid"
												)}
											>
												<span className="fastt-prompt-field__copy">
													<span className="fastt-prompt-field__label">Cupo total por salida</span>
													<input
														className="fastt-field w-full"
														type="number"
														min={1}
														inputMode="numeric"
														value={input.capacity}
														disabled={busy || !!result}
														aria-invalid={!!fields.capacity}
														aria-describedby={
															fields.capacity ? "schedule-capacity-error" : undefined
														}
														onChange={(event) => change({ capacity: Number(event.target.value) })}
													/>
												</span>
											</label>
											{fields.capacity && (
												<p id="schedule-capacity-error" className="mt-1.5 text-xs text-red-600">
													{fields.capacity}
												</p>
											)}
										</div>
									</div>
									<div className="space-y-3 pt-1">
										<p id="tour-schedule-weekdays-label" className="fastt-prompt-field__label">
											Días de salida
										</p>
										<div
											role="group"
											aria-labelledby="tour-schedule-weekdays-label"
											className="grid grid-cols-7 gap-1 sm:gap-2"
										>
											{weekdayOrder.map((day) => {
												const active = input.weekdays.includes(day)
												const locked = busy || !!result
												return (
													<button
														key={day}
														type="button"
														disabled={locked}
														aria-pressed={active}
														aria-label={weekdays[day]}
														title={weekdays[day]}
														className="fastt-button tour-schedule-weekday min-h-10 w-full cursor-pointer rounded-lg px-0 py-2 text-center text-xs font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:min-h-12 sm:rounded-xl sm:px-2 sm:py-2.5 sm:text-sm"
														onClick={() => toggleWeekday(day)}
													>
														<span className="sm:hidden">{weekdayLetter[day]}</span>
														<span className="hidden sm:inline">{weekdayShort[day]}</span>
													</button>
												)
											})}
										</div>
										{fields.weekdays && (
											<p className="text-xs text-red-600" role="alert">
												{fields.weekdays}
											</p>
										)}
										<p className="text-sm text-slate-500">
											Sólo se aplicará a las fechas del periodo y los días seleccionados. Las fechas
											no seleccionadas conservarán su cupo actual.
										</p>
									</div>
									<div className="pt-2">
										<details
											className="fastt-card group rounded-xl border border-slate-200 bg-slate-50/70 p-0 open:bg-white"
											open={excludePanelOpen}
											onToggle={(event) => setExcludePanelOpen(event.currentTarget.open)}
										>
											<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
												<span className="min-w-0 text-sm font-semibold text-slate-900">
													¿Quieres excluir alguna fecha?
												</span>
												<span className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
													{input.excluded.length > 0
														? `${input.excluded.length} excluida${input.excluded.length === 1 ? "" : "s"}`
														: "Opcional"}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 20 20"
														fill="currentColor"
														aria-hidden="true"
														className={cn(
															"size-4 text-slate-400 transition-transform motion-reduce:transition-none",
															excludePanelOpen && "rotate-180"
														)}
													>
														<path
															fillRule="evenodd"
															d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
															clipRule="evenodd"
														/>
													</svg>
												</span>
											</summary>
											<div className="space-y-3 border-t border-slate-200 px-3 pt-3 pb-3">
												<p className="text-sm text-slate-500">
													Días concretos del rango que no quieres programar.
												</p>
												{input.excluded.length > 0 && (
													<ul className="flex flex-wrap gap-2">
														{input.excluded.map((date) => (
															<li key={date}>
																<span className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-slate-100 py-1 pr-1 pl-2.5 text-sm text-slate-800">
																	<span className="truncate">{formatDate(date)}</span>
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className="h-8 shrink-0 px-2 text-slate-600"
																		disabled={busy || !!result}
																		aria-label={`Incluir nuevamente ${formatDate(date)}`}
																		onClick={() =>
																			change({
																				excluded: input.excluded.filter((value) => value !== date),
																			})
																		}
																	>
																		Quitar
																	</Button>
																</span>
															</li>
														))}
													</ul>
												)}
												{fields.excluded && (
													<p className="text-xs text-red-600" role="alert">
														{fields.excluded}
													</p>
												)}
												{!result && (
													<div className="flex min-w-0 items-end gap-2">
														<DatesModal
															id="tour-schedule-exclude"
															label="Fecha a excluir"
															placeholder="Seleccionar fecha"
															compact
															className="min-w-0 flex-1"
															value={excludedDate}
															min={String(input.from || context.today)}
															max={String(input.to || "") || undefined}
															disabled={busy || !!result}
															onChange={setExcludedDate}
														/>
														<Button
															type="button"
															variant="secondary"
															size="lg"
															className="h-11 shrink-0 px-4"
															disabled={!excludedDate || busy || !!result}
															onClick={() => {
																if (!input.excluded.includes(excludedDate))
																	change({
																		excluded: [...input.excluded, excludedDate],
																	})
																setExcludedDate("")
															}}
														>
															Añadir
														</Button>
													</div>
												)}
											</div>
										</details>
										{preview && (
											<div role="status" className="mt-8 space-y-3 sm:mt-10" data-schedule-preview>
												<div className="space-y-1">
													<p className="text-base font-semibold text-slate-900">
														{preview.newDates.length}{" "}
														{preview.newDates.length === 1 ? "fecha nueva" : "fechas nuevas"} para
														programar
													</p>
													<p className="text-sm leading-6 text-slate-600">
														Se revisarán {preview.preservedDates.length} fechas existentes del
														periodo. Las abiertas pasarán a {input.capacity} cupos totales; las
														cerradas con 0 cupos no se reabren.
													</p>
													{preview.blockedDates.length > 0 && (
														<p className="text-sm leading-6 text-slate-600">
															{preview.blockedDates.length} fechas excluidas por cancelación,
															bloqueo externo o retención.
														</p>
													)}
												</div>
												{preview.newDates.length > 0 ? (
													<details className="group">
														<summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
															<span>Ver fechas nuevas</span>
															<span className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
																{preview.newDates.length}
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																	className="size-4 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none"
																>
																	<path
																		fillRule="evenodd"
																		d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
																		clipRule="evenodd"
																	/>
																</svg>
															</span>
														</summary>
														<ul className="flex flex-wrap gap-1.5 pt-2 pb-1">
															{preview.newDates.map((date) => (
																<li key={date}>
																	<span className="inline-flex max-w-full items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 sm:text-sm">
																		<span className="truncate">{formatPreviewChip(date)}</span>
																	</span>
																</li>
															))}
														</ul>
													</details>
												) : (
													<p className="text-sm text-slate-600">
														Todas las fechas seleccionadas ya existen o están excluidas.
													</p>
												)}
											</div>
										)}
										{!result && (
											<div className={cn("space-y-3", preview ? "mt-6 pt-2" : "mt-4 pt-2")}>
												{hasChanges && !preview ? (
													<Notice
														variant="warning"
														title="Programación sin guardar."
														className="px-3 py-2.5 text-sm leading-6"
														data-schedule-draft-status
													>
														{input.capacity} cupos totales por fecha seleccionada. Revisa las fechas
														y confirma para aplicar el cambio.
													</Notice>
												) : null}
												<div className="flex justify-stretch sm:justify-end">
													<Button
														type="button"
														variant="selection"
														size="lg"
														className="fastt-playbook-cta w-full min-w-[10rem] shrink-0 sm:w-auto"
														disabled={tourScheduleConfirmation(preview, busy).disabled}
														onClick={() => void submit(!!preview)}
													>
														{tourScheduleConfirmation(preview, busy).label}
													</Button>
												</div>
											</div>
										)}
									</div>
									{result && (
										<div role="status">
											<p>
												{result.createdDates.length} salidas guardadas;{" "}
												{result.preservedDates.length} fechas existentes revisadas. Los cupos
												reservados y los cierres se conservan.
											</p>
											{result.refresh === "pending" ? (
												<>
													<p>La programación está guardada. Falta actualizar la disponibilidad.</p>
													<Button
														type="button"
														variant="ghost"
														className="min-h-11 px-0 underline"
														disabled={busy}
														onClick={() => void submit(true)}
													>
														Reintentar actualización
													</Button>
												</>
											) : (
												<Button
													type="button"
													variant="ghost"
													className="min-h-11 px-0 underline"
													onClick={() => {
														setResult(null)
														setPreview(null)
														identity.current = ""
													}}
												>
													Programar otro periodo
												</Button>
											)}
										</div>
									)}
								</>
							)}
						</>
					)}
					{error && (
						<div role="alert" className="text-red-700">
							<p>{error}</p>
							{!context && (
								<Button
									type="button"
									variant="ghost"
									className="min-h-11 px-0 underline"
									onClick={() => setRetryLoad((v) => v + 1)}
								>
									Reintentar
								</Button>
							)}
							{auth && (
								<a
									href={`/SignInPage?returnTo=${encodeURIComponent(calendarRecoveryReturnTo(window.location.href, { variantId }))}`}
									className="underline"
								>
									Iniciar sesión
								</a>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	)
}
