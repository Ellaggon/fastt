import { useEffect, useMemo, useState } from "react"

type Event = {
	id: string
	type: string
	definitionId: string | null
	definitionName?: string | null
	actorName?: string | null
	actorRole?: string | null
	channel?: string | null
	result: string
	risk: string
	before: any
	after: any
	context: any
	createdAt: string
	versionId?: string | null
}

const label: Record<string, string> = {
	tax_fee_definition_created: "Borrador creado",
	tax_fee_definition_updated: "Regla actualizada",
	tax_fee_definition_archived: "Regla archivada",
	tax_fee_assignment_created: "Asignación creada",
	tax_fee_assignment_paused: "Asignación pausada",
	tax_fee_assignment_bulk_assign: "Asignación masiva",
	tax_fee_assignment_bulk_pause: "Asignación pausada",
	tax_fee_assignment_bulk_inherit: "Herencia restaurada",
	simulation_executed: "Simulación ejecutada",
	export_requested: "Exportación solicitada",
}
export default function FiscalActivity() {
	const [events, setEvents] = useState<Event[]>([]),
		[type, setType] = useState(""),
		[risk, setRisk] = useState(""),
		[result, setResult] = useState(""),
		[open, setOpen] = useState<string | null>(null)
	useEffect(() => {
		fetch(
			`/api/provider/tax-fees/activity?${new URLSearchParams(Object.fromEntries(Object.entries({ type, risk, result }).filter(([, value]) => value)))}`
		)
			.then((response) => response.json())
			.then((body) => setEvents(body.events ?? []))
			.catch(() => setEvents([]))
	}, [type, risk, result])
	const types = useMemo(() => [...new Set(events.map((event) => event.type))], [events])
	return (
		<section aria-labelledby="activity-heading" className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
				<div>
					<p className="text-xs font-semibold tracking-[.08em] text-slate-500 uppercase">
						Registro inmutable
					</p>
					<h2 id="activity-heading" className="mt-1 text-lg font-semibold text-slate-950">
						Actividad fiscal
					</h2>
				</div>
				<a
					href="/api/provider/tax-fees/reports?format=csv"
					className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
				>
					Exportar
				</a>
			</div>
			<div className="grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-3">
				<Filter label="Evento" value={type} onChange={setType}>
					<option value="">Todos</option>
					{types.map((item) => (
						<option key={item} value={item}>
							{label[item] ?? item}
						</option>
					))}
				</Filter>
				<Filter label="Resultado" value={result} onChange={setResult}>
					<option value="">Todos</option>
					<option value="succeeded">Correcto</option>
					<option value="failed">Fallido</option>
					<option value="pending">Pendiente</option>
				</Filter>
				<Filter label="Riesgo" value={risk} onChange={setRisk}>
					<option value="">Todos</option>
					<option value="high">Alto</option>
					<option value="medium">Medio</option>
					<option value="low">Bajo</option>
				</Filter>
			</div>
			<div className="divide-y divide-slate-200 border-y border-slate-200">
				{events.map((event) => (
					<article key={event.id} className="py-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="font-medium text-slate-950">{label[event.type] ?? event.type}</p>
								<p className="mt-1 text-sm text-slate-600">
									{event.definitionName ?? event.definitionId ?? "Fiscalidad"} ·{" "}
									{event.actorName ?? "Sistema"} ·{" "}
									{new Intl.DateTimeFormat("es", {
										dateStyle: "medium",
										timeStyle: "short",
									}).format(new Date(event.createdAt))}
								</p>
							</div>
							<div className="flex gap-2">
								<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
									{event.result}
								</span>
								<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
									{event.risk}
								</span>
							</div>
						</div>
						<div className="mt-2 flex flex-wrap gap-3 text-sm">
							<button
								type="button"
								onClick={() => setOpen(open === event.id ? null : event.id)}
								className="text-slate-700 underline underline-offset-4"
							>
								{open === event.id ? "Ocultar diferencias" : "Ver diferencias"}
							</button>
							{event.definitionId && (
								<a
									className="text-slate-700 underline underline-offset-4"
									href={`/provider/settings/tax-fees?edit=${event.definitionId}`}
								>
									Abrir definición
								</a>
							)}
							{event.channel && <span className="text-slate-500">Canal: {event.channel}</span>}
						</div>
						{open === event.id && (
							<pre className="mt-3 overflow-x-auto border-l-2 border-slate-300 pl-3 text-xs leading-5 text-slate-700">
								{JSON.stringify(
									{
										antes: event.before,
										después: event.after,
										contexto: event.context,
										versión: event.versionId,
									},
									null,
									2
								)}
							</pre>
						)}
					</article>
				))}
				{!events.length && (
					<div className="py-10 text-center text-sm text-slate-600">
						No hay eventos fiscales que coincidan con los filtros.
					</div>
				)}
			</div>
		</section>
	)
}
function Filter({
	label,
	value,
	onChange,
	children,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	children: React.ReactNode
}) {
	return (
		<label className="grid gap-1 text-xs font-medium text-slate-600">
			{label}
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-800"
			>
				{children}
			</select>
		</label>
	)
}
