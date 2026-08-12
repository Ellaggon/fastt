import { useEffect, useMemo, useState } from "react"

import { Badge, Button, Card, ChoiceCard, Input, Notice, Select } from "../ui-react"

type TaxFeeKind = "tax" | "fee"
type CalculationType = "percentage" | "fixed"
type AppliesPer = "stay" | "night" | "guest" | "guest_night"
type InclusionType = "included" | "excluded"
type ScopeType = "product" | "variant" | "rate_plan" | "provider"
type CollectionResponsibility = "provider" | "platform" | "marketplace"

export type DefinitionSummary = {
	id: string
	code: string
	name: string
	kind: TaxFeeKind
	calculationType: CalculationType
	value: number
	currency: string | null
	inclusionType: InclusionType
	appliesPer: AppliesPer
	priority: number
	jurisdictionJson?: unknown | null
	effectiveFrom: string | null
	effectiveTo: string | null
	status: "active" | "archived"
	operationalStatus?:
		| "draft"
		| "scheduled"
		| "active"
		| "paused"
		| "expired"
		| "conflict"
		| "archived"
	revision?: number
	currentVersion?: {
		id: string
		version: number
		publicationState: "published" | "scheduled"
		createdAt: string
		createdByUserId?: string | null
	} | null
	lastChangedAt?: string | null
	assignments?: Array<{
		id: string
		scope: ScopeType
		scopeId: string | null
		channel: string | null
		status: "active" | "archived"
		createdAt: string
	}>
	auditTrail?: Array<{ action: string; createdAt: string }>
}

export type ApiWarning = {
	code: string
	message: string
	meta?: Record<string, unknown>
}

type PreviewLine = {
	code: string
	name: string
	amount: number
	currency: string | null
	inclusionType: InclusionType
	appliesPer: AppliesPer
}

type PreviewResult = {
	breakdown: {
		base: number
		taxes: { included: PreviewLine[]; excluded: PreviewLine[] }
		fees: { included: PreviewLine[]; excluded: PreviewLine[] }
		total: number
	}
	total: number
	flags: {
		hasIncluded: boolean
		hasExcluded: boolean
	}
	context?: {
		productId: string
		variantId: string | null
		ratePlanId: string | null
		channel: string
	}
}

type WarningGroup = {
	title: string
	items: ApiWarning[]
}

export type TaxFeeWizardMode = "creating" | "editing"

export type TaxFeeScopeResources = {
	providerId: string
	products: Array<{ id: string; label: string; kind: string }>
	variants: Array<{ id: string; productId: string; label: string; kind: string }>
	ratePlans: Array<{
		id: string
		productId: string
		variantId: string
		label: string
		isActive: boolean
	}>
}

export type TaxFeeSuggestedDraft = {
	id: string
	title: string
	reviewNote: string
	draft: {
		kind: TaxFeeKind
		name: string
		code: string
		calculationType: CalculationType
		appliesPer: AppliesPer
		inclusionType: InclusionType
		collectionResponsibility: CollectionResponsibility
		country: string
	}
}

type TaxFeeWizardProps = {
	initialDefinitions: DefinitionSummary[]
	initialWarnings: ApiWarning[]
	initialMode?: TaxFeeWizardMode
	initialDefinitionId?: string | null
	initialDuplicateDefinitionId?: string | null
	initialResources: TaxFeeScopeResources
	showDefinitionsSidebar?: boolean
	onDefinitionsChange?: (definitions: DefinitionSummary[], warnings: ApiWarning[]) => void
	onEditingComplete?: (message: string) => void
	onCancel?: () => void
	initialSuggestion?: TaxFeeSuggestedDraft | null
}

type DraftState = {
	kind: TaxFeeKind | null
	presetKey: string | null
	name: string
	code: string
	calculationType: CalculationType | null
	value: string
	currency: string
	appliesPer: AppliesPer
	inclusionType: InclusionType
	scope: ScopeType
	scopeId: string
	productId: string
	channel: string
	effectiveFrom: string
	effectiveTo: string
	jurisdictionCountry: string
	guestResidenceExempt: string
	collectionResponsibility: CollectionResponsibility
	taxableBase: "booking_base" | "base_plus_included"
	maxAmount: string
	maxNights: string
	seasonFrom: string
	seasonTo: string
	seasonValue: string
	base: string
	checkIn: string
	checkOut: string
	adults: string
	children: string
}

type Preset = {
	key: string
	kind: TaxFeeKind | "both"
	label: string
	description: string
	calculationType?: CalculationType
	appliesPer?: AppliesPer
	inclusionType?: InclusionType
}

const PRESETS: Preset[] = [
	{
		key: "VAT",
		kind: "tax",
		label: "VAT / IVA",
		description: "Impuesto porcentual incluido en el precio mostrado.",
		calculationType: "percentage",
		appliesPer: "stay",
		inclusionType: "included",
	},
	{
		key: "CITY_TAX",
		kind: "tax",
		label: "Tasa municipal",
		description: "Impuesto local fijo que suele cobrarse por huésped y noche.",
		calculationType: "fixed",
		appliesPer: "guest_night",
		inclusionType: "excluded",
	},
	{
		key: "SERVICE_FEE",
		kind: "fee",
		label: "Cargo de servicio",
		description: "Cargo operativo porcentual agregado al subtotal de la estadía.",
		calculationType: "percentage",
		appliesPer: "stay",
		inclusionType: "excluded",
	},
	{
		key: "CLEANING_FEE",
		kind: "fee",
		label: "Cargo de limpieza",
		description: "Cargo fijo que se cobra una vez por estadía.",
		calculationType: "fixed",
		appliesPer: "stay",
		inclusionType: "excluded",
	},
	{
		key: "RESORT_FEE",
		kind: "fee",
		label: "Cargo de resort",
		description: "Cargo fijo por noche para servicios del establecimiento.",
		calculationType: "fixed",
		appliesPer: "night",
		inclusionType: "excluded",
	},
	{
		key: "CUSTOM",
		kind: "both",
		label: "Personalizado",
		description: "Comienza desde una configuración neutral y define el cargo manualmente.",
	},
]

const STEP_LABELS = [
	{ id: 1, title: "Identidad" },
	{ id: 2, title: "Cálculo" },
	{ id: 3, title: "Jurisdicción" },
	{ id: 4, title: "Recaudación y vigencia" },
	{ id: 5, title: "Revisión y publicación" },
]

