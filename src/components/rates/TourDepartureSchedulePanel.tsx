/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react"
import {
	tourScheduleSchema,
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
import { Button, DatesModal } from "@/components/ui-react"
import { cn } from "@/components/ui-react/utils"

const endpoint = "/api/inventory/program-tour-departures"
const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const weekdayShort = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const
const formatDate = (date: string) =>
	new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(
		new Date(`${date}T12:00:00Z`)
	)
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
					? "fastt-workspace-panel overflow-visible border border-slate-200 bg-white p-5 text-slate-950 md:p-6"
					: "rounded-xl border border-slate-200 bg-white p-5 text-slate-950"
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
					Programar salidas
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
							Programar salidas
						</h2>
					) : (
						<h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
							Programar salidas
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
											className="grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-4 xl:grid-cols-7"
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
														className="fastt-button tour-schedule-weekday min-h-12 w-full cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
														onClick={() => toggleWeekday(day)}
													>
														{weekdayShort[day]}
													</button>
												)
											})}
										</div>
										{fields.weekdays && (
											<p className="text-xs text-red-600" role="alert">
												{fields.weekdays}
											</p>
										)}
									</div>
									<div className="space-y-3 pt-2">
										<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
											<div className="min-w-0">
												<p className="fastt-prompt-field__label">Excluir fechas</p>
												<p className="mt-0.5 text-sm text-slate-500">
													Opcional. Días concretos del rango que no quieres programar.
												</p>
											</div>
											{input.excluded.length > 0 && (
												<p className="shrink-0 text-xs font-medium text-slate-500">
													{input.excluded.length} excluida
													{input.excluded.length === 1 ? "" : "s"}
												</p>
											)}
										</div>
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
										{preview && (
											<div role="status" className="rounded-lg bg-slate-50 p-4">
												<p className="font-semibold">
													Se añadirán {preview.newDates.length} salidas
												</p>
												<p>
													{preview.preservedDates.length} fechas configuradas se conservan sin
													cambios.
												</p>
												{preview.blockedDates.length > 0 && (
													<p>
														{preview.blockedDates.length} fechas excluidas por cancelación, bloqueo
														externo o retención.
													</p>
												)}
												<details>
													<summary className="cursor-pointer py-2">Ver fechas nuevas</summary>
													<p>
														{preview.newDates.map(formatDate).join(", ") ||
															"Todas las fechas seleccionadas ya existen o están excluidas."}
													</p>
												</details>
											</div>
										)}
										{!result && (
											<div className="grid items-end gap-4 sm:grid-cols-3">
												<DatesModal
													id="tour-schedule-exclude"
													label="Fecha a excluir"
													placeholder="Seleccionar fecha"
													className="min-w-0"
													value={excludedDate}
													min={String(input.from || context.today)}
													max={String(input.to || "") || undefined}
													disabled={busy || !!result}
													onChange={setExcludedDate}
												/>
												<div className="flex justify-start">
													<Button
														type="button"
														variant="secondary"
														size="lg"
														className="h-11 shrink-0 px-4"
														disabled={!excludedDate || busy || !!result}
														onClick={() => {
															if (!input.excluded.includes(excludedDate))
																change({ excluded: [...input.excluded, excludedDate] })
															setExcludedDate("")
														}}
													>
														Añadir
													</Button>
												</div>
												<div className="flex justify-end sm:col-start-3">
													<Button
														type="button"
														variant="selection"
														size="lg"
														className="fastt-playbook-cta w-full min-w-[10rem] shrink-0 sm:w-auto"
														disabled={busy || (!!preview && !preview.newDates.length)}
														onClick={() => void submit(!!preview)}
													>
														{busy
															? "Procesando…"
															: preview
																? `Programar ${preview.newDates.length} salidas`
																: "Revisar fechas"}
													</Button>
												</div>
											</div>
										)}
									</div>
									{result && (
										<div role="status">
											<p>
												{result.createdDates.length} salidas guardadas;{" "}
												{result.preservedDates.length} fechas conservadas.
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
