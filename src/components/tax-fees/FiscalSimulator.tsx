import { useMemo, useState } from "react"

import { Button, Input, Notice, Select } from "../ui-react"
import type { DefinitionSummary, TaxFeeScopeResources } from "./TaxFeeWizard"

type Quote = {
	quoteId: string
	issuedAt: string
	currency: string
	baseAmount: number
	totalAmount: number
	context: { channel: string }
	taxesAndFees: {
		taxes: { included: Line[]; excluded: Line[] }
		fees: { included: Line[]; excluded: Line[] }
	}
}
type Line = {
	definitionId: string
	name: string
	amount: number
	inclusionType: string
	kind: string
	collectionResponsibility: string
	source: { scope: string; scopeId: string | null }
}
type Preview = {
	quote: Quote
	settlement: { paidNow: number; pendingAtProperty: number }
	technical: Array<{
		definitionId: string
		definitionVersionId: string | null
		name: string
		source: { scope: string; scopeId: string | null }
		taxableBase: string
		multiplier: number
		amount: number
		rounding: string
		channel: string
	}>
}
type Props = {
	definitions: DefinitionSummary[]
	resources: TaxFeeScopeResources
	canManage?: boolean
}

const currencies = ["USD", "CLP", "EUR", "BOB"]
const scopeLabel: Record<string, string> = {
	provider: "Proveedor",
	product: "Producto",
	variant: "Unidad",
	rate_plan: "Tarifa",
}