const APPLIES_PER_OPTIONS: Array<{ value: AppliesPer; label: string }> = [
	{ value: "stay", label: "Por estadía" },
	{ value: "night", label: "Por noche" },
	{ value: "guest", label: "Por huésped" },
	{ value: "guest_night", label: "Por huésped por noche" },
]

const INCLUDED_OPTIONS: Array<{ value: InclusionType; label: string; helper: string }> = [
	{
		value: "included",
		label: "Incluido en el precio",
		helper: "El huésped lo ve incorporado en el precio publicado.",
	},
	{
		value: "excluded",
		label: "Agregado al confirmar",
		helper: "El huésped lo ve sumado sobre el precio publicado.",
	},
]

const CALCULATION_OPTIONS: Array<{ value: CalculationType; label: string; helper: string }> = [
	{
		value: "percentage",
		label: "Porcentaje",
		helper: "Se calcula como porcentaje del subtotal de la estadía.",
	},
	{
		value: "fixed",
		label: "Monto fijo",
		helper: "Se cobra como monto plano usando la frecuencia seleccionada.",
	},
]

const KIND_OPTIONS: Array<{ value: TaxFeeKind; label: string; description: string }> = [
	{
		value: "tax",
		label: "Impuesto",
		description: "Cargos gubernamentales o locales como IVA o tasas municipales.",
	},
	{
		value: "fee",
		label: "Cargo",
		description: "Cargos operativos como limpieza, servicio o costos del establecimiento.",
	},
]

const SCOPE_OPTIONS: Array<{ value: ScopeType; label: string; helper: string }> = [
	{ value: "product", label: "Producto", helper: "Aplicar a un hotel o servicio completo." },
	{ value: "variant", label: "Unidad", helper: "Aplicar solo a una habitación o unidad vendible." },
	{ value: "rate_plan", label: "Tarifa", helper: "Aplicar solo a una tarifa específica." },
	{
		value: "provider",
		label: "Proveedor",
		helper: "Aplicar de forma amplia a la cuenta del proveedor.",
	},
]

function makeTomorrow(offsetDays: number) {
	const date = new Date()
	date.setDate(date.getDate() + offsetDays)
	return date.toISOString().slice(0, 10)
}

const initialDraft: DraftState = {
	kind: null,
	presetKey: null,
	name: "",
	code: "",
	calculationType: null,
	value: "",
	currency: "USD",
	appliesPer: "stay",
	inclusionType: "excluded",
	scope: "product",
	scopeId: "",
	productId: "",
	channel: "",
	effectiveFrom: "",
	effectiveTo: "",
	jurisdictionCountry: "",
	guestResidenceExempt: "",
	collectionResponsibility: "provider",
	taxableBase: "booking_base",
	maxAmount: "",
	maxNights: "",
	seasonFrom: "",
	seasonTo: "",
	seasonValue: "",
	base: "100",
	checkIn: makeTomorrow(7),
	checkOut: makeTomorrow(8),
	adults: "2",
	children: "0",
}

function sanitizeCode(input: string) {
	return input
		.toUpperCase()
		.trim()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

function buildDefinitionCode(draft: DraftState) {
	if (draft.code) return draft.code
	const presetBase = draft.presetKey && draft.presetKey !== "CUSTOM" ? draft.presetKey : draft.name
	const scopeBase = draft.scope ? `${draft.scope}_${draft.scopeId || "PENDING"}` : "DRAFT"
	return sanitizeCode(`${presetBase}_${scopeBase}`) || "CUSTOM_TAX_FEE"
}

function formatMoney(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount)
}

function groupWarnings(warnings: ApiWarning[]): WarningGroup[] {
	const grouped = new Map<string, ApiWarning[]>()

	for (const warning of warnings) {
		const title =
			warning.code === "high_percentage"
				? "Revisar monto"
				: warning.code === "overlap_detected"
					? "Posible solapamiento"
					: warning.code === "duplicate_code"
						? "Ya existe un cargo similar"
						: "Requiere revisión"

		const existing = grouped.get(title) ?? []
		existing.push(warning)
		grouped.set(title, existing)
	}

	return Array.from(grouped.entries()).map(([title, items]) => ({ title, items }))
}

function formatDateForInput(value: string | null) {
	if (!value) return ""
	return value.slice(0, 10)
}

function mapDefinitionToDraft(definition: DefinitionSummary): DraftState {
	const rule =
		definition.jurisdictionJson && typeof definition.jurisdictionJson === "object"
			? (definition.jurisdictionJson as Record<string, unknown>)
			: {}
	const seasons = Array.isArray(rule.seasons) ? rule.seasons : []
	const season =
		seasons[0] && typeof seasons[0] === "object" ? (seasons[0] as Record<string, unknown>) : {}
	return {
		...initialDraft,
		kind: definition.kind,
		presetKey:
			PRESETS.find((preset) => preset.key === definition.code || preset.label === definition.name)
				?.key ?? "CUSTOM",
		name: definition.name,
		code: definition.code,
		calculationType: definition.calculationType,
		value: String(definition.value),
		currency: definition.currency ?? "USD",
		appliesPer: definition.appliesPer,
		inclusionType: definition.inclusionType,
		effectiveFrom: formatDateForInput(definition.effectiveFrom),
		effectiveTo: formatDateForInput(definition.effectiveTo),
		jurisdictionCountry: String(rule.country ?? ""),
		guestResidenceExempt: Array.isArray(rule.exemptGuestResidenceCountries)
			? rule.exemptGuestResidenceCountries.map(String).join(", ")
			: "",
		collectionResponsibility:
			rule.collectionResponsibility === "platform" ||
			rule.collectionResponsibility === "marketplace"
				? rule.collectionResponsibility
				: "provider",
		taxableBase: rule.taxableBase === "base_plus_included" ? "base_plus_included" : "booking_base",
		maxAmount: rule.maxAmount == null ? "" : String(rule.maxAmount),
		maxNights: rule.maxNights == null ? "" : String(rule.maxNights),
		seasonFrom: String(season.from ?? ""),
		seasonTo: String(season.to ?? ""),
		seasonValue: season.value == null ? "" : String(season.value),
	}
}

function isValidDateRange(from: string, to: string) {
	if (!from || !to) return true
	return new Date(from).getTime() < new Date(to).getTime()
}

async function readJsonSafe(response: Response) {
	const text = await response.text()
	return text ? JSON.parse(text) : null
}

