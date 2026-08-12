import { useEffect, useState } from "react"
type Channel = {
	id: string
	channel: string
	status: string
	lastSyncAt: string | null
	publications: Array<{
		id: string
		definitionId: string
		definitionVersionId: string | null
		status: string
		confirmedAt: string | null
	}>
}
export default function FiscalChannelSync() {
	const [channels, setChannels] = useState<Channel[]>([]),
		[message, setMessage] = useState("")
	const load = () =>
		fetch("/api/provider/tax-fees/channels")
			.then((r) => r.json())
			.then((body) => setChannels(body.channels ?? []))
	useEffect(() => {
		load()
	}, [])
	return (
		<section className="mt-6 border-t border-slate-200 pt-5">
			<div className="flex items-end justify-between">
				<div>
					<p className="text-xs font-semibold tracking-[.08em] text-slate-500 uppercase">Canales</p>
					<h3 className="mt-1 text-base font-semibold text-slate-950">Sincronización fiscal</h3>
				</div>
				<span className="text-sm text-slate-500">Confirmación requerida</span>
			</div>
			{message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
			<div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
				{channels.map((channel) => (
					<div key={channel.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
						<div>
							<p className="font-medium text-slate-950">{channel.channel}</p>
							<p className="text-xs text-slate-500">
								Última sincronización:{" "}
								{channel.lastSyncAt
									? new Date(channel.lastSyncAt).toLocaleString("es")
									: "Sin ejecuciones"}
							</p>
						</div>
						<div className="flex items-center gap-3">
							<span
								className={`rounded-full px-2 py-0.5 text-xs font-semibold ${channel.publications[0]?.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
							>
								{channel.publications[0]?.status === "confirmed"
									? `Confirmada · v${channel.publications[0]?.definitionVersionId ?? "—"}`
									: (channel.publications[0]?.status ?? "Sin publicar")}
							</span>
							{channel.publications[0]?.status === "sent" && (
								<button
									onClick={async () => {
										const p = channel.publications[0]
										const r = await fetch("/api/provider/tax-fees/channels", {
											method: "POST",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({
												action: "confirm",
												definitionId: p.definitionId,
												connectionId: channel.id,
												publicationId: p.id,
											}),
										})
										setMessage(r.ok ? "Confirmación registrada." : "No se pudo confirmar.")
										load()
									}}
									className="text-sm text-slate-700 underline underline-offset-4"
								>
									Confirmar
								</button>
							)}
						</div>
					</div>
				))}
				{!channels.length && (
					<p className="py-6 text-sm text-slate-600">No hay canales conectados para sincronizar.</p>
				)}
			</div>
		</section>
	)
}
