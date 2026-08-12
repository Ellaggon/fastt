import { useEffect, useState } from "react"
type Row = {
	bookingId: string
	currency: string
	baseAmount: number
	taxAmount: number
	feeAmount: number
	refundedAmount: number
	guestTotal: number
	providerCollectedAmount: number
	platformCollectedAmount: number
	marketplaceCollectedAmount: number
	reconciliationStatus: string
	mismatchReasons: string[]
}
const money = (value: number, currency: string) =>
	new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(value)
export default function FiscalOperations({
	view,
}: {
	view: "reports" | "reconciliation" | "exports"
}) {
	const [rows, setRows] = useState<Row[]>([]),
		[cases, setCases] = useState<any[]>([]),
		[message, setMessage] = useState("")
	useEffect(() => {
		const endpoint =
			view === "reconciliation"
				? "/api/provider/tax-fees/reconciliation"
				: "/api/provider/tax-fees/reports"
		fetch(endpoint)
			.then((r) => r.json())
			.then((body) => {
				setRows(view === "reconciliation" ? (body.cases ?? []) : (body.report?.rows ?? []))
				setCases(body.cases ?? [])
			})
			.catch(() => setMessage("No se pudo cargar la información."))
	}, [view])
	if (view === "exports")
		return (
			<section className="space-y-4">
				<h2 className="text-lg font-semibold text-slate-950">Exportaciones</h2>
				<p className="text-sm text-slate-600">
					Los archivos incluyen filtros, zona horaria UTC y esquema `fiscal_report_v1`.
				</p>
				<div className="flex gap-3">
					<a
						className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
						href="/api/provider/tax-fees/reports?format=csv"
					>
						CSV
					</a>
					<a
						className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
						href="/api/provider/tax-fees/reports?format=json"
					>
						JSON
					</a>
					<button
						onClick={async () => {
							const r = await fetch("/api/provider/tax-fees/reports?async=1&format=csv")
							setMessage(
								r.ok
									? "Exportación en preparación; quedó registrada en Actividad."
									: "No se pudo solicitar la exportación."
							)
						}}
						className="text-sm text-slate-700 underline underline-offset-4"
					>
						Solicitar exportación asíncrona
					</button>
				</div>
				{message && <p className="text-sm text-slate-600">{message}</p>}
			</section>
		)
	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
				<div>
					<p className="text-xs font-semibold tracking-[.08em] text-slate-500 uppercase">
						{view === "reports" ? "Libro fiscal" : "Control"}
					</p>
					<h2 className="mt-1 text-lg font-semibold text-slate-950">
						{view === "reports" ? "Reporte fiscal" : "Conciliación"}
					</h2>
				</div>
				<p className="text-sm text-slate-500">Los totales se muestran por moneda.</p>
			</div>
			{message && <p className="text-sm text-rose-700">{message}</p>}
			<div className="overflow-x-auto border-y border-slate-200">
				<table className="w-full min-w-[980px] text-left text-sm">
					<thead className="border-b border-slate-200 text-xs tracking-[.08em] text-slate-500 uppercase">
						<tr>
							<th className="py-3">Reserva</th>
							<th>Base</th>
							<th>Impuesto</th>
							<th>Cargo</th>
							<th>Reembolsado</th>
							<th>Neto</th>
							<th>Proveedor</th>
							<th>Plataforma</th>
							<th>Marketplace</th>
							<th>Estado</th>
							{view === "reconciliation" && <th></th>}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{rows.map((row) => (
							<tr key={row.bookingId}>
								<td className="py-3 font-medium text-slate-950">{row.bookingId}</td>
								<td>{money(row.baseAmount, row.currency)}</td>
								<td>{money(row.taxAmount, row.currency)}</td>
								<td>{money(row.feeAmount, row.currency)}</td>
								<td>{money(row.refundedAmount, row.currency)}</td>
								<td>{money(row.guestTotal - row.refundedAmount, row.currency)}</td>
								<td>{money(row.providerCollectedAmount, row.currency)}</td>
								<td>{money(row.platformCollectedAmount, row.currency)}</td>
								<td>{money(row.marketplaceCollectedAmount, row.currency)}</td>
								<td>
									<span className="py-.5 rounded-full bg-slate-100 px-2 text-xs">
										{row.reconciliationStatus}
									</span>
									{row.mismatchReasons?.length ? (
										<span className="ml-2 text-xs text-rose-700">
											{row.mismatchReasons.join(", ")}
										</span>
									) : null}
								</td>
								{view === "reconciliation" && (
									<td>
										<button
											onClick={async () => {
												await fetch("/api/provider/tax-fees/reconciliation", {
													method: "POST",
													headers: { "Content-Type": "application/json" },
													body: JSON.stringify({
														bookingId: row.bookingId,
														status: "resolved",
														comment: "Revisado desde conciliación fiscal",
													}),
												})
												setRows((current) =>
													current.filter((item) => item.bookingId !== row.bookingId)
												)
											}}
											className="text-slate-700 underline underline-offset-4"
										>
											Resolver
										</button>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	)
}