function readableApiError(value: unknown, fallback: string) {
	const raw = String(value ?? "").trim()
	if (!raw) return fallback
	const normalized = raw.toLowerCase()
	if (normalized.includes("duplicate")) return "Ya existe una definición similar."
	if (normalized === "not found" || normalized.includes("not_found"))
		return "No se encontró el recurso solicitado."
	if (normalized.includes("unauthorized")) return "Tu sesión no está autorizada para esta acción."
	if (normalized.includes("preview failed")) return "No se pudo ejecutar la vista previa."
	if (normalized.includes("assignment failed")) return "No se pudo guardar la asignación."
	if (normalized.includes("failed to save")) return "No se pudo guardar la definición."
	if (normalized.includes("failed to refresh")) return "No se pudieron actualizar las definiciones."
	if (normalized.includes("validation")) return "Revisa los campos obligatorios antes de continuar."
	return raw
}

export default function TaxFeeWizard(props: TaxFeeWizardProps) {
	const [step, setStep] = useState(1)
	const [draft, setDraft] = useState<DraftState>(initialDraft)
	const [definitions, setDefinitions] = useState<DefinitionSummary[]>(props.initialDefinitions)
	const [listWarnings, setListWarnings] = useState<ApiWarning[]>(props.initialWarnings)
	const [editingDefinitionId, setEditingDefinitionId] = useState<string | null>(null)
	const [definitionId, setDefinitionId] = useState<string | null>(null)
	const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
	const [previewWarnings, setPreviewWarnings] = useState<ApiWarning[]>([])
	const [hasSuccessfulPreview, setHasSuccessfulPreview] = useState(false)
	const [isSavingDefinition, setIsSavingDefinition] = useState(false)
	const [isPreviewLoading, setIsPreviewLoading] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)
	const [isRefreshingDefinitions, setIsRefreshingDefinitions] = useState(false)

	const filteredPresets = useMemo(() => {
		if (!draft.kind) return []
		return PRESETS.filter((preset) => preset.kind === draft.kind || preset.kind === "both")
	}, [draft.kind])

	const selectedPreset = useMemo(
		() => filteredPresets.find((preset) => preset.key === draft.presetKey) ?? null,
		[filteredPresets, draft.presetKey]
	)

	const warningGroups = useMemo(() => groupWarnings(previewWarnings), [previewWarnings])
	const listWarningGroups = useMemo(() => groupWarnings(listWarnings), [listWarnings])
	const previewCurrency =
		draft.calculationType === "fixed" && draft.currency ? draft.currency : "USD"
	const includedLines = previewResult
		? [...previewResult.breakdown.taxes.included, ...previewResult.breakdown.fees.included]
		: []
	const excludedLines = previewResult
		? [...previewResult.breakdown.taxes.excluded, ...previewResult.breakdown.fees.excluded]
		: []
	const showDefinitionsSidebar = false
	const selectableVariants = useMemo(
		() =>
			props.initialResources.variants.filter((variant) => variant.productId === draft.productId),
		[props.initialResources.variants, draft.productId]
	)
	const selectedVariantId =
		draft.scope === "rate_plan"
			? (props.initialResources.ratePlans.find((ratePlan) => ratePlan.id === draft.scopeId)
					?.variantId ?? draft.scopeId)
			: draft.scopeId
	const selectableRatePlans = useMemo(
		() =>
			props.initialResources.ratePlans.filter(
				(ratePlan) => ratePlan.variantId === selectedVariantId && ratePlan.isActive
			),
		[props.initialResources.ratePlans, selectedVariantId]
	)
	const changedFields = useMemo(() => {
		const current = editingDefinitionId
			? definitions.find((definition) => definition.id === editingDefinitionId)
			: null
		if (!current) return ["Nueva regla"]
		const changes: string[] = []
		if (current.name !== draft.name) changes.push("nombre")
		if (current.value !== Number(draft.value)) changes.push("monto")
		if (current.appliesPer !== draft.appliesPer) changes.push("frecuencia")
		if (current.inclusionType !== draft.inclusionType) changes.push("presentación al huésped")
		return changes.length ? changes : ["Sin cambios materiales"]
	}, [definitions, draft, editingDefinitionId])

	useEffect(() => {
		setDraft((current) => {
			if (!current.kind || !current.presetKey) return current
			if (current.presetKey === "CUSTOM") {
				return current.name
					? current
					: {
							...current,
							name: current.kind === "tax" ? "Impuesto personalizado" : "Cargo personalizado",
						}
			}
			const preset = PRESETS.find((item) => item.key === current.presetKey)
			if (!preset) return current
			return current.name ? current : { ...current, name: preset.label }
		})
	}, [draft.kind, draft.presetKey])

	useEffect(() => {
		setDefinitions(props.initialDefinitions)
	}, [props.initialDefinitions])

	useEffect(() => {
		setListWarnings(props.initialWarnings)
	}, [props.initialWarnings])

	useEffect(() => {
		const suggestion = props.initialSuggestion
		if (!suggestion || props.initialMode !== "creating") return
		setDraft({
			...initialDraft,
			kind: suggestion.draft.kind,
			presetKey: "CUSTOM",
			name: suggestion.draft.name,
			code: suggestion.draft.code,
			calculationType: suggestion.draft.calculationType,
			appliesPer: suggestion.draft.appliesPer,
			inclusionType: suggestion.draft.inclusionType,
			jurisdictionCountry: suggestion.draft.country,
			collectionResponsibility: suggestion.draft.collectionResponsibility,
		})
		setStep(2)
	}, [props.initialMode, props.initialSuggestion])

	const stepValid =
		step === 1
			? !!draft.kind
			: step === 2
				? draft.calculationType !== null &&
					Number(draft.value) > 0 &&
					(draft.calculationType === "percentage" || draft.currency.trim().length > 0)
				: step === 3
					? draft.scopeId.trim().length > 0 && draft.productId.trim().length > 0
					: step === 4
						? draft.name.trim().length > 0 &&
							isValidDateRange(draft.effectiveFrom, draft.effectiveTo)
						: hasSuccessfulPreview

	function invalidatePreview() {
		setPreviewResult(null)
		setPreviewWarnings([])
		setHasSuccessfulPreview(false)
	}

	function updateDraft(patch: Partial<DraftState>) {
		setDraft((current) => ({ ...current, ...patch }))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	async function refreshDefinitions() {
		setIsRefreshingDefinitions(true)
		try {
			const response = await fetch("/api/provider/tax-fees/definitions")
			const body = await readJsonSafe(response)
			if (!response.ok) {
				throw new Error(
					readableApiError(
						body?.message || body?.error,
						"No se pudieron actualizar las definiciones"
					)
				)
			}
			const nextDefinitions = Array.isArray(body?.definitions) ? body.definitions : []
			const nextWarnings = Array.isArray(body?.warnings) ? body.warnings : []
			setDefinitions(nextDefinitions)
			setListWarnings(nextWarnings)
			props.onDefinitionsChange?.(nextDefinitions, nextWarnings)
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "No se pudieron actualizar las definiciones"
			)
		} finally {
			setIsRefreshingDefinitions(false)
		}
	}

	function resetWizard() {
		setStep(1)
		setDraft(initialDraft)
		setEditingDefinitionId(null)
		setDefinitionId(null)
		setPreviewResult(null)
		setPreviewWarnings([])
		setHasSuccessfulPreview(false)
		setErrorMessage(null)
		setSuccessMessage(null)
	}

	useEffect(() => {
		if (props.initialMode === "editing" && props.initialDefinitionId) {
			const definition = definitions.find((item) => item.id === props.initialDefinitionId)
			if (definition && editingDefinitionId !== definition.id) {
				startEdit(definition)
			}
		}
	}, [props.initialMode, props.initialDefinitionId, definitions, editingDefinitionId, definitionId])

	useEffect(() => {
		if (props.initialMode !== "creating" || !props.initialDuplicateDefinitionId) return
		const source = definitions.find((item) => item.id === props.initialDuplicateDefinitionId)
		if (!source) return
		const duplicate = mapDefinitionToDraft(source)
		setDraft({ ...duplicate, name: `Copia de ${source.name}`, code: "" })
		setStep(1)
	}, [props.initialMode, props.initialDuplicateDefinitionId, definitions])

	function changeScope(scope: ScopeType) {
		setDraft((current) => {
			const productId = current.productId
			return {
				...current,
				scope,
				productId,
				scopeId:
					scope === "provider"
						? props.initialResources.providerId
						: scope === "product"
							? productId
							: "",
			}
		})
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	function selectProduct(productId: string) {
		setDraft((current) => ({
			...current,
			productId,
			scopeId:
				current.scope === "product"
					? productId
					: current.scope === "provider"
						? props.initialResources.providerId
						: "",
		}))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	function selectVariant(variantId: string) {
		const variant = props.initialResources.variants.find((item) => item.id === variantId)
		setDraft((current) => ({
			...current,
			productId: variant?.productId ?? current.productId,
			scopeId: variantId,
		}))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	function selectRatePlan(ratePlanId: string) {
		const ratePlan = props.initialResources.ratePlans.find((item) => item.id === ratePlanId)
		setDraft((current) => ({
			...current,
			productId: ratePlan?.productId ?? current.productId,
			scopeId: ratePlanId,
		}))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	function selectKind(kind: TaxFeeKind) {
		setDraft((current) => ({
			...current,
			kind,
			presetKey: null,
			name: "",
			code: "",
			calculationType: null,
			value: "",
			currency: "USD",
			appliesPer: "stay",
			inclusionType: "excluded",
		}))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
		setStep(1)
	}

	function selectPreset(preset: Preset) {
		setDraft((current) => ({
			...current,
			presetKey: preset.key,
			name:
				preset.key === "CUSTOM"
					? current.name ||
						(current.kind === "tax" ? "Impuesto personalizado" : "Cargo personalizado")
					: preset.label,
			code: "",
			calculationType: preset.calculationType ?? current.calculationType,
			appliesPer: preset.appliesPer ?? current.appliesPer,
			inclusionType: preset.inclusionType ?? current.inclusionType,
			currency:
				(preset.calculationType ?? current.calculationType) === "fixed"
					? current.currency || "USD"
					: "",
		}))
		setErrorMessage(null)
		setSuccessMessage(null)
		invalidatePreview()
	}

	function setCalculationType(value: CalculationType) {
		updateDraft({
			calculationType: value,
			currency: value === "fixed" ? draft.currency || "USD" : "",
		})
	}

	function startEdit(definition: DefinitionSummary) {
		setEditingDefinitionId(definition.id)
		setDefinitionId(definition.id)
		setDraft(mapDefinitionToDraft(definition))
		setStep(1)
		setSuccessMessage(null)
		setErrorMessage(null)
		invalidatePreview()
	}

	async function persistDefinition(publicationMode: "draft" | "publish" | "schedule" = "draft") {
		setIsSavingDefinition(true)
		setErrorMessage(null)
		setSuccessMessage(null)
		try {
			const form = new FormData()
			const code = editingDefinitionId ? draft.code : buildDefinitionCode(draft)

			if (editingDefinitionId) form.set("id", editingDefinitionId)
			form.set("code", code)
			form.set("name", draft.name.trim())
			form.set("kind", draft.kind || "tax")
			form.set("calculationType", draft.calculationType || "percentage")
			form.set("value", draft.value)
			if (draft.calculationType === "fixed") form.set("currency", draft.currency)
			form.set("inclusionType", draft.inclusionType)
			form.set("appliesPer", draft.appliesPer)
			form.set("status", publicationMode === "draft" ? "archived" : "active")
			form.set("publicationMode", publicationMode)
			const jurisdictionJson = {
				...(draft.jurisdictionCountry.trim()
					? { country: draft.jurisdictionCountry.trim().toUpperCase() }
					: {}),
				collectionResponsibility: draft.collectionResponsibility,
				taxableBase: draft.taxableBase,
				exemptGuestResidenceCountries: draft.guestResidenceExempt
					.split(",")
					.map((country) => country.trim().toUpperCase())
					.filter(Boolean),
				...(Number(draft.maxAmount) > 0 ? { maxAmount: Number(draft.maxAmount) } : {}),
				...(Number(draft.maxNights) > 0 ? { maxNights: Number(draft.maxNights) } : {}),
				seasons:
					draft.seasonFrom && draft.seasonTo
						? [
								{
									from: draft.seasonFrom,
									to: draft.seasonTo,
									...(Number(draft.seasonValue) > 0 ? { value: Number(draft.seasonValue) } : {}),
								},
							]
						: [],
			}
			form.set("jurisdictionJson", JSON.stringify(jurisdictionJson))
			if (draft.effectiveFrom) form.set("effectiveFrom", draft.effectiveFrom)
			if (draft.effectiveTo) form.set("effectiveTo", draft.effectiveTo)

			const response = await fetch("/api/provider/tax-fees/definitions", {
				method: editingDefinitionId ? "PUT" : "POST",
				body: form,
			})
			const body = await readJsonSafe(response)
			if (!response.ok) {
				throw new Error(
					readableApiError(body?.message || body?.error, "No se pudo guardar la definición")
				)
			}

			const nextId = body?.id
			setDefinitionId(nextId)
			setEditingDefinitionId(nextId)
			setDraft((current) => ({ ...current, code }))
			setPreviewWarnings(Array.isArray(body?.warnings) ? body.warnings : [])
			await refreshDefinitions()
			setSuccessMessage(
				publicationMode === "draft"
					? "Borrador guardado. Ejecuta una simulación antes de publicar."
					: publicationMode === "schedule"
						? "Versión programada correctamente."
						: "Versión publicada correctamente."
			)
			setStep(5)
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la definición")
		} finally {
			setIsSavingDefinition(false)
		}
	}

	async function runPreview() {
		setIsPreviewLoading(true)
		setErrorMessage(null)
		setSuccessMessage(null)
		try {
			const form = new FormData()
			form.set("productId", draft.productId.trim())
			if (definitionId) form.set("taxFeeDefinitionId", definitionId)
			if (draft.scope === "variant") form.set("variantId", draft.scopeId.trim())
			if (draft.scope === "rate_plan") form.set("ratePlanId", draft.scopeId.trim())
			if (draft.channel.trim()) form.set("channel", draft.channel.trim())
			if (draft.jurisdictionCountry.trim()) form.set("country", draft.jurisdictionCountry.trim())
			form.set("base", draft.base || "100")
			form.set("checkIn", draft.checkIn)
			form.set("checkOut", draft.checkOut)
			form.set("adults", draft.adults || "2")
			form.set("children", draft.children || "0")

			const response = await fetch("/api/provider/tax-fees/preview", {
				method: "POST",
				body: form,
			})
			const body = await readJsonSafe(response)
			if (!response.ok) {
				throw new Error(
					readableApiError(body?.message || body?.error, "No se pudo ejecutar la vista previa")
				)
			}

			setPreviewResult(body)
			setPreviewWarnings(Array.isArray(body?.warnings) ? body.warnings : [])
			setHasSuccessfulPreview(true)
		} catch (error) {
			setHasSuccessfulPreview(false)
			setPreviewResult(null)
			setPreviewWarnings([])
			setErrorMessage(
				error instanceof Error ? error.message : "No se pudo ejecutar la vista previa"
			)
		} finally {
			setIsPreviewLoading(false)
		}
	}

	function nextStep() {
		if (!stepValid || step >= 5) return
		if (step === 4) {
			void persistDefinition("draft")
			return
		}
		setStep((current) => Math.min(current + 1, 5))
	}

	function previousStep() {
		setErrorMessage(null)
		setSuccessMessage(null)
		setStep((current) => Math.max(current - 1, 1))
	}

	return (
		<div className="space-y-8">
			<section className={showDefinitionsSidebar ? "grid gap-6 xl:grid-cols-[0.85fr_1.15fr]" : ""}>
				{showDefinitionsSidebar && (
					<Card as="aside">
						<div className="mb-4 flex items-center justify-between">
							<div>
								<p className="text-xs font-semibold text-slate-500 uppercase">Definiciones</p>
								<h2 className="mt-2 text-2xl font-semibold text-slate-950">
									Impuestos y cargos existentes
								</h2>
							</div>
							<Button
								type="button"
								onClick={() => {
									resetWizard()
									void refreshDefinitions()
								}}
								variant="secondary"
								size="sm"
							>
								{isRefreshingDefinitions ? "Actualizando..." : "Nueva definición"}
							</Button>
						</div>

						{listWarnings.length > 0 && (
							<Notice variant="warning" title="Requiere atención" className="mb-4">
								<div className="mt-3 space-y-3">
									{listWarningGroups.map((group) => (
										<div key={group.title}>
											<p className="font-medium">{group.title}</p>
											<ul className="mt-1 space-y-1">
												{group.items.map((warning, index) => (
													<li key={`${warning.code}-${index}`}>{warning.message}</li>
												))}
											</ul>
										</div>
									))}
								</div>
							</Notice>
						)}

						<div className="space-y-3">
							{definitions.length === 0 ? (
								<div className="fastt-empty-state rounded-[var(--fastt-radius-card)] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
									Aún no hay impuestos ni cargos configurados.
								</div>
							) : (
								definitions.map((definition) => (
									<div
										key={definition.id}
										className="fastt-row-card rounded-[var(--fastt-radius-card)] border border-slate-200 p-4"
									>
										<div className="flex items-start justify-between gap-4">
											<div>
												<Badge>{definition.kind === "tax" ? "Impuesto" : "Cargo"}</Badge>
												<h3 className="mt-2 text-lg font-semibold text-slate-950">
													{definition.name}
												</h3>
												<p className="mt-1 text-sm text-slate-600">{definition.code}</p>
											</div>
											<Button
												type="button"
												onClick={() => startEdit(definition)}
												variant="secondary"
												size="sm"
											>
												Editar
											</Button>
										</div>
										<p className="mt-3 text-sm text-slate-700">
											{definition.calculationType === "percentage"
												? `${definition.value}%`
												: `${definition.currency ?? "USD"} ${definition.value}`}{" "}
											·{" "}
											{
												APPLIES_PER_OPTIONS.find((item) => item.value === definition.appliesPer)
													?.label
											}
										</p>
									</div>
								))
							)}
						</div>
					</Card>
				)}

				<section>
					<div className="mb-6 flex flex-wrap gap-3">
						{STEP_LABELS.map((item) => {
							const active = item.id === step
							const complete = item.id < step
							return (
								<div
									key={item.id}
									className={[
										"flex items-center gap-2 border-b-2 px-2 py-2 text-sm",
										active
											? "border-slate-950 text-slate-950"
											: complete
												? "border-slate-400 text-slate-700"
												: "border-transparent text-slate-500",
									].join(" ")}
								>
									<span className="font-semibold">{item.id}</span>
									<span>{item.title}</span>
								</div>
							)
						})}
					</div>

					{errorMessage && (
						<Notice variant="error" className="mb-4">
							{errorMessage}
						</Notice>
					)}

					{successMessage && (
						<Notice variant="success" className="mb-4">
							{successMessage}
						</Notice>
					)}

					{props.initialSuggestion && !editingDefinitionId && (
						<Notice
							variant="warning"
							title={`Borrador sugerido: ${props.initialSuggestion.title}`}
							className="mb-4"
						>
							{props.initialSuggestion.reviewNote}
						</Notice>
					)}

					{previewWarnings.length > 0 && (
						<Notice variant="warning" title="Revisar antes de guardar" className="mb-4">
							<div className="mt-3 space-y-3">
								{warningGroups.map((group) => (
									<div key={group.title}>
										<p className="font-medium">{group.title}</p>
										<ul className="mt-1 space-y-1">
											{group.items.map((warning, index) => (
												<li key={`${warning.code}-${index}`}>{warning.message}</li>
											))}
										</ul>
									</div>
								))}
							</div>
						</Notice>
					)}

					{step === 1 && (
						<div className="space-y-4">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">¿Qué estás agregando?</h2>
								<p className="mt-2 text-sm text-slate-600">
									Comienza definiendo si es un impuesto legal/local o un cargo operativo.
								</p>
							</div>
							<div className="grid gap-4 md:grid-cols-2">
								{KIND_OPTIONS.map((option) => (
									<ChoiceCard
										key={option.value}
										selected={draft.kind === option.value}
										onClick={() => selectKind(option.value)}
									>
										<div className="text-base font-semibold text-slate-950">{option.label}</div>
										<p className="mt-2 text-sm text-slate-600">{option.description}</p>
									</ChoiceCard>
								))}
							</div>
							{draft.kind ? (
								<div className="border-t border-slate-200 pt-5">
									<p className="text-sm font-semibold text-slate-900">Configuración inicial</p>
									<div className="mt-3 grid gap-3 md:grid-cols-2">
										{filteredPresets.map((preset) => (
											<ChoiceCard
												key={preset.key}
												selected={draft.presetKey === preset.key}
												onClick={() => selectPreset(preset)}
											>
												<div className="text-sm font-semibold text-slate-950">{preset.label}</div>
												<p className="mt-1 text-sm text-slate-600">{preset.description}</p>
											</ChoiceCard>
										))}
									</div>
								</div>
							) : null}
						</div>
					)}

					{step === 2 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">Define el monto</h2>
								<p className="mt-2 text-sm text-slate-600">
									Ya completamos la configuración base para{" "}
									<strong className="font-semibold text-slate-900">
										{selectedPreset?.label ?? "este cargo"}
									</strong>
									. Normalmente solo necesitas confirmar el monto y cómo lo verá el huésped.
								</p>
							</div>

							<div className="space-y-3">
								<span className="text-sm font-medium text-slate-700">¿Cómo se calcula?</span>
								<div className="grid gap-3 md:grid-cols-2">
									{CALCULATION_OPTIONS.map((option) => (
										<ChoiceCard
											key={option.value}
											selected={draft.calculationType === option.value}
											onClick={() => setCalculationType(option.value)}
										>
											<div className="text-base font-semibold text-slate-950">
												{option.value === "percentage" ? "Porcentaje del precio" : "Monto fijo"}
											</div>
											<p className="mt-2 text-sm text-slate-600">{option.helper}</p>
										</ChoiceCard>
									))}
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">
										{draft.calculationType === "percentage" ? "Porcentaje" : "Monto del cargo"}
									</span>
									<Input
										type="number"
										min="0"
										step="0.01"
										value={draft.value}
										onChange={(event) => updateDraft({ value: event.target.value })}
										placeholder={draft.calculationType === "percentage" ? "10" : "25.00"}
									/>
								</label>

								{draft.calculationType === "fixed" && (
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Moneda</span>
										<Select
											value={draft.currency}
											onChange={(event) => updateDraft({ currency: event.target.value })}
										>
											<option value="USD">USD</option>
											<option value="EUR">EUR</option>
											<option value="CLP">CLP</option>
											<option value="ARS">ARS</option>
										</Select>
									</label>
								)}
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<span className="text-sm font-medium text-slate-700">
										¿Cómo debe verlo el huésped?
									</span>
									<div className="grid gap-3">
										{INCLUDED_OPTIONS.map((option) => (
											<ChoiceCard
												key={option.value}
												selected={draft.inclusionType === option.value}
												onClick={() => updateDraft({ inclusionType: option.value })}
											>
												<div className="text-base font-semibold text-slate-950">{option.label}</div>
												<p className="mt-2 text-sm text-slate-600">{option.helper}</p>
											</ChoiceCard>
										))}
									</div>
								</div>

								<div className="fastt-soft-box rounded-[var(--fastt-radius-card)] border border-slate-200 bg-slate-50 p-4">
									<p className="text-sm font-medium text-slate-700">Configuración actual</p>
									<dl className="mt-3 space-y-3 text-sm text-slate-700">
										<div className="flex items-center justify-between gap-4">
											<dt>Tipo</dt>
											<dd className="font-medium text-slate-950">
												{draft.kind === "tax" ? "Impuesto" : "Cargo"}
											</dd>
										</div>
										<div className="flex items-center justify-between gap-4">
											<dt>Preset</dt>
											<dd className="font-medium text-slate-950">
												{selectedPreset?.label ?? "Personalizado"}
											</dd>
										</div>
										<div className="flex items-center justify-between gap-4">
											<dt>Frecuencia</dt>
											<dd className="font-medium text-slate-950">
												{APPLIES_PER_OPTIONS.find((item) => item.value === draft.appliesPer)?.label}
											</dd>
										</div>
									</dl>
									<p className="mt-4 text-xs text-slate-500">
										Si necesitas cambiar la frecuencia, puedes ajustarla en el paso de revisión.
									</p>
								</div>
							</div>
						</div>
					)}

					{step === 3 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">Elige dónde se aplicará</h2>
								<p className="mt-2 text-sm text-slate-600">
									Selecciona recursos de tu catálogo. La regla se aplicará solo en el alcance que
									confirmes.
								</p>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								{SCOPE_OPTIONS.map((option) => (
									<ChoiceCard
										key={option.value}
										selected={draft.scope === option.value}
										onClick={() => changeScope(option.value)}
									>
										<div className="text-base font-semibold text-slate-950">{option.label}</div>
										<p className="mt-2 text-sm text-slate-600">{option.helper}</p>
									</ChoiceCard>
								))}
							</div>

							{props.initialResources.products.length === 0 ? (
								<Notice variant="warning" title="No hay recursos para asignar">
									Crea primero un alojamiento, tour o servicio. Luego podrás aplicar esta regla a
									sus tarifas.
								</Notice>
							) : (
								<div className="grid gap-4 md:grid-cols-2">
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">
											{draft.scope === "provider" ? "Producto para la vista previa" : "Producto"}
										</span>
										<Select
											value={draft.productId}
											onChange={(event) => selectProduct(event.target.value)}
										>
											<option value="">Selecciona un producto</option>
											{props.initialResources.products.map((product) => (
												<option key={product.id} value={product.id}>
													{product.label} · {product.kind}
												</option>
											))}
										</Select>
									</label>

									{(draft.scope === "variant" || draft.scope === "rate_plan") && (
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Unidad</span>
											<Select
												value={selectedVariantId}
												onChange={(event) => selectVariant(event.target.value)}
											>
												<option value="">Selecciona una unidad</option>
												{selectableVariants.map((variant) => (
													<option key={variant.id} value={variant.id}>
														{variant.label} · {variant.kind}
													</option>
												))}
											</Select>
										</label>
									)}

									{draft.scope === "rate_plan" && (
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Tarifa</span>
											<Select
												value={draft.scopeId}
												onChange={(event) => selectRatePlan(event.target.value)}
											>
												<option value="">Selecciona una tarifa</option>
												{selectableRatePlans.map((ratePlan) => (
													<option key={ratePlan.id} value={ratePlan.id}>
														{ratePlan.label}
													</option>
												))}
											</Select>
										</label>
									)}

									<label className="flex flex-col gap-2 md:col-span-2">
										<span className="text-sm font-medium text-slate-700">Canal de venta</span>
										<Select
											value={draft.channel}
											onChange={(event) => updateDraft({ channel: event.target.value })}
										>
											<option value="">Todos los canales</option>
											<option value="web">Sitio web Fastt</option>
										</Select>
										<p className="text-xs text-slate-500">
											Los canales externos se incorporarán cuando sus integraciones estén
											certificadas.
										</p>
									</label>
								</div>
							)}

							{draft.scope === "provider" && (
								<p className="fastt-soft-box rounded-[var(--fastt-radius-card)] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
									La regla se aplicará a toda la cuenta del proveedor. Elige un producto arriba para
									simular el precio antes de activarla.
								</p>
							)}
						</div>
					)}

					{step === 4 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">Detalles de revisión</h2>
								<p className="mt-2 text-sm text-slate-600">
									Ajusta estos campos solo si necesitas una regla más específica. Primero se guarda
									la definición y luego se ejecuta una vista previa real antes de asignar.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Nombre del cargo</span>
									<Input
										value={draft.name}
										onChange={(event) => updateDraft({ name: event.target.value, code: "" })}
									/>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">
										¿Con qué frecuencia aplica?
									</span>
									<Select
										value={draft.appliesPer}
										onChange={(event) =>
											updateDraft({ appliesPer: event.target.value as AppliesPer })
										}
									>
										{APPLIES_PER_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</Select>
									<p className="text-xs text-slate-500">
										La mayoría de presets ya define esto correctamente. Cámbialo solo si tu cargo
										funciona distinto.
									</p>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Vigente desde opcional</span>
									<Input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.effectiveFrom}
										onChange={(event) => updateDraft({ effectiveFrom: event.target.value })}
									/>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Vigente hasta opcional</span>
									<Input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.effectiveTo}
										onChange={(event) => updateDraft({ effectiveTo: event.target.value })}
									/>
								</label>
							</div>

							<div className="border-t border-slate-200 pt-5">
								<p className="text-sm font-semibold text-slate-900">Regla fiscal avanzada</p>
								<p className="mt-1 text-sm text-slate-600">
									Configura solo los límites que correspondan a tu obligación local.
								</p>
								<div className="mt-4 grid gap-4 md:grid-cols-2">
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">País de jurisdicción</span>
										<Input
											placeholder="CL"
											maxLength={2}
											value={draft.jurisdictionCountry}
											onChange={(event) => updateDraft({ jurisdictionCountry: event.target.value })}
										/>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">
											Responsable de recaudar
										</span>
										<Select
											value={draft.collectionResponsibility}
											onChange={(event) =>
												updateDraft({
													collectionResponsibility: event.target.value as CollectionResponsibility,
												})
											}
										>
											<option value="provider">Proveedor</option>
											<option value="platform">Plataforma</option>
											<option value="marketplace">Marketplace</option>
										</Select>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Tope por reserva</span>
										<Input
											type="number"
											min="0"
											step="0.01"
											value={draft.maxAmount}
											onChange={(event) => updateDraft({ maxAmount: event.target.value })}
										/>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">
											Máximo de noches cobrables
										</span>
										<Input
											type="number"
											min="0"
											step="1"
											value={draft.maxNights}
											onChange={(event) => updateDraft({ maxNights: event.target.value })}
										/>
									</label>
									<label className="flex flex-col gap-2 md:col-span-2">
										<span className="text-sm font-medium text-slate-700">
											Excepción por residencia
										</span>
										<Input
											placeholder="CL, AR"
											value={draft.guestResidenceExempt}
											onChange={(event) =>
												updateDraft({ guestResidenceExempt: event.target.value })
											}
										/>
										<p className="text-xs text-slate-500">
											Códigos de país de huéspedes exentos, separados por coma.
										</p>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Temporada desde</span>
										<Input
											placeholder="AAAA-MM-DD"
											value={draft.seasonFrom}
											onChange={(event) => updateDraft({ seasonFrom: event.target.value })}
										/>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Temporada hasta</span>
										<Input
											placeholder="AAAA-MM-DD"
											value={draft.seasonTo}
											onChange={(event) => updateDraft({ seasonTo: event.target.value })}
										/>
									</label>
								</div>
							</div>

							<div className="fastt-soft-box rounded-[var(--fastt-radius-card)] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
								<p className="font-medium text-slate-900">
									Los campos internos se gestionan automáticamente
								</p>
								<p className="mt-1">
									El código y la prioridad se generan internamente. Solo confirma cómo debe ver el
									huésped este cargo.
								</p>
							</div>
						</div>
					)}

					{step === 5 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">
									Ejecuta una vista previa real
								</h2>
								<p className="mt-2 text-sm text-slate-600">
									La simulación usa el cálculo real y la definición actual, incluso antes de
									publicarla en un alcance.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Monto base</span>
									<Input
										type="number"
										step="0.01"
										value={draft.base}
										onChange={(event) => updateDraft({ base: event.target.value })}
									/>
								</label>
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Ingreso</span>
									<Input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.checkIn}
										onChange={(event) => updateDraft({ checkIn: event.target.value })}
									/>
								</label>
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-slate-700">Salida</span>
									<Input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.checkOut}
										onChange={(event) => updateDraft({ checkOut: event.target.value })}
									/>
								</label>
								<div className="grid gap-4 sm:grid-cols-2">
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Adultos</span>
										<Input
											type="number"
											min="0"
											value={draft.adults}
											onChange={(event) => updateDraft({ adults: event.target.value })}
										/>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">Niños</span>
										<Input
											type="number"
											min="0"
											value={draft.children}
											onChange={(event) => updateDraft({ children: event.target.value })}
										/>
									</label>
								</div>
							</div>

							<div className="flex flex-wrap gap-3">
								<Button
									type="button"
									onClick={() => void runPreview()}
									disabled={isPreviewLoading || !definitionId || !draft.productId.trim()}
								>
									{isPreviewLoading ? "Ejecutando..." : "Ejecutar vista previa"}
								</Button>
								{editingDefinitionId && (
									<Badge variant="neutral" className="px-4 py-2 text-sm">
										Modo edición: se actualiza la definición. La asignación se gestiona por
										separado.
									</Badge>
								)}
							</div>
							<div className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
								<p className="font-semibold text-slate-950">Cambios por publicar</p>
								<p className="mt-1">
									{changedFields.join(" · ")}. Se generará una versión inmutable al publicar.
								</p>
							</div>

							{previewResult && (
								<div className="fastt-soft-box space-y-4 rounded-[var(--fastt-radius-card)] border border-slate-200 bg-slate-50 p-5">
									<p className="text-xs font-medium text-slate-500">
										Contexto: {draft.scope === "provider" ? "Toda la cuenta" : draft.scope}
										{draft.channel.trim() ? ` · ${draft.channel.trim()}` : " · web"}
									</p>
									<div className="rounded-[var(--fastt-radius-card)] bg-white p-4">
										<p className="text-sm font-medium text-slate-700">Precio</p>
										<p className="mt-1 text-2xl font-semibold text-slate-950">
											{formatMoney(previewResult.breakdown.base, previewCurrency)}
										</p>
										<div className="mt-3 flex flex-wrap gap-2">
											{previewResult.flags.hasIncluded && (
												<Badge variant="success">Incluye cargos</Badge>
											)}
											{previewResult.flags.hasExcluded && (
												<Badge variant="warning">Cargos adicionales al confirmar</Badge>
											)}
										</div>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<h3 className="text-sm font-semibold text-slate-900">
												Incluidos en el precio
											</h3>
											<ul className="mt-2 space-y-2 text-sm text-slate-700">
												{includedLines.length === 0 ? (
													<li className="rounded-[var(--fastt-radius-card)] bg-white px-3 py-2">
														No hay cargos incluidos adicionales.
													</li>
												) : (
													includedLines.map((line, index) => (
														<li
															key={`${line.code}-included-${index}`}
															className="flex items-center justify-between gap-4 rounded-[var(--fastt-radius-card)] bg-white px-3 py-2"
														>
															<div>
																<p className="font-medium text-slate-900">{line.name}</p>
																<p className="text-xs text-slate-500">
																	{
																		APPLIES_PER_OPTIONS.find(
																			(item) => item.value === line.appliesPer
																		)?.label
																	}
																</p>
															</div>
															<strong>
																{formatMoney(line.amount, line.currency ?? previewCurrency)}
															</strong>
														</li>
													))
												)}
											</ul>
										</div>
										<div>
											<h3 className="text-sm font-semibold text-slate-900">Cargos adicionales</h3>
											<ul className="mt-2 space-y-2 text-sm text-slate-700">
												{excludedLines.length === 0 ? (
													<li className="rounded-[var(--fastt-radius-card)] bg-white px-3 py-2">
														No se agregarán cargos extra después.
													</li>
												) : (
													excludedLines.map((line, index) => (
														<li
															key={`${line.code}-excluded-${index}`}
															className="flex items-center justify-between gap-4 rounded-[var(--fastt-radius-card)] bg-white px-3 py-2"
														>
															<div>
																<p className="font-medium text-slate-900">{line.name}</p>
																<p className="text-xs text-slate-500">
																	{
																		APPLIES_PER_OPTIONS.find(
																			(item) => item.value === line.appliesPer
																		)?.label
																	}
																</p>
															</div>
															<strong>
																{formatMoney(line.amount, line.currency ?? previewCurrency)}
															</strong>
														</li>
													))
												)}
											</ul>
										</div>
									</div>

									<div className="rounded-[var(--fastt-radius-card)] bg-white p-4">
										<p className="text-sm font-medium text-slate-700">Total</p>
										<p className="mt-1 text-2xl font-semibold text-slate-950">
											{formatMoney(previewResult.total, previewCurrency)}
										</p>
									</div>
								</div>
							)}
						</div>
					)}

					<div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
						<div className="flex gap-3">
							<Button
								type="button"
								onClick={previousStep}
								disabled={step === 1 || isSavingDefinition || isPreviewLoading}
								variant="secondary"
							>
								Volver
							</Button>
							<Button
								type="button"
								onClick={() => {
									if (
										!window.confirm("Se descartarán los cambios sin publicar. ¿Quieres continuar?")
									)
										return
									resetWizard()
									props.onCancel?.()
								}}
								disabled={isSavingDefinition || isPreviewLoading}
								variant="secondary"
							>
								Reiniciar
							</Button>
						</div>

						<div className="flex gap-3">
							{step < 5 && (
								<Button
									type="button"
									onClick={nextStep}
									disabled={!stepValid || isSavingDefinition}
								>
									{step === 4
										? isSavingDefinition
											? "Guardando..."
											: "Guardar borrador y revisar"
										: "Siguiente"}
								</Button>
							)}

							{step === 5 && (
								<>
									<Button
										type="button"
										onClick={() => void persistDefinition("publish")}
										disabled={!hasSuccessfulPreview || isSavingDefinition}
										variant="success"
									>
										{isSavingDefinition ? "Publicando..." : "Publicar ahora"}
									</Button>
									<Button
										type="button"
										onClick={() => void persistDefinition("schedule")}
										disabled={!hasSuccessfulPreview || isSavingDefinition || !draft.effectiveFrom}
										variant="secondary"
									>
										Programar
									</Button>
								</>
							)}
						</div>
					</div>
				</section>
			</section>
		</div>
	)
}
