import {
	cloneElement,
	isValidElement,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react"

import { Button, Input, Notice, Select } from "../ui-react"
import type { DefinitionSummary, TaxFeeScopeResources } from "./TaxFeeWizard"
import type {
	FiscalSimulationContext,
	FiscalSimulationIssue,
} from "@/lib/taxes-fees/fiscal-workspace-resources"

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
	initialDefinitionId?: string | null
	initialProductId?: string | null
	recommendedContext?: FiscalSimulationContext | null
	simulationIssues?: FiscalSimulationIssue[]
	returnTo?: string | null
}
type FieldErrors = Partial<Record<"product" | "rate" | "checkIn" | "checkOut" | "base", string>>

const currencies = ["USD", "CLP", "EUR", "BOB"]
const countries = [
	{ code: "AR", label: "Argentina" },
	{ code: "BO", label: "Bolivia" },
	{ code: "BR", label: "Brasil" },
	{ code: "CL", label: "Chile" },
	{ code: "CO", label: "Colombia" },
	{ code: "PE", label: "Perú" },
	{ code: "UY", label: "Uruguay" },
]
const scopeLabel: Record<string, string> = {
	provider: "Proveedor",
	product: "Producto",
	variant: "Unidad",
	rate_plan: "Tarifa",
}

function jurisdictionCountry(definition: DefinitionSummary | undefined) {
	if (!definition?.jurisdictionJson || typeof definition.jurisdictionJson !== "object") return ""
	const country = (definition.jurisdictionJson as { country?: unknown }).country
	return typeof country === "string" ? country.toUpperCase() : ""
}

function countryLabel(country: string) {
	const found = countries.find((item) => item.code === country)
	return found ? `${found.label} (${found.code})` : country || "Sin definir"
}

function appliesPerLabel(value: DefinitionSummary["appliesPer"]) {
	return value === "stay"
		? "por estadía"
		: value === "night"
			? "por noche"
			: value === "guest"
				? "por huésped"
				: "por huésped por noche"
}

function responsibilityLabel(definition: DefinitionSummary) {
	const jurisdiction = definition.jurisdictionJson as { collectionResponsibility?: string } | null
	return (
		{ provider: "Proveedor", platform: "Plataforma", marketplace: "Marketplace" }[
			jurisdiction?.collectionResponsibility ?? "provider"
		] ?? "Proveedor"
	)
}

