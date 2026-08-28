import {
	cloneElement,
	isValidElement,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react"

import { Button, Checkbox, DatesModal, Input, Notice, Select, TravelersPicker } from "../ui-react"
import { fiscalIcons } from "./fiscal-icons"
import type {
	FiscalSimulationContext,
	FiscalSimulationIssue,
} from "@/lib/taxes-fees/fiscal-workspace-resources"
import type { DefinitionSummary, TaxFeeScopeResources } from "./TaxFeeWizard"

type SimulationNotice = {
	variant: "warning" | "info" | "neutral"
	title: string
	intro: string
	footer: string | null
	allowsManualFallback: boolean
}
type ReadinessPayload = {
	context: FiscalSimulationContext | null
	issues: FiscalSimulationIssue[]
	coverageIssues?: FiscalSimulationIssue[]
	notice?: SimulationNotice | null
	target?: { preferredProductId: string | null }
}

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
	coverageIssues?: FiscalSimulationIssue[]
	simulationNotice?: SimulationNotice | null
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
	coverageIssues = [],
	simulationNotice = null,
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
	const [preparedContext, setPreparedContext] = useState(recommendedContext)
	const [blockingIssues, setBlockingIssues] = useState(simulationIssues)
	const [coverage, setCoverage] = useState(coverageIssues)
	const [notice, setNotice] = useState(simulationNotice)
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
	const [isCheckingReadiness, setIsCheckingReadiness] = useState(false)
	const resultRef = useRef<HTMLDivElement>(null)
	const skipInitialReadinessFetch = useRef(true)
	const productIdRef = useRef(productId)
	productIdRef.current = productId

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
	const ruleLockedFromDefinitions = Boolean(
		returnTo && initialDefinitionId && selectedDefinition?.id === initialDefinitionId
	)
	const showingPreparedContext = Boolean(selectedDefinition && preparedContext && !editingContext)
	const childrenCount = Math.max(0, Number(children) || 0)
	const money = (value: number, selectedCurrency = currency) =>
		new Intl.NumberFormat("es-CL", { style: "currency", currency: selectedCurrency }).format(value)

	useEffect(() => {
		if (preview) resultRef.current?.focus()
	}, [preview])

	useEffect(() => {
		if (!canCompare) setCompare(false)
	}, [canCompare])

	useEffect(() => {
		const url = new URL(window.location.href)
		if (definitionId) url.searchParams.set("definitionId", definitionId)
		else url.searchParams.delete("definitionId")
		window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
	}, [definitionId])

	useEffect(() => {
		if (skipInitialReadinessFetch.current && definitionId === (initialDefinitionId ?? "")) {
			skipInitialReadinessFetch.current = false
			return
		}
		skipInitialReadinessFetch.current = false
		if (!definitionId) {
			setPreparedContext(null)
			setBlockingIssues([])
			setCoverage([])
			setNotice(null)
			setEditingContext(true)
			setIsCheckingReadiness(false)
			return
		}
		let cancelled = false
		setIsCheckingReadiness(true)
		setNotice(null)
		setBlockingIssues([])
		setCoverage([])
		setPreparedContext(null)
		const params = new URLSearchParams({ definitionId })
		if (initialProductId) params.set("scope", initialProductId)
		if (new URL(window.location.href).searchParams.get("mode") === "manual") {
			params.set("mode", "manual")
		}
		void fetch(`/api/provider/tax-fees/simulation-readiness?${params.toString()}`)
			.then(async (response) => {
				if (!response.ok) throw new Error("No se pudo revisar esta regla")
				return (await response.json()) as ReadinessPayload
			})
			.then((result) => {
				if (cancelled) return
				setPreparedContext(result.context)
				setBlockingIssues(result.issues ?? [])
				setCoverage(result.coverageIssues ?? [])
				setNotice(result.notice ?? null)
				if (result.context) applyPreparedContext(result.context)
				else {
					setEditingContext(true)
					const nextProductId = result.target?.preferredProductId
					if (nextProductId && nextProductId !== productIdRef.current) {
						setProductId(nextProductId)
						setVariantId("")
						setRatePlanId("")
					}
				}
			})
			.catch(() => {
				if (cancelled) return
				setBlockingIssues([])
				setCoverage([])
				setNotice(null)
			})
			.finally(() => {
				if (!cancelled) setIsCheckingReadiness(false)
			})
		return () => {
			cancelled = true
		}
	}, [definitionId, initialProductId])

	function clearPreview() {
		setPreview(null)
		setPublished(null)
	}

	function applyPreparedContext(context: FiscalSimulationContext) {
		setProductId(context.productId)
		setVariantId(context.variantId)
		setRatePlanId(context.ratePlanId)
		setBase(String(context.baseAmount))
		setCheckIn(context.checkIn)
		setCheckOut(context.checkOut)
		setAdults(String(context.adults))
		setChildren(String(context.children))
		setRooms(String(context.rooms))
		setCurrency(context.currency)
		setChannel(context.channel)
		setUseManualPrice(false)
		setEditingContext(false)
		clearPreview()
	}

	function restoreRecommendedContext() {
		if (!preparedContext) return
		applyPreparedContext(preparedContext)
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
			<div className="border-b border-slate-200 pb-8 sm:pb-12">
				<p className="text-[0.6875rem] font-semibold tracking-[0.06em] text-slate-500 uppercase sm:text-xs sm:tracking-[0.08em]">
					Certificación
				</p>
				<h2
					id="simulator-heading"
					className="mt-1 text-base font-semibold text-slate-950 sm:text-lg"
				>
					{selectedDefinition
						? `Comprobar ${selectedDefinition.name}`
						: "Simulador de cotización fiscal"}
				</h2>
				{ruleLockedFromDefinitions && selectedDefinition ? (
					<p className="mt-2 flex max-w-2xl flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
						<span>
							{ruleValue} {appliesPerLabel(selectedDefinition.appliesPer)}
						</span>
						<span>{countryLabel(selectedJurisdictionCountry)}</span>
						<span>Recauda {responsibilityLabel(selectedDefinition).toLowerCase()}</span>
					</p>
				) : null}
				<p
					className={`max-w-2xl text-sm leading-5 text-slate-600 sm:leading-6 ${
						ruleLockedFromDefinitions ? "mt-2" : "mt-1"
					}`}
				>
					Esta prueba no cambia reglas, asignaciones ni reservas. El precio se calcula igual que
					cuando el huésped busca y reserva.
				</p>
			</div>

			{ruleLockedFromDefinitions ? null : (
				<Section
					icon={fiscalIcons.file}
					title="Regla a comprobar"
					description="Selecciona un borrador o deja el campo vacío para revisar únicamente las reglas publicadas aplicables."
				>
					<Field label="Regla publicada o borrador" id="simulator-definition" className="max-w-2xl">
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
					{selectedDefinition ? (
						<p className="mt-3 flex max-w-2xl flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
							<span>
								{ruleValue} {appliesPerLabel(selectedDefinition.appliesPer)}
							</span>
							<span>{countryLabel(selectedJurisdictionCountry)}</span>
							<span>Recauda {responsibilityLabel(selectedDefinition).toLowerCase()}</span>
						</p>
					) : null}
				</Section>
			)}

			{selectedDefinition && isCheckingReadiness ? (
				<p className="mt-5 text-sm text-slate-500">
					Revisando qué falta para comprobar esta regla...
				</p>
			) : null}

			{selectedDefinition && notice && blockingIssues.length ? (
				<Notice className="mt-5 p-5" variant={notice.variant} title={notice.title}>
					<p className="max-w-2xl">{notice.intro}</p>
					<ul
						className={`mt-4 divide-y ${
							notice.variant === "warning" ? "divide-amber-200/80" : "divide-slate-200"
						}`}
					>
						{blockingIssues.map((issue) => (
							<li
								key={issue.id}
								className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0">
									<p
										className={
											notice.variant === "warning"
												? "font-semibold text-amber-950"
												: "font-semibold text-slate-950"
										}
									>
										{issue.title}
									</p>
									<p>{issue.description}</p>
								</div>
								<Button href={issue.href} variant="secondary" size="sm" className="shrink-0">
									{issue.actionLabel}
								</Button>
							</li>
						))}
					</ul>
					{notice.footer ? (
						<p
							className={`mt-4 border-t pt-4 ${
								notice.variant === "warning" ? "border-amber-200/80" : "border-slate-200"
							}`}
						>
							{notice.footer}
						</p>
					) : null}
				</Notice>
			) : null}

			{selectedDefinition && coverage.length ? (
				<Notice className="mt-5 p-5" variant="neutral" title={coverage[0]?.title}>
					<ul className="divide-y divide-slate-200">
						{coverage.map((issue) => (
							<li
								key={issue.id}
								className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0">
									{coverage.length > 1 ? (
										<p className="font-semibold text-slate-950">{issue.title}</p>
									) : null}
									<p>{issue.description}</p>
								</div>
								<Button href={issue.href} variant="secondary" size="sm" className="shrink-0">
									{issue.actionLabel}
								</Button>
							</li>
						))}
					</ul>
				</Notice>
			) : null}

			{showingPreparedContext && preparedContext ? (
				<PreparedContext
					context={preparedContext}
					definitionName={selectedDefinition?.name ?? "esta regla"}
					jurisdiction={countryLabel(selectedJurisdictionCountry)}
					residence={residence ? countryLabel(residence) : "No especificada"}
					money={money}
					onEdit={() => setEditingContext(true)}
				/>
			) : (
				<>
					<Section
						icon={fiscalIcons.layers}
						title="Contexto comercial"
						description="Define la venta representativa sobre la que se comprobará el cálculo."
					>
						<div className="grid items-start gap-3 md:grid-cols-2">
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
						icon={fiscalIcons.calendar}
						title="Reserva de prueba"
						description="Usa fechas y ocupación que representen una reserva real."
					>
						<div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
							<DatesModal
								id="simulator-checkIn"
								label="Entrada"
								value={checkIn}
								required
								error={fieldErrors.checkIn}
								onChange={(next) => {
									setCheckIn(next)
									clearPreview()
								}}
							/>
							<DatesModal
								id="simulator-checkOut"
								label="Salida"
								value={checkOut}
								min={checkIn || undefined}
								required
								error={fieldErrors.checkOut}
								onChange={(next) => {
									setCheckOut(next)
									clearPreview()
								}}
							/>
							<TravelersPicker
								id="simulator-guests"
								adults={Math.max(1, Number(adults) || 1)}
								childrenCount={Math.max(0, Number(children) || 0)}
								rooms={Math.max(1, Number(rooms) || 1)}
								onAdultsChange={(value) => {
									setAdults(String(value))
									clearPreview()
								}}
								onChildrenChange={(value) => {
									setChildren(String(value))
									clearPreview()
								}}
								onRoomsChange={(value) => {
									setRooms(String(value))
									clearPreview()
								}}
							/>
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
							{childrenCount > 0 ? (
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
							) : null}
						</div>
					</Section>

					<Section
						icon={fiscalIcons.percent}
						title="Condiciones fiscales"
						description="Solo añade los datos del huésped que puedan cambiar la aplicación de la regla."
					>
						<div className="grid items-start gap-3 md:grid-cols-2">
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

					<Section
						icon={fiscalIcons.sliders}
						title="Opciones avanzadas"
						description="Ajustes opcionales de esta comprobación."
					>
						<div className="flex flex-wrap gap-2">
							<Checkbox
								checked={useManualPrice}
								onChange={(event) => {
									setUseManualPrice(event.target.checked)
									clearPreview()
								}}
							>
								Usar un importe de prueba en lugar del precio efectivo
							</Checkbox>
							{canCompare ? (
								<Checkbox checked={compare} onChange={(event) => setCompare(event.target.checked)}>
									Comparar este borrador con la versión publicada
								</Checkbox>
							) : selectedDefinition ? (
								<p className="self-center text-sm text-slate-500">
									Esta es la primera publicación; aún no hay una versión anterior para comparar.
								</p>
							) : null}
						</div>
						{preparedContext ? (
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
					</Section>
				</>
			)}

			<div className="flex flex-col-reverse gap-3 py-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4 sm:py-12">
				<p className="max-w-xl text-sm leading-5 text-slate-500 sm:mr-auto sm:leading-6">
					{selectedDefinition?.operationalStatus === "draft"
						? "El borrador se evalúa solo en esta cotización; no queda disponible para ventas."
						: "La cotización aplica las reglas operativas al contexto que seleccionaste."}
				</p>
				<Button type="button" className="w-full sm:w-auto" onClick={simulate} disabled={loading}>
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
						<div className="flex flex-col gap-2 border-b border-slate-200 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
							<div className="min-w-0">
								<p className="text-[0.6875rem] font-semibold tracking-[0.06em] text-slate-500 uppercase sm:text-xs sm:tracking-[0.08em]">
									Recibo de simulación
								</p>
								<p className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">
									{money(preview.quote.totalAmount, preview.quote.currency)}
								</p>
							</div>
							<div className="text-xs break-all text-slate-500 sm:text-right">
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
	definitionName,
	jurisdiction,
	residence,
	money,
	onEdit,
}: {
	context: FiscalSimulationContext
	definitionName: string
	jurisdiction: string
	residence: string
	money: (value: number, currency?: string) => string
	onEdit: () => void
}) {
	const dateFormat = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" })
	const checkIn = dateFormat.format(new Date(`${context.checkIn}T00:00:00.000Z`))
	const checkOut = dateFormat.format(new Date(`${context.checkOut}T00:00:00.000Z`))
	return (
		<section className="border-b border-slate-200 py-8 sm:py-12" aria-label="Escenario recomendado">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Escenario recomendado
					</p>
					<p className="mt-1 text-sm text-slate-600">
						Elegido por disponibilidad y precio para comprobar {definitionName} rápidamente.
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
						context.pricingSource === "effective_pricing"
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
	icon,
	children,
}: {
	title: string
	description: string
	icon?: ReactNode
	children: ReactNode
}) {
	return (
		<section className="border-b border-slate-200 py-8 sm:py-12" aria-label={title}>
			<div className="mb-5 flex items-start gap-2.5 sm:mb-6 sm:gap-3">
				{icon ? (
					<span className="fastt-section-icon mt-0.5" aria-hidden="true">
						{icon}
					</span>
				) : null}
				<div className="min-w-0">
					<h3 className="text-sm font-semibold text-slate-950">{title}</h3>
					<p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
						{description}
					</p>
				</div>
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
	compact = false,
	className = "",
}: {
	label: string
	id?: string
	children: ReactNode
	description?: string
	error?: string
	required?: boolean
	compact?: boolean
	className?: string
}) {
	const message = error ?? description
	const control = isValidElement<{ "id"?: string; "aria-describedby"?: string }>(children)
		? cloneElement(children, {
				id,
				"aria-describedby": message && id ? `${id}-message` : undefined,
			})
		: children
	return (
		<div className={`min-w-0 ${className}`.trim()}>
			<label
				className={[
					"fastt-prompt-field h-full",
					compact ? "fastt-prompt-field--compact" : "",
					error ? "fastt-prompt-field--invalid" : "",
				]
					.filter(Boolean)
					.join(" ")}
				htmlFor={id}
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
					{control}
				</span>
			</label>
			{message ? (
				<p
					id={id ? `${id}-message` : undefined}
					className={error ? "mt-1.5 text-xs text-red-600" : "mt-1.5 text-xs text-slate-500"}
				>
					{message}
				</p>
			) : null}
		</div>
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
		<div className="min-w-0">
			<div className="fastt-prompt-field fastt-prompt-field--readonly">
				<span className="fastt-prompt-field__copy">
					<span className="fastt-prompt-field__label">{label}</span>
					<span className="fastt-prompt-field__value">{value}</span>
				</span>
			</div>
			<p className="mt-1.5 text-xs text-slate-500">{description}</p>
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