export default function FiscalSimulator({ definitions, resources, canManage = false }: Props) {
	const [productId, setProductId] = useState(resources.products[0]?.id ?? "")
	const [variantId, setVariantId] = useState("")
	const [ratePlanId, setRatePlanId] = useState("")
	const [definitionId, setDefinitionId] = useState("")
	const [base, setBase] = useState("100")
	const [checkIn, setCheckIn] = useState("")
	const [checkOut, setCheckOut] = useState("")
	const [adults, setAdults] = useState("2")
	const [children, setChildren] = useState("0")
	const [childrenAges, setChildrenAges] = useState("")
	const [rooms, setRooms] = useState("1")
	const [country, setCountry] = useState("")
	const [residence, setResidence] = useState("")
	const [currency, setCurrency] = useState("USD")
	const [channel, setChannel] = useState("web")
	const [preview, setPreview] = useState<Preview | null>(null)
	const [published, setPublished] = useState<Preview | null>(null)
	const [compare, setCompare] = useState(false)
	const [technicalOpen, setTechnicalOpen] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const variants = useMemo(
		() => resources.variants.filter((variant) => variant.productId === productId),
		[resources, productId]
	)
	const plans = useMemo(
		() =>
			resources.ratePlans.filter(
				(plan) => plan.productId === productId && (!variantId || plan.variantId === variantId)
			),
		[resources, productId, variantId]
	)
	const selectedDefinition = definitions.find((definition) => definition.id === definitionId)
	const money = (value: number, selectedCurrency = currency) =>
		new Intl.NumberFormat("es-CL", { style: "currency", currency: selectedCurrency }).format(value)

	async function request(selectedRule = definitionId) {
		const form = new FormData()
		Object.entries({
			productId,
			variantId,
			ratePlanId,
			taxFeeDefinitionId: selectedRule,
			base,
			checkIn,
			checkOut,
			adults,
			children,
			childrenAges,
			rooms,
			country,
			guestResidenceCountry: residence,
			currency,
			channel,
		}).forEach(([key, value]) => {
			if (value) form.set(key, value)
		})
		const response = await fetch("/api/provider/tax-fees/preview", { method: "POST", body: form })
		const body = await response.json().catch(() => null)
		if (!response.ok) throw new Error(body?.message ?? "No se pudo crear la cotización.")
		return body as Preview
	}
	async function simulate() {
		setError(null)
		setPreview(null)
		setPublished(null)
		if (!productId || !checkIn || !checkOut || !ratePlanId) {
			setError("Selecciona producto, unidad, tarifa y un rango de fechas válido.")
			return
		}
		setLoading(true)
		try {
			const result = await request()
			setPreview(result)
			if (compare && definitionId) setPublished(await request(""))
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "No se pudo crear la cotización.")
		} finally {
			setLoading(false)
		}
	}
	function exportSimulation() {
		if (!preview) return
		const blob = new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement("a")
		anchor.href = url
		anchor.download = `${preview.quote.quoteId}.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}
	async function share() {
		if (!preview) return
		await navigator.clipboard?.writeText(
			`${window.location.origin}${window.location.pathname}?quote=${encodeURIComponent(preview.quote.quoteId)}`
		)
		setError("Enlace interno copiado.")
	}
	const lines = preview
		? [
				...preview.quote.taxesAndFees.taxes.included,
				...preview.quote.taxesAndFees.fees.included,
				...preview.quote.taxesAndFees.taxes.excluded,
				...preview.quote.taxesAndFees.fees.excluded,
			]
		: []

	return (
		<section aria-labelledby="simulator-heading" className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Certificación
					</p>
					<h2 id="simulator-heading" className="mt-1 text-lg font-semibold text-slate-950">
						Simulador de cotización fiscal
					</h2>
				</div>
				<p className="text-sm text-slate-500">No modifica reglas ni reservas.</p>
			</div>
			<div className="grid gap-x-4 gap-y-4 border-b border-slate-200 pb-5 md:grid-cols-2 xl:grid-cols-4">
				<Field label="Producto">
					<Select
						value={productId}
						onChange={(event) => {
							setProductId(event.target.value)
							setVariantId("")
							setRatePlanId("")
						}}
					>
						<option value="">Selecciona</option>
						{resources.products.map((product) => (
							<option key={product.id} value={product.id}>
								{product.label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Unidad o salida">
					<Select
						value={variantId}
						onChange={(event) => {
							setVariantId(event.target.value)
							setRatePlanId("")
						}}
					>
						<option value="">Selecciona</option>
						{variants.map((variant) => (
							<option key={variant.id} value={variant.id}>
								{variant.label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Tarifa">
					<Select value={ratePlanId} onChange={(event) => setRatePlanId(event.target.value)}>
						<option value="">Selecciona</option>
						{plans.map((plan) => (
							<option key={plan.id} value={plan.id}>
								{plan.label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Canal">
					<Select value={channel} onChange={(event) => setChannel(event.target.value)}>
						<option value="web">Web directa</option>
						<option value="channel_manager">Canal conectado</option>
					</Select>
				</Field>
				<Field label="Entrada">
					<Input
						type="date"
						value={checkIn}
						onChange={(event) => setCheckIn(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Salida">
					<Input
						type="date"
						value={checkOut}
						onChange={(event) => setCheckOut(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Habitaciones o cantidad">
					<Input
						min="1"
						type="number"
						value={rooms}
						onChange={(event) => setRooms(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Precio base">
					<Input
						inputMode="decimal"
						value={base}
						onChange={(event) => setBase(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Adultos">
					<Input
						min="1"
						type="number"
						value={adults}
						onChange={(event) => setAdults(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Niños">
					<Input
						min="0"
						type="number"
						value={children}
						onChange={(event) => setChildren(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Edades de niños">
					<Input
						placeholder="6, 11"
						value={childrenAges}
						onChange={(event) => setChildrenAges(event.target.value)}
						className="h-10"
					/>
				</Field>
				<Field label="Residencia del huésped">
					<Input
						maxLength={2}
						placeholder="CL"
						value={residence}
						onChange={(event) => setResidence(event.target.value.toUpperCase())}
						className="h-10"
					/>
				</Field>
				<Field label="Jurisdicción">
					<Input
						maxLength={2}
						placeholder="CL"
						value={country}
						onChange={(event) => setCountry(event.target.value.toUpperCase())}
						className="h-10"
					/>
				</Field>
				<Field label="Moneda">
					<Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
						{currencies.map((item) => (
							<option key={item}>{item}</option>
						))}
					</Select>
				</Field>
				<Field label="Regla publicada o borrador">
					<Select value={definitionId} onChange={(event) => setDefinitionId(event.target.value)}>
						<option value="">Solo reglas publicadas aplicables</option>
						{definitions.map((definition) => (
							<option key={definition.id} value={definition.id}>
								{definition.name}
								{definition.operationalStatus === "draft" ? " · Borrador" : ""}
							</option>
						))}
					</Select>
				</Field>
				<label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
					<input
						type="checkbox"
						checked={compare}
						onChange={(event) => setCompare(event.target.checked)}
						disabled={!definitionId}
					/>
					Comparar contra publicada
				</label>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
				<p className="text-sm text-slate-600">
					{selectedDefinition?.operationalStatus === "draft"
						? "El borrador se evalúa solo dentro de esta cotización."
						: "La cotización usa las reglas operativas y el mismo contrato de PriceQuote."}
				</p>
				<Button type="button" onClick={simulate} disabled={loading}>
					{loading ? "Calculando" : "Simular"}
				</Button>
			</div>
			{error && <Notice variant={error.includes("copiado") ? "info" : "error"}>{error}</Notice>}
			{preview && (
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
					<div className="border-y border-slate-200">
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 py-4">
							<div>
								<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
									Recibo de simulación
								</p>
								<p className="mt-1 text-2xl font-semibold text-slate-950">
									{money(preview.quote.totalAmount, preview.quote.currency)}
								</p>
							</div>
							<div className="text-right text-xs text-slate-500">
								{preview.quote.quoteId}
								<br />
								{new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(
									new Date(preview.quote.issuedAt)
								)}
							</div>
						</div>
						<ReceiptRow
							label="Precio base"
							value={preview.quote.baseAmount}
							currency={preview.quote.currency}
						/>
						<ReceiptRow
							label="Impuestos incluidos"
							value={sum(preview.quote.taxesAndFees.taxes.included)}
							currency={preview.quote.currency}
						/>
						<ReceiptRow
							label="Cargos incluidos"
							value={sum(preview.quote.taxesAndFees.fees.included)}
							currency={preview.quote.currency}
						/>
						{lines
							.filter((line) => line.inclusionType === "excluded")
							.map((line) => (
								<ReceiptRow
									key={`${line.definitionId}-${line.kind}`}
									label={`${line.name} · ${line.collectionResponsibility === "provider" ? "proveedor" : line.collectionResponsibility}`}
									value={line.amount}
									currency={preview.quote.currency}
								/>
							))}
						<div className="border-t border-slate-300">
							<ReceiptRow
								label="Total"
								value={preview.quote.totalAmount}
								currency={preview.quote.currency}
								strong
							/>
						</div>
					</div>
					<div className="border-y border-slate-200 py-4 text-sm">
						<p className="font-semibold text-slate-950">Cobro y responsable</p>
						<div className="mt-3 space-y-3">
							<Metric
								label="Pagado ahora"
								value={money(preview.settlement.paidNow, preview.quote.currency)}
							/>
							<Metric
								label="Pendiente en propiedad"
								value={money(preview.settlement.pendingAtProperty, preview.quote.currency)}
							/>
							<Metric label="Canal" value={preview.quote.context.channel} />
						</div>
						<div className="mt-5 flex flex-wrap gap-3">
							<Button type="button" variant="ghost" onClick={share}>
								Compartir
							</Button>
							<Button type="button" variant="ghost" onClick={exportSimulation}>
								Exportar
							</Button>
							{selectedDefinition && (
								<Button
									href={`/provider/settings/tax-fees?edit=${selectedDefinition.id}`}
									variant="ghost"
								>
									Abrir definición
								</Button>
							)}
							{canManage && selectedDefinition?.operationalStatus === "draft" && (
								<Button
									href={`/provider/settings/tax-fees?edit=${selectedDefinition.id}&publishAfterSimulation=1`}
									variant="ghost"
								>
									Publicar
								</Button>
							)}
						</div>
					</div>
					{published && (
						<div className="border-y border-slate-200 py-4 xl:col-span-2">
							<p className="font-semibold text-slate-950">Comparación con la versión publicada</p>
							<div className="mt-3 grid gap-3 sm:grid-cols-3">
								<Metric
									label="Publicada"
									value={money(published.quote.totalAmount, published.quote.currency)}
								/>
								<Metric
									label="Seleccionada"
									value={money(preview.quote.totalAmount, preview.quote.currency)}
								/>
								<Metric
									label="Diferencia"
									value={money(
										preview.quote.totalAmount - published.quote.totalAmount,
										preview.quote.currency
									)}
								/>
							</div>
						</div>
					)}
					<div className="border-y border-slate-200 py-4 xl:col-span-2">
						<Button
							type="button"
							variant="ghost"
							className="w-full justify-between"
							onClick={() => setTechnicalOpen(!technicalOpen)}
							aria-expanded={technicalOpen}
						>
							Vista técnica <span>{technicalOpen ? "Ocultar" : "Mostrar"}</span>
						</Button>
						{technicalOpen && (
							<div className="mt-4 overflow-x-auto">
								<table className="w-full min-w-[920px] text-left text-sm">
									<thead className="border-b border-slate-200 text-xs tracking-[0.08em] text-slate-500 uppercase">
										<tr>
											<th className="py-2">Regla y versión</th>
											<th className="py-2">Asignación</th>
											<th className="py-2">Base</th>
											<th className="py-2">Multiplicador</th>
											<th className="py-2">Redondeo</th>
											<th className="py-2">Canal</th>
											<th className="py-2 text-right">Importe</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{preview.technical.map((line) => (
											<tr key={line.definitionId}>
												<td className="py-3">
													<a
														href={`/provider/settings/tax-fees?edit=${line.definitionId}`}
														className="font-medium text-slate-900 underline underline-offset-4"
													>
														{line.name}
													</a>
													<span className="block text-xs text-slate-500">
														{line.definitionVersionId ?? "Borrador sin publicar"}
													</span>
												</td>
												<td className="py-3">
													<a
														href={`/provider/settings/tax-fees/assignments?scope=${encodeURIComponent(line.source.scopeId ?? "")}`}
														className="text-slate-700 underline underline-offset-4"
													>
														{scopeLabel[line.source.scope] ?? line.source.scope}
													</a>
												</td>
												<td className="py-3">{line.taxableBase}</td>
												<td className="py-3">{line.multiplier}</td>
												<td className="py-3">{line.rounding}</td>
												<td className="py-3">{line.channel}</td>
												<td className="py-3 text-right font-medium">
													{money(line.amount, preview.quote.currency)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="grid gap-1.5 text-sm font-medium text-slate-700">
			{label}
			{children}
		</label>
	)
}
function ReceiptRow({
	label,
	value,
	currency,
	strong = false,
}: {
	label: string
	value: number
	currency: string
	strong?: boolean
}) {
	return (
		<div
			className={`flex items-center justify-between py-3 text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}
		>
			<span>{label}</span>
			<span>{new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(value)}</span>
		</div>
	)
}
function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-slate-500">{label}</span>
			<span className="font-medium text-slate-900">{value}</span>
		</div>
	)
}
function sum(lines: Line[]) {
	return lines.reduce((total, line) => total + line.amount, 0)
}