export default function FiscalSimulator({
	definitions,
	resources,
	canManage = false,
	initialDefinitionId = null,
	initialProductId = null,
	recommendedContext = null,
	simulationIssues = [],
	returnTo = null,
}: Props) {
	const [productId, setProductId] = useState(
		recommendedContext?.productId ??
			(initialProductId && resources.products.some((product) => product.id === initialProductId)
				? initialProductId
				: "")
	)
	const [variantId, setVariantId] = useState(recommendedContext?.variantId ?? "")
	const [ratePlanId, setRatePlanId] = useState(recommendedContext?.ratePlanId ?? "")
	const [definitionId, setDefinitionId] = useState(initialDefinitionId ?? "")
	const [base, setBase] = useState(recommendedContext ? String(recommendedContext.baseAmount) : "")
	const [checkIn, setCheckIn] = useState(recommendedContext?.checkIn ?? "")
	const [checkOut, setCheckOut] = useState(recommendedContext?.checkOut ?? "")
	const [adults, setAdults] = useState(String(recommendedContext?.adults ?? 2))
	const [children, setChildren] = useState(String(recommendedContext?.children ?? 0))
	const [childrenAges, setChildrenAges] = useState("")
	const [rooms, setRooms] = useState(String(recommendedContext?.rooms ?? 1))
	const [country, setCountry] = useState(() =>
		jurisdictionCountry(definitions.find((definition) => definition.id === initialDefinitionId))
	)
	const [residence, setResidence] = useState("")
	const [currency, setCurrency] = useState(recommendedContext?.currency ?? "USD")
	const [channel, setChannel] = useState<string>(recommendedContext?.channel ?? "web")
	const [editingContext, setEditingContext] = useState(
		Boolean(initialDefinitionId) && !recommendedContext ? true : !Boolean(initialDefinitionId)
	)
	const [useManualPrice, setUseManualPrice] = useState(!recommendedContext)
	const [preview, setPreview] = useState<Preview | null>(null)
	const [published, setPublished] = useState<Preview | null>(null)
	const [compare, setCompare] = useState(false)
	const [technicalOpen, setTechnicalOpen] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
	const [loading, setLoading] = useState(false)
	const resultRef = useRef<HTMLDivElement>(null)

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
	const selectedJurisdictionCountry = jurisdictionCountry(selectedDefinition)
	const simulationCountry = selectedJurisdictionCountry || country
	const canCompare = Boolean(selectedDefinition?.currentVersion)
	const showingPreparedContext = Boolean(
		selectedDefinition && recommendedContext && !editingContext
	)
	const childrenCount = Math.max(0, Number(children) || 0)
	const money = (value: number, selectedCurrency = currency) =>
		new Intl.NumberFormat("es-CL", { style: "currency", currency: selectedCurrency }).format(value)

	useEffect(() => {
		if (preview) resultRef.current?.focus()
	}, [preview])

	useEffect(() => {
		if (!canCompare) setCompare(false)
	}, [canCompare])

	function clearPreview() {
		setPreview(null)
		setPublished(null)
	}

	function restoreRecommendedContext() {
		if (!recommendedContext) return
		setProductId(recommendedContext.productId)
		setVariantId(recommendedContext.variantId)
		setRatePlanId(recommendedContext.ratePlanId)
		setBase(String(recommendedContext.baseAmount))
		setCheckIn(recommendedContext.checkIn)
		setCheckOut(recommendedContext.checkOut)
		setAdults(String(recommendedContext.adults))
		setChildren(String(recommendedContext.children))
		setRooms(String(recommendedContext.rooms))
		setCurrency(recommendedContext.currency)
		setChannel(recommendedContext.channel)
		setUseManualPrice(false)
		clearPreview()
	}

	function selectDefinition(nextDefinitionId: string) {
		const nextDefinition = definitions.find((definition) => definition.id === nextDefinitionId)
		setDefinitionId(nextDefinitionId)
		setCountry(jurisdictionCountry(nextDefinition))
		clearPreview()
	}

	function selectProduct(nextProductId: string) {
		setProductId(nextProductId)
		setVariantId("")
		setRatePlanId("")
		clearPreview()
	}

	function selectVariant(nextVariantId: string) {
		setVariantId(nextVariantId)
		setRatePlanId("")
		clearPreview()
	}

	async function request(selectedRule = definitionId) {
		const form = new FormData()
		Object.entries({
			productId,
			variantId,
			ratePlanId,
			taxFeeDefinitionId: selectedRule,
			base: useManualPrice ? base : "",
			pricingMode: useManualPrice ? "manual" : "effective",
			checkIn,
			checkOut,
			adults,
			children,
			childrenAges,
			rooms,
			country: simulationCountry,
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

	function validate() {
		const nextErrors: FieldErrors = {}
		if (!productId) nextErrors.product = "Selecciona el producto de la reserva de prueba."
		if (!ratePlanId) nextErrors.rate = "Selecciona una tarifa para usar su contexto comercial."
		if (!checkIn) nextErrors.checkIn = "Indica la fecha de entrada."
		if (!checkOut) nextErrors.checkOut = "Indica la fecha de salida."
		if (checkIn && checkOut && checkOut <= checkIn) {
			nextErrors.checkOut = "La salida debe ser posterior a la entrada."
		}
		if (useManualPrice && (!base || Number(base) <= 0)) {
			nextErrors.base = "Indica un importe de prueba mayor que cero."
		}
		setFieldErrors(nextErrors)
		return nextErrors
	}

	async function simulate() {
		setError(null)
		clearPreview()
		const nextErrors = validate()
		if (Object.keys(nextErrors).length) {
			setError("Completa los datos marcados para comprobar la cotización.")
			const firstField = Object.keys(nextErrors)[0]
			window.setTimeout(() => document.getElementById(`simulator-${firstField}`)?.focus(), 0)
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
	const ruleValue = selectedDefinition
		? selectedDefinition.calculationType === "percentage"
			? `${selectedDefinition.value}%`
			: `${selectedDefinition.currency ?? "USD"} ${selectedDefinition.value}`
		: ""

	return (
		<section aria-labelledby="simulator-heading" className="space-y-0">
			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Certificación
					</p>
					<h2 id="simulator-heading" className="mt-1 text-lg font-semibold text-slate-950">
						{selectedDefinition
							? `Comprobar ${selectedDefinition.name}`
							: "Simulador de cotización fiscal"}
					</h2>
					<p className="mt-1 text-sm text-slate-600">
						No modifica reglas, asignaciones ni reservas.
					</p>
				</div>
				<p className="max-w-xs text-sm text-slate-500">
					Utiliza el mismo contrato de PriceQuote que búsqueda y checkout.
				</p>
			</div>

			{selectedDefinition ? (
				<div className="-mx-4 grid gap-3 border-b border-slate-200 px-4 py-5 sm:-mx-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
					<div>
						<p className="text-sm font-semibold text-slate-950">Regla que se comprueba</p>
						<p className="mt-1 text-sm text-slate-600">
							{selectedDefinition.name} <span className="text-slate-300">·</span>{" "}
							{selectedDefinition.operationalStatus === "draft" ? "Borrador" : "Publicada"}
						</p>
					</div>
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 sm:justify-end">
						<span>
							{ruleValue} {appliesPerLabel(selectedDefinition.appliesPer)}
						</span>
						<span>{countryLabel(selectedJurisdictionCountry)}</span>
						<span>Recauda {responsibilityLabel(selectedDefinition).toLowerCase()}</span>
					</div>
				</div>
			) : (
				<Section
					title="Regla a comprobar"
					description="Selecciona un borrador o deja el campo vacío para revisar únicamente las reglas publicadas aplicables."
				>
					<Field label="Regla publicada o borrador" id="simulator-definition">
						<Select value={definitionId} onChange={(event) => selectDefinition(event.target.value)}>
							<option value="">Solo reglas publicadas aplicables</option>
							{definitions.map((definition) => (
								<option key={definition.id} value={definition.id}>
									{definition.name}
									{definition.operationalStatus === "draft" ? " · Borrador" : ""}
								</option>
							))}
						</Select>
					</Field>
				</Section>
			)}

			{selectedDefinition && !recommendedContext && simulationIssues.length ? (
				<Notice variant="warning" title="Falta preparar una cotización real">
					<p>
						Para precargar una comprobación certificable, completa estas condiciones comerciales:
					</p>
					<ul className="mt-3 space-y-3">
						{simulationIssues.map((issue) => (
							<li
								key={issue.id}
								className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200/80 pt-3 first:border-t-0 first:pt-0"
							>
								<div className="min-w-0">
									<p className="font-semibold text-amber-950">{issue.title}</p>
									<p>{issue.description}</p>
								</div>
								<Button href={issue.href} variant="secondary" size="sm">
									{issue.actionLabel}
								</Button>
							</li>
						))}
					</ul>
					<p className="mt-4 border-t border-amber-200/80 pt-3">
						También puedes usar un importe de prueba para revisar solo el cálculo de este borrador;
						esa opción no certifica búsqueda ni checkout.
					</p>
				</Notice>
			) : null}

			{showingPreparedContext && recommendedContext ? (
				<PreparedContext
					context={recommendedContext}
					jurisdiction={countryLabel(selectedJurisdictionCountry)}
					residence={residence ? countryLabel(residence) : "No especificada"}
					money={money}
					onEdit={() => setEditingContext(true)}
				/>
			) : (
				<>
					<Section
						title="Contexto comercial"
						description="Define la venta representativa sobre la que se comprobará el cálculo."
					>
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1.15fr_1.15fr_0.9fr]">
							<Field label="Producto" id="simulator-product" error={fieldErrors.product} required>
								<Select
									value={productId}
									onChange={(event) => selectProduct(event.target.value)}
									aria-invalid={Boolean(fieldErrors.product)}
								>
									<option value="">Selecciona un producto</option>
									{resources.products.map((product) => (
										<option key={product.id} value={product.id}>
											{product.label}
										</option>
									))}
								</Select>
							</Field>
							<Field
								label="Unidad o salida"
								id="simulator-variant"
								description={
									!productId
										? "Selecciona primero un producto."
										: variants.length
											? undefined
											: "Este producto no tiene unidades configuradas."
								}
							>
								<Select
									value={variantId}
									disabled={!productId || !variants.length}
									onChange={(event) => selectVariant(event.target.value)}
								>
									<option value="">{variants.length ? "Todas las unidades" : "No aplica"}</option>
									{variants.map((variant) => (
										<option key={variant.id} value={variant.id}>
											{variant.label}
										</option>
									))}
								</Select>
							</Field>
							<Field label="Tarifa" id="simulator-rate" error={fieldErrors.rate} required>
								<Select
									value={ratePlanId}
									disabled={!productId || !plans.length}
									onChange={(event) => {
										setRatePlanId(event.target.value)
										clearPreview()
									}}
									aria-invalid={Boolean(fieldErrors.rate)}
								>
									<option value="">
										{productId ? "Selecciona una tarifa" : "Selecciona primero un producto"}
									</option>
									{plans.map((plan) => (
										<option key={plan.id} value={plan.id}>
											{plan.label}
										</option>
									))}
								</Select>
							</Field>
							<Field label="Canal" id="simulator-channel">
								<Select
									value={channel}
									onChange={(event) => {
										setChannel(event.target.value)
										clearPreview()
									}}
								>
									<option value="web">Web directa</option>
									<option value="channel_manager">Canal conectado</option>
								</Select>
							</Field>
						</div>
					</Section>

					<Section
						title="Reserva de prueba"
						description="Usa fechas y ocupación que representen una reserva real."
					>
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
								<Field label="Entrada" id="simulator-checkIn" error={fieldErrors.checkIn} required>
									<Input
										type="date"
										value={checkIn}
										onChange={(event) => {
											setCheckIn(event.target.value)
											clearPreview()
										}}
										aria-invalid={Boolean(fieldErrors.checkIn)}
									/>
								</Field>
								<Field label="Salida" id="simulator-checkOut" error={fieldErrors.checkOut} required>
									<Input
										type="date"
										min={checkIn || undefined}
										value={checkOut}
										onChange={(event) => {
											setCheckOut(event.target.value)
											clearPreview()
										}}
										aria-invalid={Boolean(fieldErrors.checkOut)}
									/>
								</Field>
							</div>
							<Field label="Habitaciones o cantidad" id="simulator-rooms">
								<Input
									min="1"
									type="number"
									value={rooms}
									onChange={(event) => {
										setRooms(event.target.value)
										clearPreview()
									}}
								/>
							</Field>
							<Field label="Adultos" id="simulator-adults">
								<Input
									min="1"
									type="number"
									value={adults}
									onChange={(event) => {
										setAdults(event.target.value)
										clearPreview()
									}}
								/>
							</Field>
							<Field label="Niños" id="simulator-children">
								<Input
									min="0"
									type="number"
									value={children}
									onChange={(event) => {
										setChildren(event.target.value)
										clearPreview()
									}}
								/>
							</Field>
							{useManualPrice ? (
								<Field
									label="Importe base de prueba"
									id="simulator-base"
									error={fieldErrors.base}
									description="Usa este importe solo para una hipótesis; no modifica el precio comercial de la tarifa."
									required
								>
									<Input
										inputMode="decimal"
										value={base}
										onChange={(event) => {
											setBase(event.target.value)
											clearPreview()
										}}
										aria-invalid={Boolean(fieldErrors.base)}
									/>
								</Field>
							) : null}
						</div>
						{childrenCount > 0 ? (
							<div className="mt-4 max-w-sm">
								<Field
									label="Edades de niños"
									id="simulator-childrenAges"
									description="Separa las edades con comas, por ejemplo: 6, 11."
								>
									<Input
										placeholder="6, 11"
										value={childrenAges}
										onChange={(event) => {
											setChildrenAges(event.target.value)
											clearPreview()
										}}
									/>
								</Field>
							</div>
						) : null}
					</Section>

					<Section
						title="Condiciones fiscales"
						description="Solo añade los datos del huésped que puedan cambiar la aplicación de la regla."
					>
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							<Field
								label="Residencia del huésped"
								id="simulator-residence"
								description="Opcional. Puede activar una exención por residencia."
							>
								<Select
									value={residence}
									onChange={(event) => {
										setResidence(event.target.value)
										clearPreview()
									}}
								>
									<option value="">No especificada</option>
									{countries.map((item) => (
										<option key={item.code} value={item.code}>
											{item.label} ({item.code})
										</option>
									))}
								</Select>
							</Field>
							{selectedDefinition ? (
								<ReadOnlyField
									label="Jurisdicción de la regla"
									value={countryLabel(selectedJurisdictionCountry)}
									description="Se toma de la definición seleccionada."
								/>
							) : (
								<Field
									label="Jurisdicción de la reserva"
									id="simulator-country"
									description="País donde se realiza la reserva de prueba."
								>
									<Select
										value={country}
										onChange={(event) => {
											setCountry(event.target.value)
											clearPreview()
										}}
									>
										<option value="">Selecciona un país</option>
										{countries.map((item) => (
											<option key={item.code} value={item.code}>
												{item.label} ({item.code})
											</option>
										))}
									</Select>
								</Field>
							)}
							<Field label="Moneda de la prueba" id="simulator-currency">
								<Select
									value={currency}
									onChange={(event) => {
										setCurrency(event.target.value)
										clearPreview()
									}}
								>
									{currencies.map((item) => (
										<option key={item}>{item}</option>
									))}
								</Select>
							</Field>
						</div>
					</Section>

					<div className="-mx-4 border-b border-slate-200 px-4 py-5 sm:-mx-6 sm:px-6">
						<details className="group">
							<summary className="cursor-pointer text-sm font-semibold text-slate-800 marker:text-slate-400">
								Opciones avanzadas
							</summary>
							<div className="mt-4">
								<label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
									<input
										type="checkbox"
										checked={useManualPrice}
										onChange={(event) => {
											setUseManualPrice(event.target.checked)
											clearPreview()
										}}
									/>
									Usar un importe de prueba en lugar del precio efectivo
								</label>
								{canCompare ? (
									<label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={compare}
											onChange={(event) => setCompare(event.target.checked)}
										/>
										Comparar este borrador con la versión publicada
									</label>
								) : selectedDefinition ? (
									<p className="text-sm text-slate-500">
										Esta es la primera publicación; aún no hay una versión anterior para comparar.
									</p>
								) : null}
							</div>
						</details>
						{recommendedContext ? (
							<div className="mt-4 flex justify-end">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										restoreRecommendedContext()
										setEditingContext(false)
									}}
								>
									Volver al escenario recomendado
								</Button>
							</div>
						) : null}
					</div>
				</>
			)}

			<div className="flex flex-wrap items-center justify-between gap-4 py-5">
				<p className="max-w-2xl text-sm text-slate-600">
					{selectedDefinition?.operationalStatus === "draft"
						? "El borrador se evalúa solo en esta cotización; no queda disponible para ventas."
						: "La cotización aplica las reglas operativas al contexto que seleccionaste."}
				</p>
				<Button type="button" onClick={simulate} disabled={loading}>
					{loading ? "Calculando cotización" : "Simular cotización"}
				</Button>
			</div>

			{error && <Notice variant={error.includes("copiado") ? "info" : "error"}>{error}</Notice>}
			{preview && (
				<div
					ref={resultRef}
					tabIndex={-1}
					className="grid gap-6 border-t border-slate-200 pt-6 outline-none xl:grid-cols-[minmax(0,1fr)_300px]"
				>
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
							{returnTo ? (
								<Button href={returnTo}>Continuar a publicación</Button>
							) : (
								canManage &&
								selectedDefinition?.operationalStatus === "draft" && (
									<Button
										href={`/provider/settings/tax-fees?edit=${selectedDefinition.id}&review=1`}
									>
										Revisar y publicar
									</Button>
								)
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

function PreparedContext({
	context,
	jurisdiction,
	residence,
	money,
	onEdit,
}: {
	context: FiscalSimulationContext
	jurisdiction: string
	residence: string
	money: (value: number, currency?: string) => string
	onEdit: () => void
}) {
	const dateFormat = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" })
	const checkIn = dateFormat.format(new Date(`${context.checkIn}T00:00:00.000Z`))
	const checkOut = dateFormat.format(new Date(`${context.checkOut}T00:00:00.000Z`))
	return (
		<section className="border-b border-slate-200 py-6" aria-label="Escenario recomendado">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Escenario recomendado
					</p>
					<p className="mt-1 text-sm text-slate-600">
						Elegido por disponibilidad y precio para comprobar esta regla rápidamente.
					</p>
				</div>
				<Button type="button" variant="ghost" size="sm" onClick={onEdit}>
					Cambiar datos
				</Button>
			</div>
			<dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
				<ScenarioRow
					label="Venta"
					value={context.productLabel}
					detail={`${context.variantLabel} · ${context.ratePlanLabel}`}
					onEdit={onEdit}
				/>
				<ScenarioRow
					label="Reserva"
					value={`${checkIn} – ${checkOut}`}
					detail={`${context.rooms} habitación · ${context.adults} adultos${context.children ? ` · ${context.children} niños` : ""}`}
					onEdit={onEdit}
				/>
				<ScenarioRow
					label="Canal"
					value="Web directa"
					detail="Canal de venta de esta prueba"
					onEdit={onEdit}
				/>
				<ScenarioRow
					label="Condiciones fiscales"
					value={jurisdiction}
					detail={`Residencia del huésped: ${residence}`}
					onEdit={onEdit}
				/>
				<ScenarioRow
					label="Precio de la estancia"
					value={money(context.baseAmount, context.currency)}
					detail={
						context.pricingSource === "effective_pricing_v2"
							? "Precio efectivo para estas fechas"
							: "Precio disponible para estas fechas"
					}
					onEdit={onEdit}
				/>
			</dl>
		</section>
	)
}

function ScenarioRow({
	label,
	value,
	detail,
	onEdit,
}: {
	label: string
	value: string
	detail: string
	onEdit: () => void
}) {
	return (
		<div className="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center">
			<dt className="text-sm text-slate-500">{label}</dt>
			<dd className="min-w-0">
				<p className="truncate text-sm font-semibold text-slate-950">{value}</p>
				<p className="mt-0.5 truncate text-sm text-slate-500">{detail}</p>
			</dd>
			<Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onEdit}>
				Cambiar
			</Button>
		</div>
	)
}

function Section({
	title,
	description,
	children,
}: {
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<section className="border-b border-slate-200 py-5" aria-label={title}>
			<div className="mb-4">
				<h3 className="text-sm font-semibold text-slate-950">{title}</h3>
				<p className="mt-1 text-sm text-slate-600">{description}</p>
			</div>
			{children}
		</section>
	)
}

function Field({
	label,
	id,
	children,
	description,
	error,
	required = false,
}: {
	label: string
	id?: string
	children: ReactNode
	description?: string
	error?: string
	required?: boolean
}) {
	const message = error ?? description
	const control = isValidElement<{ "id"?: string; "aria-describedby"?: string }>(children)
		? cloneElement(children, {
				id,
				"aria-describedby": message && id ? `${id}-message` : undefined,
			})
		: children
	return (
		<label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor={id}>
			<span>
				{label}
				{required ? (
					<span className="ml-1 text-slate-400" aria-hidden="true">
						*
					</span>
				) : null}
			</span>
			{control}
			{message ? (
				<span
					id={id ? `${id}-message` : undefined}
					className={
						error ? "text-xs font-normal text-red-600" : "text-xs font-normal text-slate-500"
					}
				>
					{message}
				</span>
			) : null}
		</label>
	)
}

function ReadOnlyField({
	label,
	value,
	description,
}: {
	label: string
	value: string
	description: string
}) {
	return (
		<div className="grid gap-1.5 text-sm font-medium text-slate-700">
			<span>{label}</span>
			<div className="fastt-soft-box flex h-11 items-center rounded-[var(--fastt-radius-control)] border border-slate-200 bg-slate-50 px-3 text-slate-700">
				{value}
			</div>
			<span className="text-xs font-normal text-slate-500">{description}</span>
		</div>
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
