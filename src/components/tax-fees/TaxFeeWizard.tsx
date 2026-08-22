import { useEffect, useMemo, useState } from "react"

import {
	Badge,
	Button,
	Card,
	Checkbox,
	ChoiceCard,
	DrawerFact,
	Input,
	Notice,
	Select,
} from "../ui-react"
import { fiscalIcons } from "./fiscal-icons"

type TaxFeeKind = "tax" | "fee"
type CalculationType = "percentage" | "fixed"
type AppliesPer = "stay" | "night" | "guest" | "guest_night"
type InclusionType = "included" | "excluded"
type ScopeType = "product" | "variant" | "rate_plan" | "provider"
type CollectionResponsibility = "provider" | "platform" | "marketplace"
type ApplicationPeriod = "always" | "from" | "range"

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
	definitionId: string
	code: string
	name: string
	amount: number
	currency: string | null
	inclusionType: InclusionType
	appliesPer: AppliesPer
	collectionResponsibility: CollectionResponsibility
	source: { scope: string; scopeId: string | null }
}

type PreviewResult = {
	quote: {
		quoteId: string
		issuedAt: string
		currency: string
		baseAmount: number
		totalAmount: number
		nights: number
		context: {
			productId: string
			variantId: string
			ratePlanId: string
			checkIn: string
			checkOut: string
			rooms: number
			occupancy: { adults: number; children: number; infants: number }
			channel: string
		}
		pricing: { source: "v2" | "materialized_search_view" | "legacy" }
	}
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
	context?: {
		productId: string
		variantId: string | null
		ratePlanId: string | null
		channel: string
	}
}

type SimulationCertificate = {
	isCurrent: boolean
	quoteId: string | null
	issuedAt: string | null
	context: { productId: string | null; ratePlanId: string | null; channel: string | null } | null
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
	onDraftSaved?: (definition: { id: string; name: string }) => void
	onResumeEditing?: () => void
	initialSuggestion?: TaxFeeSuggestedDraft | null
	initialReview?: boolean
}

type PublicationCompletion = {
	definitionId: string
	version: number
	publicationState: "published" | "scheduled"
	hasActiveAssignments: boolean
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
	applicationPeriod: ApplicationPeriod
	effectiveFrom: string
	effectiveTo: string
	jurisdictionCountry: string
	showSpecialConditions: boolean
	hasResidenceExemption: boolean
	hasMaxAmount: boolean
	hasMaxNights: boolean
	hasSeasonalOverride: boolean
	guestResidenceExempt: string
	collectionResponsibility: CollectionResponsibility
	taxableBase: "booking_base" | "base_plus_included"
	maxAmount: string
	maxNights: string
	seasonFrom: string
	seasonTo: string
	seasonValue: string
	base: string
	rooms: string
	guestResidenceCountry: string
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
	{ id: 1, title: "Tipo y nombre" },
	{ id: 2, title: "Cálculo" },
	{ id: 3, title: "Jurisdicción y condiciones" },
	{ id: 4, title: "Revisar y guardar" },
]

const JURISDICTION_OPTIONS = [
	{ value: "AR", label: "Argentina" },
	{ value: "BO", label: "Bolivia" },
	{ value: "BR", label: "Brasil" },
	{ value: "CL", label: "Chile" },
	{ value: "CO", label: "Colombia" },
	{ value: "CR", label: "Costa Rica" },
	{ value: "EC", label: "Ecuador" },
	{ value: "ES", label: "España" },
	{ value: "MX", label: "México" },
	{ value: "PA", label: "Panamá" },
	{ value: "PE", label: "Perú" },
	{ value: "PY", label: "Paraguay" },
	{ value: "US", label: "Estados Unidos" },
	{ value: "UY", label: "Uruguay" },
]

const CREATION_DRAFT_STORAGE_KEY = "fastt:fiscal-definition-draft:v1"

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
	applicationPeriod: "always",
	effectiveFrom: "",
	effectiveTo: "",
	jurisdictionCountry: "",
	showSpecialConditions: false,
	hasResidenceExemption: false,
	hasMaxAmount: false,
	hasMaxNights: false,
	hasSeasonalOverride: false,
	guestResidenceExempt: "",
	collectionResponsibility: "provider",
	taxableBase: "booking_base",
	maxAmount: "",
	maxNights: "",
	seasonFrom: "",
	seasonTo: "",
	seasonValue: "",
	base: "100",
	rooms: "1",
	guestResidenceCountry: "",
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
	return sanitizeCode(presetBase) || "CUSTOM_TAX_FEE"
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

function formatDateForSummary(value: string) {
	if (!value) return ""
	const [year, month, day] = value.split("-").map(Number)
	if (!year || !month || !day) return value
	return new Intl.DateTimeFormat("es-CL", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year, month - 1, day)))
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
		applicationPeriod:
			definition.effectiveFrom && definition.effectiveTo
				? "range"
				: definition.effectiveFrom
					? "from"
					: "always",
		effectiveFrom: formatDateForInput(definition.effectiveFrom),
		effectiveTo: formatDateForInput(definition.effectiveTo),
		jurisdictionCountry: String(rule.country ?? ""),
		showSpecialConditions: Boolean(
			(Array.isArray(rule.exemptGuestResidenceCountries) &&
				rule.exemptGuestResidenceCountries.length) ||
			rule.maxAmount != null ||
			rule.maxNights != null ||
			seasons.length
		),
		hasResidenceExemption: Boolean(
			Array.isArray(rule.exemptGuestResidenceCountries) && rule.exemptGuestResidenceCountries.length
		),
		hasMaxAmount: rule.maxAmount != null,
		hasMaxNights: rule.maxNights != null,
		hasSeasonalOverride: seasons.length > 0,
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
	return new Date(from).getTime() <= new Date(to).getTime()
}

function hasValidApplicationPeriod(draft: DraftState) {
	if (draft.applicationPeriod === "always") return true
	if (!draft.effectiveFrom) return false
	return draft.applicationPeriod === "from" || Boolean(draft.effectiveTo)
}

function hasValidSpecialConditions(draft: DraftState) {
	if (draft.hasResidenceExemption && !draft.guestResidenceExempt.trim()) return false
	if (draft.hasMaxAmount && Number(draft.maxAmount) <= 0) return false
	if (draft.hasMaxNights && Number(draft.maxNights) <= 0) return false
	if (!draft.hasSeasonalOverride) return true
	if (!draft.seasonFrom || !draft.seasonTo || Number(draft.seasonValue) <= 0) return false
	if (!isValidDateRange(draft.seasonFrom, draft.seasonTo)) return false
	if (draft.effectiveFrom && draft.seasonFrom < draft.effectiveFrom) return false
	if (
		draft.applicationPeriod === "range" &&
		draft.effectiveTo &&
		draft.seasonTo > draft.effectiveTo
	)
		return false
	return true
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
	const [baselineDefinition, setBaselineDefinition] = useState<DefinitionSummary | null>(null)
	const [technicalOpen, setTechnicalOpen] = useState(false)
	const [publicationIntent, setPublicationIntent] = useState<"publish" | "schedule" | null>(null)
	const [simulationVariantId, setSimulationVariantId] = useState("")
	const [simulationRatePlanId, setSimulationRatePlanId] = useState("")
	const [simulationCertificate, setSimulationCertificate] = useState<SimulationCertificate | null>(
		null
	)
	const [isCheckingSimulation, setIsCheckingSimulation] = useState(false)
	const [savedDraftId, setSavedDraftId] = useState<string | null>(null)
	const [publicationCompletion, setPublicationCompletion] = useState<PublicationCompletion | null>(
		null
	)
	const [storageReady, setStorageReady] = useState(false)
	const [recoveredProgress, setRecoveredProgress] = useState(false)

	const filteredPresets = useMemo(() => {
		if (!draft.kind) return []
		return PRESETS.filter((preset) => preset.kind === draft.kind || preset.kind === "both")
	}, [draft.kind])

	const selectedPreset = useMemo(
		() => filteredPresets.find((preset) => preset.key === draft.presetKey) ?? null,
		[filteredPresets, draft.presetKey]
	)
	const applicationSummary = useMemo(() => {
		if (draft.applicationPeriod === "from" && draft.effectiveFrom)
			return `Se aplicará a las entradas desde el ${formatDateForSummary(draft.effectiveFrom)}.`
		if (draft.applicationPeriod === "range" && draft.effectiveFrom && draft.effectiveTo)
			return `Se aplicará a las entradas entre el ${formatDateForSummary(draft.effectiveFrom)} y el ${formatDateForSummary(draft.effectiveTo)}.`
		return "Se aplicará a todas las entradas, sin fecha de finalización."
	}, [draft.applicationPeriod, draft.effectiveFrom, draft.effectiveTo])
	const jurisdictionLabel = useMemo(
		() =>
			JURISDICTION_OPTIONS.find((country) => country.value === draft.jurisdictionCountry)?.label ??
			draft.jurisdictionCountry,
		[draft.jurisdictionCountry]
	)
	const potentialDuplicates = useMemo(() => {
		const normalizedName = draft.name.trim().toLocaleLowerCase("es")
		if (!normalizedName || !draft.kind || !draft.calculationType) return []
		return definitions.filter((definition) => {
			if (definition.id === editingDefinitionId) return false
			const rule =
				definition.jurisdictionJson && typeof definition.jurisdictionJson === "object"
					? (definition.jurisdictionJson as Record<string, unknown>)
					: {}
			return (
				definition.name.trim().toLocaleLowerCase("es") === normalizedName &&
				definition.kind === draft.kind &&
				definition.calculationType === draft.calculationType &&
				definition.value === Number(draft.value) &&
				String(rule.country ?? "").toUpperCase() === draft.jurisdictionCountry.toUpperCase()
			)
		})
	}, [definitions, draft, editingDefinitionId])

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
				(ratePlan) =>
					ratePlan.variantId === (simulationVariantId || selectedVariantId) && ratePlan.isActive
			),
		[props.initialResources.ratePlans, selectedVariantId, simulationVariantId]
	)
	const changedFields = useMemo(() => {
		const current = baselineDefinition
		if (!current) return ["Primera publicación"]
		const changes: string[] = []
		if (current.name !== draft.name) changes.push("nombre")
		if (current.value !== Number(draft.value)) changes.push("monto")
		if (current.appliesPer !== draft.appliesPer) changes.push("frecuencia")
		if (current.inclusionType !== draft.inclusionType) changes.push("presentación al huésped")
		if (
			formatDateForInput(current.effectiveFrom) !== draft.effectiveFrom ||
			formatDateForInput(current.effectiveTo) !== draft.effectiveTo
		)
			changes.push("periodo de aplicación")
		const rule =
			current.jurisdictionJson && typeof current.jurisdictionJson === "object"
				? (current.jurisdictionJson as Record<string, unknown>)
				: {}
		if (String(rule.country ?? "") !== draft.jurisdictionCountry.toUpperCase())
			changes.push("jurisdicción")
		if (String(rule.collectionResponsibility ?? "provider") !== draft.collectionResponsibility)
			changes.push("responsable de cobro")
		if (
			JSON.stringify(rule.exemptGuestResidenceCountries ?? []) !==
			JSON.stringify(
				draft.guestResidenceExempt
					.split(",")
					.map((country) => country.trim().toUpperCase())
					.filter(Boolean)
			)
		)
			changes.push("exenciones")
		if (Number(rule.maxAmount ?? 0) !== (draft.hasMaxAmount ? Number(draft.maxAmount || 0) : 0))
			changes.push("tope por reserva")
		if (Number(rule.maxNights ?? 0) !== (draft.hasMaxNights ? Number(draft.maxNights || 0) : 0))
			changes.push("límite de noches")
		return changes.length ? changes : ["Sin cambios materiales"]
	}, [baselineDefinition, draft])

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

	useEffect(() => {
		if (
			props.initialMode !== "creating" ||
			props.initialSuggestion ||
			props.initialDuplicateDefinitionId
		) {
			setStorageReady(true)
			return
		}
		try {
			const stored = window.sessionStorage.getItem(CREATION_DRAFT_STORAGE_KEY)
			if (stored) {
				const parsed = JSON.parse(stored) as { draft?: Partial<DraftState>; step?: number }
				if (parsed.draft && typeof parsed.draft === "object") {
					setDraft({ ...initialDraft, ...parsed.draft })
					setStep(Math.min(Math.max(Number(parsed.step) || 1, 1), 4))
					setRecoveredProgress(true)
				}
			}
		} catch {
			window.sessionStorage.removeItem(CREATION_DRAFT_STORAGE_KEY)
		} finally {
			setStorageReady(true)
		}
	}, [props.initialDuplicateDefinitionId, props.initialMode, props.initialSuggestion])

	useEffect(() => {
		if (
			!storageReady ||
			props.initialMode !== "creating" ||
			props.initialSuggestion ||
			props.initialDuplicateDefinitionId ||
			savedDraftId ||
			step > 4
		)
			return
		const hasMeaningfulProgress = Boolean(
			draft.kind ||
			draft.presetKey ||
			draft.name.trim() ||
			draft.value.trim() ||
			draft.jurisdictionCountry.trim()
		)
		if (!hasMeaningfulProgress) {
			window.sessionStorage.removeItem(CREATION_DRAFT_STORAGE_KEY)
			return
		}
		window.sessionStorage.setItem(
			CREATION_DRAFT_STORAGE_KEY,
			JSON.stringify({ draft, step, updatedAt: new Date().toISOString() })
		)
	}, [
		draft,
		props.initialDuplicateDefinitionId,
		props.initialMode,
		props.initialSuggestion,
		savedDraftId,
		step,
		storageReady,
	])

	const stepValid =
		step === 1
			? !!draft.kind && !!draft.presetKey && draft.name.trim().length > 0
			: step === 2
				? draft.calculationType !== null &&
					Number(draft.value) > 0 &&
					(draft.calculationType === "percentage" || draft.currency.trim().length > 0)
				: step === 3
					? draft.jurisdictionCountry.trim().length === 2 &&
						hasValidApplicationPeriod(draft) &&
						isValidDateRange(draft.effectiveFrom, draft.effectiveTo) &&
						hasValidSpecialConditions(draft)
					: step === 4
						? draft.name.trim().length > 0 &&
							draft.jurisdictionCountry.trim().length === 2 &&
							hasValidApplicationPeriod(draft) &&
							hasValidSpecialConditions(draft)
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

	function setApplicationPeriod(applicationPeriod: ApplicationPeriod) {
		updateDraft({
			applicationPeriod,
			effectiveFrom: applicationPeriod === "always" ? "" : draft.effectiveFrom,
			effectiveTo: applicationPeriod === "range" ? draft.effectiveTo : "",
		})
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
			return nextDefinitions as DefinitionSummary[]
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
		setSavedDraftId(null)
		setRecoveredProgress(false)
		setEditingDefinitionId(null)
		setDefinitionId(null)
		setPreviewResult(null)
		setPreviewWarnings([])
		setHasSuccessfulPreview(false)
		setErrorMessage(null)
		setSuccessMessage(null)
		setBaselineDefinition(null)
		setPublicationIntent(null)
		setPublicationCompletion(null)
		setSimulationVariantId("")
		setSimulationRatePlanId("")
		setSimulationCertificate(null)
		if (typeof window !== "undefined") window.sessionStorage.removeItem(CREATION_DRAFT_STORAGE_KEY)
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
		setSavedDraftId(null)
		setEditingDefinitionId(definition.id)
		setDefinitionId(definition.id)
		setDraft(mapDefinitionToDraft(definition))
		setBaselineDefinition(definition.currentVersion ? definition : null)
		setSimulationVariantId("")
		setSimulationRatePlanId("")
		setStep(props.initialReview ? 5 : 1)
		setSuccessMessage(null)
		setErrorMessage(null)
		invalidatePreview()
	}

	useEffect(() => {
		if (step !== 5 || !definitionId) {
			setSimulationCertificate(null)
			return
		}
		let cancelled = false
		setIsCheckingSimulation(true)
		void fetch(
			`/api/provider/tax-fees/simulation-certification?definitionId=${encodeURIComponent(definitionId)}`
		)
			.then(readJsonSafe)
			.then((result) => {
				if (!cancelled) setSimulationCertificate(result as SimulationCertificate)
			})
			.catch(() => {
				if (!cancelled) setSimulationCertificate(null)
			})
			.finally(() => {
				if (!cancelled) setIsCheckingSimulation(false)
			})
		return () => {
			cancelled = true
		}
	}, [definitionId, step])

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
				...(draft.hasMaxAmount && Number(draft.maxAmount) > 0
					? { maxAmount: Number(draft.maxAmount) }
					: {}),
				...(draft.hasMaxNights && Number(draft.maxNights) > 0
					? { maxNights: Number(draft.maxNights) }
					: {}),
				...(draft.hasSeasonalOverride ? { seasonalMode: "override" as const } : {}),
				seasons:
					draft.hasSeasonalOverride && draft.seasonFrom && draft.seasonTo
						? [
								{
									from: draft.seasonFrom,
									to: draft.seasonTo,
									value: Number(draft.seasonValue),
								},
							]
						: [],
			}
			form.set("jurisdictionJson", JSON.stringify(jurisdictionJson))
			if (draft.applicationPeriod !== "always" && draft.effectiveFrom)
				form.set("effectiveFrom", draft.effectiveFrom)
			if (draft.applicationPeriod === "range" && draft.effectiveTo)
				form.set("effectiveTo", draft.effectiveTo)

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
			const refreshedDefinitions = await refreshDefinitions()
			if (publicationMode === "draft") {
				setSuccessMessage("La definición se guardó como borrador.")
				setSavedDraftId(nextId)
				setRecoveredProgress(false)
				window.sessionStorage.removeItem(CREATION_DRAFT_STORAGE_KEY)
				props.onDraftSaved?.({ id: nextId, name: draft.name.trim() })
			} else {
				const refreshedDefinition = refreshedDefinitions?.find(
					(definition) => definition.id === nextId
				)
				setPublicationCompletion({
					definitionId: nextId,
					version: Number(body?.publication?.version ?? refreshedDefinition?.revision ?? 1),
					publicationState: publicationMode === "schedule" ? "scheduled" : "published",
					hasActiveAssignments: Boolean(
						refreshedDefinition?.assignments?.some((assignment) => assignment.status === "active")
					),
				})
				setStep(5)
			}
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
			if (simulationVariantId || draft.scope === "variant")
				form.set("variantId", simulationVariantId || draft.scopeId.trim())
			if (simulationRatePlanId || draft.scope === "rate_plan")
				form.set("ratePlanId", simulationRatePlanId || draft.scopeId.trim())
			if (draft.channel.trim()) form.set("channel", draft.channel.trim())
			if (draft.jurisdictionCountry.trim()) form.set("country", draft.jurisdictionCountry.trim())
			if (draft.guestResidenceCountry.trim())
				form.set("guestResidenceCountry", draft.guestResidenceCountry.trim())
			form.set("base", draft.base || "100")
			form.set("rooms", draft.rooms || "1")
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
			setTechnicalOpen(false)
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

	function confirmPublication(intent: "publish" | "schedule") {
		if (!simulationCertificate?.isCurrent || isSavingDefinition) return
		setPublicationIntent(intent)
	}

	function finishPublication() {
		if (!publicationIntent) return
		const intent = publicationIntent
		setPublicationIntent(null)
		void persistDefinition(intent)
	}

	function nextStep() {
		if (!stepValid || step >= 5) return
		if (step === 4) {
			void persistDefinition("draft")
			return
		}
		setStep((current) => Math.min(current + 1, 4))
	}

	function previousStep() {
		setErrorMessage(null)
		setSuccessMessage(null)
		setStep((current) => Math.max(current - 1, 1))
	}

	if (publicationCompletion) {
		const assignmentsSearch = new URLSearchParams({
			definitionId: publicationCompletion.definitionId,
		})
		if (draft.productId) assignmentsSearch.set("scope", draft.productId)
		if (draft.scope !== "provider" && draft.scopeId) {
			assignmentsSearch.set("targetScope", draft.scope)
			assignmentsSearch.set("targetId", draft.scopeId)
		}
		const assignmentsHref = `/provider/settings/tax-fees/assignments?${assignmentsSearch.toString()}`
		const published = publicationCompletion.publicationState === "published"
		return (
			<section className="mx-auto max-w-3xl py-2">
				<div className="border-b border-slate-200 pb-6">
					<p className="text-sm font-semibold text-emerald-700">
						{published ? "Versión publicada" : "Versión programada"}
					</p>
					<h2 className="mt-2 text-2xl font-semibold text-slate-950">
						{draft.name} · versión {publicationCompletion.version}
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
						{published
							? "La versión quedó disponible para usarse en nuevas coberturas."
							: "La versión se activará en la fecha programada."}
					</p>
				</div>

				<ol
					className="grid gap-3 border-b border-slate-200 py-5 sm:grid-cols-3"
					aria-label="Progreso de publicación"
				>
					<li className="flex items-start gap-3 text-emerald-800">
						<span
							className="fastt-drawer-fact__icon bg-emerald-50 text-emerald-700"
							aria-hidden="true"
						>
							{fiscalIcons.shield}
						</span>
						<div className="min-w-0">
							<p className="text-sm font-semibold">Definición certificada</p>
							<p className="mt-0.5 text-xs leading-5 text-emerald-800/80">
								El cálculo ya está comprobado.
							</p>
						</div>
					</li>
					<li className="flex items-start gap-3 text-emerald-800">
						<span
							className="fastt-drawer-fact__icon bg-emerald-50 text-emerald-700"
							aria-hidden="true"
						>
							{fiscalIcons.file}
						</span>
						<div className="min-w-0">
							<p className="text-sm font-semibold">Versión publicada</p>
							<p className="mt-0.5 text-xs leading-5 text-emerald-800/80">
								Ya se puede usar en coberturas.
							</p>
						</div>
					</li>
					<li
						className={
							publicationCompletion.hasActiveAssignments
								? "flex items-start gap-3 text-emerald-800"
								: "flex items-start gap-3 text-slate-800"
						}
					>
						<span
							className={
								publicationCompletion.hasActiveAssignments
									? "fastt-drawer-fact__icon bg-emerald-50 text-emerald-700"
									: "fastt-drawer-fact__icon"
							}
							aria-hidden="true"
						>
							{fiscalIcons.link}
						</span>
						<div className="min-w-0">
							<p className="text-sm font-semibold">
								{publicationCompletion.hasActiveAssignments
									? "Cobertura activa"
									: "Asignar cobertura"}
							</p>
							<p
								className={
									publicationCompletion.hasActiveAssignments
										? "mt-0.5 text-xs leading-5 text-emerald-800/80"
										: "mt-0.5 text-xs leading-5 text-slate-500"
								}
							>
								{publicationCompletion.hasActiveAssignments
									? "La regla ya cobra en al menos un alcance."
									: "Elige dónde debe cobrarse."}
							</p>
						</div>
					</li>
				</ol>

				<section className="fastt-drawer-section my-6 p-5" aria-labelledby="publication-next-step">
					<p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
						Siguiente paso
					</p>
					<h3 id="publication-next-step" className="mt-1 text-xl font-semibold text-slate-950">
						{publicationCompletion.hasActiveAssignments
							? "Revisa dónde se aplica esta versión"
							: "Asigna la regla a la cobertura de venta"}
					</h3>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
						{publicationCompletion.hasActiveAssignments
							? "Puedes revisar las propiedades, unidades, tarifas y canales que ya utilizan esta regla."
							: "Publicar no aplica la regla automáticamente. Selecciona los productos, unidades o tarifas donde debe cobrarse."}
					</p>

					<div className="fastt-drawer-facts mt-5">
						<DrawerFact title="No se cobra sola" icon={fiscalIcons.info}>
							Publicar deja la versión lista, pero no la activa en una venta hasta asignarla.
						</DrawerFact>
						<DrawerFact title="Elige el alcance" icon={fiscalIcons.link}>
							Puedes asignarla a productos, unidades o tarifas. Al abrir cobertura, esta regla ya
							queda seleccionada.
						</DrawerFact>
					</div>

					<div className="mt-5 flex flex-wrap items-center gap-3">
						<Button href={assignmentsHref}>
							{fiscalIcons.arrow}
							{publicationCompletion.hasActiveAssignments
								? "Ver asignaciones"
								: "Asignar esta regla"}
						</Button>
						<span className="text-xs leading-5 text-slate-500">
							La regla ya está seleccionada al abrir la cobertura.
						</span>
					</div>
				</section>
			</section>
		)
	}

	if (savedDraftId) {
		const simulatorHref = `/provider/settings/tax-fees/simulator?definitionId=${encodeURIComponent(savedDraftId)}&returnTo=${encodeURIComponent(`/provider/settings/tax-fees?edit=${savedDraftId}&review=1`)}`
		return (
			<section className="mx-auto max-w-3xl py-2">
				<div className="border-b border-slate-200 pb-6">
					<p className="text-sm font-semibold text-emerald-700">
						Definición guardada como borrador
					</p>
					<p className="mt-2 max-w-2xl text-sm text-slate-600">
						Todavía no afecta precios ni reservas.
					</p>
				</div>

				<ol
					className="grid gap-3 border-b border-slate-200 py-5 text-sm sm:grid-cols-4"
					aria-label="Progreso de publicación"
				>
					<li className="flex items-center gap-2 text-emerald-700">
						<span
							aria-hidden="true"
							className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold"
						>
							✓
						</span>
						<span className="font-medium">Definición creada</span>
					</li>
					<li className="flex items-center gap-2 text-slate-950">
						<span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-950" />
						<span className="font-semibold">Comprobar cálculo</span>
					</li>
					<li className="flex items-center gap-2 text-slate-500">
						<span aria-hidden="true" className="h-2 w-2 rounded-full border border-slate-400" />
						<span>Publicar</span>
					</li>
					<li className="flex items-center gap-2 text-slate-500">
						<span aria-hidden="true" className="h-2 w-2 rounded-full border border-slate-400" />
						<span>Asignar</span>
					</li>
				</ol>

				<div className="py-6">
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Siguiente paso
					</p>
					<h2 className="mt-2 text-2xl font-semibold text-slate-950">
						Comprueba cómo se cobrará al huésped
					</h2>
					<p className="mt-2 max-w-2xl text-sm text-slate-600">
						Usa una reserva de ejemplo para confirmar el importe, cuándo se cobra y quién lo
						recauda. La simulación no modifica ventas.
					</p>
					<div className="mt-5 flex flex-wrap items-center gap-3">
						<Button href={simulatorHref}>Comprobar en Simulador</Button>
						<span className="text-xs text-slate-500">
							Después podrás publicar y asignar la definición.
						</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
					<Button
						type="button"
						variant="ghost"
						onClick={() => props.onEditingComplete?.("Borrador guardado.")}
					>
						Volver a definiciones
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							setSavedDraftId(null)
							setStep(1)
							props.onResumeEditing?.()
						}}
					>
						Editar definición
					</Button>
				</div>
			</section>
		)
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
					{step <= 4 ? (
						<div className="mb-6 flex flex-wrap gap-3" aria-label="Progreso de la definición">
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
					) : null}

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

					{recoveredProgress && step <= 4 && (
						<Notice variant="neutral" title="Recuperamos tu progreso" className="mb-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p>
									Este formulario se conservó temporalmente en este navegador y aún no creó una
									definición.
								</p>
								<Button type="button" size="sm" variant="ghost" onClick={resetWizard}>
									Descartar progreso
								</Button>
							</div>
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
									<label className="mt-5 flex max-w-xl flex-col gap-2">
										<span className="text-sm font-medium text-slate-700">
											Nombre que verá el huésped
										</span>
										<Input
											value={draft.name}
											onChange={(event) => updateDraft({ name: event.target.value, code: "" })}
										/>
										<p className="text-xs text-slate-500">
											Puedes conservar el nombre sugerido o adaptarlo a tu operación.
										</p>
									</label>
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

							<label className="flex max-w-md flex-col gap-2">
								<span className="text-sm font-medium text-slate-700">
									¿Con qué frecuencia se cobra?
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
									La frecuencia determina si se cobra una vez, por noche o según cada huésped.
								</p>
							</label>

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
										Puedes volver a este paso para ajustar el cálculo antes de guardar.
									</p>
								</div>
							</div>
						</div>
					)}

					{step === 3 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">
									Jurisdicción y condiciones
								</h2>
								<p className="mt-2 text-sm text-slate-600">
									Indica dónde se regula el cobro, quién lo recauda y durante qué reservas debe
									aplicarse.
								</p>
							</div>
							<label className="flex max-w-md flex-col gap-2">
								<span className="text-sm font-medium text-slate-700">País de jurisdicción</span>
								<Select
									value={draft.jurisdictionCountry}
									onChange={(event) => updateDraft({ jurisdictionCountry: event.target.value })}
								>
									<option value="">Selecciona un país</option>
									{draft.jurisdictionCountry &&
									!JURISDICTION_OPTIONS.some(
										(country) => country.value === draft.jurisdictionCountry
									) ? (
										<option value={draft.jurisdictionCountry}>{draft.jurisdictionCountry}</option>
									) : null}
									{JURISDICTION_OPTIONS.map((country) => (
										<option key={country.value} value={country.value}>
											{country.label}
										</option>
									))}
								</Select>
								<p className="text-xs text-slate-500">
									Selecciona el país cuya normativa origina este impuesto o cargo.
								</p>
							</label>
						</div>
					)}

					{step === 3 && (
						<div className="space-y-6">
							<section className="border-t border-slate-200 pt-6">
								<h3 className="text-base font-semibold text-slate-950">
									¿Quién cobrará este importe?
								</h3>
								<p className="mt-1 text-sm text-slate-600">
									Indica quién recibe y liquida este cobro frente al huésped.
								</p>
								<div className="mt-4 grid gap-3 md:grid-cols-3">
									<ChoiceCard
										selected={draft.collectionResponsibility === "provider"}
										onClick={() => updateDraft({ collectionResponsibility: "provider" })}
									>
										<div className="text-sm font-semibold text-slate-950">Mi negocio</div>
										<p className="mt-1 text-sm text-slate-600">
											El proveedor cobra el importe al huésped.
										</p>
									</ChoiceCard>
									<ChoiceCard
										selected={draft.collectionResponsibility === "platform"}
										onClick={() => updateDraft({ collectionResponsibility: "platform" })}
									>
										<div className="text-sm font-semibold text-slate-950">Fastt</div>
										<p className="mt-1 text-sm text-slate-600">
											La plataforma recauda y lo refleja en la liquidación.
										</p>
									</ChoiceCard>
									<ChoiceCard
										selected={draft.collectionResponsibility === "marketplace"}
										onClick={() => updateDraft({ collectionResponsibility: "marketplace" })}
									>
										<div className="text-sm font-semibold text-slate-950">Canal de venta</div>
										<p className="mt-1 text-sm text-slate-600">
											Un canal compatible recauda el importe por cuenta del negocio.
										</p>
									</ChoiceCard>
								</div>
							</section>

							<section className="border-t border-slate-200 pt-6">
								<h3 className="text-base font-semibold text-slate-950">¿Cuándo debe aplicarse?</h3>
								<p className="mt-1 text-sm text-slate-600">
									Las fechas se evalúan según la fecha de entrada de la reserva.
								</p>
								<div className="mt-4 grid gap-3 md:grid-cols-3">
									<ChoiceCard
										selected={draft.applicationPeriod === "always"}
										onClick={() => setApplicationPeriod("always")}
									>
										<div className="text-sm font-semibold text-slate-950">Siempre</div>
										<p className="mt-1 text-sm text-slate-600">
											Sin fecha de inicio ni finalización.
										</p>
									</ChoiceCard>
									<ChoiceCard
										selected={draft.applicationPeriod === "from"}
										onClick={() => setApplicationPeriod("from")}
									>
										<div className="text-sm font-semibold text-slate-950">Desde una fecha</div>
										<p className="mt-1 text-sm text-slate-600">
											Comienza a cobrarse a partir de una fecha.
										</p>
									</ChoiceCard>
									<ChoiceCard
										selected={draft.applicationPeriod === "range"}
										onClick={() => setApplicationPeriod("range")}
									>
										<div className="text-sm font-semibold text-slate-950">Durante un periodo</div>
										<p className="mt-1 text-sm text-slate-600">Solo se cobra entre dos fechas.</p>
									</ChoiceCard>
								</div>
								{draft.applicationPeriod !== "always" && (
									<div className="mt-4 grid max-w-2xl gap-4 md:grid-cols-2">
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Fecha de inicio</span>
											<Input
												type="date"
												value={draft.effectiveFrom}
												max={
													draft.applicationPeriod === "range"
														? draft.effectiveTo || undefined
														: undefined
												}
												onChange={(event) => updateDraft({ effectiveFrom: event.target.value })}
											/>
										</label>
										{draft.applicationPeriod === "range" && (
											<label className="flex flex-col gap-2">
												<span className="text-sm font-medium text-slate-700">
													Fecha de finalización
												</span>
												<Input
													type="date"
													min={draft.effectiveFrom || undefined}
													value={draft.effectiveTo}
													onChange={(event) => updateDraft({ effectiveTo: event.target.value })}
												/>
											</label>
										)}
									</div>
								)}
								<Notice variant="neutral" className="mt-4">
									{applicationSummary}
								</Notice>
							</section>

							<section className="border-t border-slate-200 pt-5">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 className="text-base font-semibold text-slate-950">
											Condiciones especiales
										</h3>
										<p className="mt-1 text-sm text-slate-600">
											Exenciones, límites y variaciones de importe.
										</p>
									</div>
									<Button
										type="button"
										size="sm"
										variant="secondary"
										onClick={() =>
											updateDraft({ showSpecialConditions: !draft.showSpecialConditions })
										}
									>
										{draft.showSpecialConditions ? "Ocultar" : "Configurar"}
									</Button>
								</div>
								{draft.showSpecialConditions && (
									<div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
										<div className="space-y-3">
											<Checkbox
												checked={draft.hasResidenceExemption}
												onChange={(event) =>
													updateDraft({
														hasResidenceExemption: event.target.checked,
														guestResidenceExempt: event.target.checked
															? draft.guestResidenceExempt
															: "",
													})
												}
											>
												Excluir huéspedes según su país de residencia
											</Checkbox>
											{draft.hasResidenceExemption && (
												<label className="flex max-w-xl flex-col gap-2">
													<span className="text-sm font-medium text-slate-700">
														Países de residencia exentos
													</span>
													<Input
														placeholder="Ej. CL, AR"
														value={draft.guestResidenceExempt}
														onChange={(event) =>
															updateDraft({
																guestResidenceExempt: event.target.value.toUpperCase(),
															})
														}
													/>
													<p className="text-xs text-slate-500">
														Ingresa códigos ISO de dos letras separados por coma.
													</p>
												</label>
											)}
										</div>
										<div className="space-y-3">
											<Checkbox
												checked={draft.hasMaxAmount}
												onChange={(event) =>
													updateDraft({
														hasMaxAmount: event.target.checked,
														maxAmount: event.target.checked ? draft.maxAmount : "",
													})
												}
											>
												Limitar el importe máximo por reserva
											</Checkbox>
											{draft.hasMaxAmount && (
												<label className="flex max-w-sm flex-col gap-2">
													<span className="text-sm font-medium text-slate-700">
														Tope por reserva
													</span>
													<Input
														type="number"
														min="0"
														step="0.01"
														value={draft.maxAmount}
														onChange={(event) => updateDraft({ maxAmount: event.target.value })}
													/>
													<p className="text-xs text-slate-500">
														Nunca se cobrará más de este importe por reserva.
													</p>
												</label>
											)}
										</div>
										{["night", "guest_night"].includes(draft.appliesPer) && (
											<div className="space-y-3">
												<Checkbox
													checked={draft.hasMaxNights}
													onChange={(event) =>
														updateDraft({
															hasMaxNights: event.target.checked,
															maxNights: event.target.checked ? draft.maxNights : "",
														})
													}
												>
													Limitar las noches cobrables
												</Checkbox>
												{draft.hasMaxNights && (
													<label className="flex max-w-sm flex-col gap-2">
														<span className="text-sm font-medium text-slate-700">
															Máximo de noches
														</span>
														<Input
															type="number"
															min="1"
															step="1"
															value={draft.maxNights}
															onChange={(event) => updateDraft({ maxNights: event.target.value })}
														/>
														<p className="text-xs text-slate-500">
															El cargo se aplicará solo a las primeras noches indicadas.
														</p>
													</label>
												)}
											</div>
										)}
										<div className="space-y-3">
											<Checkbox
												checked={draft.hasSeasonalOverride}
												onChange={(event) =>
													updateDraft({
														hasSeasonalOverride: event.target.checked,
														seasonFrom: event.target.checked ? draft.seasonFrom : "",
														seasonTo: event.target.checked ? draft.seasonTo : "",
														seasonValue: event.target.checked ? draft.seasonValue : "",
													})
												}
											>
												Cambiar el importe durante una temporada
											</Checkbox>
											{draft.hasSeasonalOverride && (
												<div className="grid max-w-3xl gap-4 md:grid-cols-3">
													<label className="flex flex-col gap-2">
														<span className="text-sm font-medium text-slate-700">
															Inicio de temporada
														</span>
														<Input
															type="date"
															value={draft.seasonFrom}
															max={draft.seasonTo || undefined}
															onChange={(event) => updateDraft({ seasonFrom: event.target.value })}
														/>
													</label>
													<label className="flex flex-col gap-2">
														<span className="text-sm font-medium text-slate-700">
															Fin de temporada
														</span>
														<Input
															type="date"
															min={draft.seasonFrom || undefined}
															value={draft.seasonTo}
															onChange={(event) => updateDraft({ seasonTo: event.target.value })}
														/>
													</label>
													<label className="flex flex-col gap-2">
														<span className="text-sm font-medium text-slate-700">
															{draft.calculationType === "percentage"
																? "Porcentaje durante la temporada"
																: "Importe durante la temporada"}
														</span>
														<Input
															type="number"
															min="0"
															step="0.01"
															value={draft.seasonValue}
															onChange={(event) => updateDraft({ seasonValue: event.target.value })}
														/>
													</label>
												</div>
											)}
											<p className="text-xs text-slate-500">
												Fuera de esas fechas se mantiene el importe habitual de la regla.
											</p>
										</div>
									</div>
								)}
							</section>
							<Notice variant="neutral" title="El alcance comercial se define después">
								Guardar esta definición no la aplica a ninguna venta. Después de simularla y
								publicarla podrás elegir cuenta, producto, unidad, tarifa y canal desde
								Asignaciones.
							</Notice>
						</div>
					)}

					{step === 4 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">Revisa antes de guardar</h2>
								<p className="mt-2 text-sm text-slate-600">
									Confirma la definición. Al guardarla quedará como borrador, sin publicarse ni
									asignarse a ventas.
								</p>
							</div>

							{potentialDuplicates.length > 0 && (
								<Notice variant="warning" title="Puede que esta definición ya exista">
									<p>
										Encontramos{" "}
										{potentialDuplicates.length === 1
											? "una regla"
											: `${potentialDuplicates.length} reglas`}{" "}
										con el mismo nombre, cálculo, importe y jurisdicción:{" "}
										{potentialDuplicates.map((item) => item.name).join(", ")}.
									</p>
									<p className="mt-2">
										Revisa el catálogo antes de guardar si no deseas crear un duplicado.
									</p>
								</Notice>
							)}

							<dl className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
								<div className="grid gap-3 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
									<dt className="font-medium text-slate-950">Tipo y nombre</dt>
									<dd className="text-slate-700">
										{draft.name} · {draft.kind === "tax" ? "Impuesto" : "Cargo"}
									</dd>
									<Button type="button" size="sm" variant="ghost" onClick={() => setStep(1)}>
										Editar
									</Button>
								</div>
								<div className="grid gap-3 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
									<dt className="font-medium text-slate-950">Cálculo</dt>
									<dd className="text-slate-700">
										{draft.calculationType === "percentage"
											? `${draft.value}%`
											: `${draft.currency} ${draft.value}`}{" "}
										·{" "}
										{APPLIES_PER_OPTIONS.find((option) => option.value === draft.appliesPer)?.label}{" "}
										·{" "}
										{draft.inclusionType === "included"
											? "Incluido en el precio"
											: "Agregado al confirmar"}
									</dd>
									<Button type="button" size="sm" variant="ghost" onClick={() => setStep(2)}>
										Editar
									</Button>
								</div>
								<div className="grid gap-3 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
									<dt className="font-medium text-slate-950">Jurisdicción</dt>
									<dd className="text-slate-700">
										{jurisdictionLabel} · Recauda:{" "}
										{draft.collectionResponsibility === "provider"
											? "mi negocio"
											: draft.collectionResponsibility === "platform"
												? "Fastt"
												: "canal de venta"}
									</dd>
									<Button type="button" size="sm" variant="ghost" onClick={() => setStep(3)}>
										Editar
									</Button>
								</div>
								<div className="grid gap-3 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
									<dt className="font-medium text-slate-950">Aplicación</dt>
									<dd className="text-slate-700">{applicationSummary}</dd>
									<Button type="button" size="sm" variant="ghost" onClick={() => setStep(3)}>
										Editar
									</Button>
								</div>
								<div className="grid gap-3 py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
									<dt className="font-medium text-slate-950">Condiciones especiales</dt>
									<dd className="text-slate-700">
										{[
											draft.hasResidenceExemption && "Exenciones por residencia",
											draft.hasMaxAmount && "Tope por reserva",
											draft.hasMaxNights && "Límite de noches",
											draft.hasSeasonalOverride && "Importe de temporada",
										]
											.filter(Boolean)
											.join(" · ") || "Ninguna"}
									</dd>
								</div>
							</dl>

							<Notice variant="neutral" title="Qué ocurrirá al guardar">
								Se creará una definición en estado borrador. No cambiará precios, reservas, canales
								ni asignaciones. La simulación y la publicación se realizan después.
							</Notice>
						</div>
					)}

					{step === 5 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-slate-950">Revisión y publicación</h2>
								<p className="mt-2 text-sm text-slate-600">
									Confirma la información certificada antes de publicar esta versión.
								</p>
							</div>

							<section className="divide-y divide-slate-200 border-y border-slate-200">
								<div className="grid gap-4 py-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
									<div>
										<p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
											<span className="text-slate-500" aria-hidden="true">
												{fiscalIcons.sliders}
											</span>
											Configuración
										</p>
										<p className="mt-1 text-sm text-slate-600">Regla y aplicación completas.</p>
									</div>
									<p className="text-sm text-slate-700">
										{draft.jurisdictionCountry
											? `Jurisdicción: ${draft.jurisdictionCountry}.`
											: "Falta la jurisdicción."}
									</p>
									<Button type="button" size="sm" variant="ghost" onClick={() => setStep(3)}>
										Editar
									</Button>
								</div>
								<div className="grid gap-4 py-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
									<div>
										<p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
											<span
												className={
													simulationCertificate?.isCurrent ? "text-emerald-700" : "text-slate-500"
												}
												aria-hidden="true"
											>
												{simulationCertificate?.isCurrent ? fiscalIcons.shield : fiscalIcons.info}
											</span>
											Simulación
										</p>
										<p className="mt-1 text-sm text-slate-600">
											Certifica esta versión con el cálculo real.
										</p>
									</div>
									{isCheckingSimulation ? (
										<p className="text-sm text-slate-600">Comprobando simulación vigente...</p>
									) : simulationCertificate?.isCurrent ? (
										<p className="text-sm text-slate-700">
											Simulación certificada
											{simulationCertificate.issuedAt
												? ` el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(simulationCertificate.issuedAt))}`
												: ""}
											.
										</p>
									) : (
										<p className="text-sm text-amber-800">
											Simulación pendiente para esta versión.
										</p>
									)}
									<Button
										href={`/provider/settings/tax-fees/simulator?definitionId=${encodeURIComponent(definitionId ?? "")}&returnTo=${encodeURIComponent(`/provider/settings/tax-fees?edit=${definitionId ?? ""}&review=1`)}`}
										size="sm"
										variant={simulationCertificate?.isCurrent ? "ghost" : "secondary"}
									>
										{simulationCertificate?.isCurrent ? "Ver simulación" : "Abrir simulador"}
									</Button>
								</div>
								<div className="grid gap-4 py-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
									<div>
										<p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
											<span className="text-slate-500" aria-hidden="true">
												{fiscalIcons.link}
											</span>
											Asignaciones
										</p>
										<p className="mt-1 text-sm text-slate-600">Dónde se aplicará la regla.</p>
									</div>
									<p className="text-sm text-slate-700">
										{baselineDefinition?.assignments?.some(
											(assignment) => assignment.status === "active"
										)
											? "La definición conserva asignaciones activas."
											: "No afectará ventas hasta que asignes una cobertura."}
									</p>
									<Button href="/provider/settings/tax-fees/assignments" size="sm" variant="ghost">
										Ver asignaciones
									</Button>
								</div>
							</section>

							<section className="border-b border-slate-200 pb-5">
								<p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
									Versión que se publicará
								</p>
								<div className="fastt-drawer-facts mt-3">
									<DrawerFact title="Identidad" icon={fiscalIcons.file}>
										{draft.name} · {draft.kind === "tax" ? "Impuesto" : "Cargo"}
									</DrawerFact>
									<DrawerFact title="Cálculo" icon={fiscalIcons.percent}>
										{draft.calculationType === "percentage"
											? `${draft.value}%`
											: `${draft.currency} ${draft.value}`}{" "}
										·{" "}
										{APPLIES_PER_OPTIONS.find(
											(option) => option.value === draft.appliesPer
										)?.label.toLowerCase()}{" "}
										· {draft.inclusionType === "included" ? "incluido" : "agregado"}
									</DrawerFact>
									<DrawerFact title="Aplicación" icon={fiscalIcons.calendar}>
										{applicationSummary} Responsable de recaudo:{" "}
										{draft.collectionResponsibility === "provider"
											? "mi negocio"
											: draft.collectionResponsibility === "platform"
												? "Fastt"
												: "canal de venta"}
										.
									</DrawerFact>
								</div>
								<details className="mt-4 border-t border-slate-100 pt-3">
									<summary className="cursor-pointer text-sm font-medium text-slate-600">
										Información técnica
									</summary>
									<dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
										<div>
											<dt className="text-slate-500">Código interno</dt>
											<dd className="mt-1 font-mono text-xs break-all text-slate-700">
												{draft.code || "Se asignará al publicar"}
											</dd>
										</div>
										<div>
											<dt className="text-slate-500">Cotización certificada</dt>
											<dd className="mt-1 font-mono text-xs break-all text-slate-700">
												{simulationCertificate?.quoteId ?? "Pendiente"}
											</dd>
										</div>
									</dl>
								</details>
							</section>

							<section className="flex items-start gap-3 border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
								<span className="fastt-drawer-fact__icon mt-0.5 shrink-0" aria-hidden="true">
									{fiscalIcons.info}
								</span>
								<div className="min-w-0">
									<p className="font-semibold text-slate-950">
										{baselineDefinition
											? `Cambios respecto de la versión ${baselineDefinition.revision ?? 0}`
											: "Primera publicación"}
									</p>
									<p className="mt-1">
										{baselineDefinition
											? `${changedFields.join(" · ")}. Se creará la versión ${(baselineDefinition.revision ?? 0) + 1}.`
											: "Se creará la versión 1."}{" "}
										Las reservas históricas no cambiarán.
									</p>
								</div>
							</section>

							{isPreviewLoading && previewResult && (
								<>
									<div className="grid gap-4 border-y border-slate-200 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
										<div>
											<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
												Versión que se publicará
											</p>
											<p className="mt-2 text-sm font-semibold text-slate-950">
												{draft.name} ·{" "}
												{draft.calculationType === "percentage"
													? `${draft.value}%`
													: `${draft.currency} ${draft.value}`}{" "}
												·{" "}
												{APPLIES_PER_OPTIONS.find(
													(option) => option.value === draft.appliesPer
												)?.label.toLowerCase()}
											</p>
											<p className="mt-1 text-sm text-slate-600">
												{applicationSummary} Recauda:{" "}
												{draft.collectionResponsibility === "provider"
													? "mi negocio"
													: draft.collectionResponsibility === "platform"
														? "Fastt"
														: "canal de venta"}
												.
											</p>
										</div>
										<div className="md:border-l md:border-slate-200 md:pl-4">
											<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
												Alcance comercial
											</p>
											<p className="mt-2 text-sm font-semibold text-slate-950">
												{draft.scope === "provider"
													? "Toda la cuenta"
													: draft.scope === "rate_plan"
														? "Tarifa seleccionada"
														: draft.scope === "variant"
															? "Unidad seleccionada"
															: "Producto seleccionado"}
											</p>
											<p className="mt-1 text-sm text-slate-600">
												{baselineDefinition?.assignments?.some(
													(assignment) => assignment.status === "active"
												)
													? "La definición tiene asignaciones activas."
													: "Publicar no asigna la regla a ventas. La asignación se realiza después."}
											</p>
										</div>
									</div>

									<div className="border-b border-slate-200 pb-5">
										<div className="flex flex-wrap items-end justify-between gap-3">
											<div>
												<p className="text-sm font-semibold text-slate-950">
													Contexto de simulación
												</p>
												<p className="mt-1 text-sm text-slate-600">
													Selecciona una reserva representativa para comprobar el cálculo.
												</p>
											</div>
											<Badge variant="neutral">No modifica ventas ni asignaciones</Badge>
										</div>
									</div>

									<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Producto</span>
											<Select
												value={draft.productId}
												onChange={(event) => {
													selectProduct(event.target.value)
													setSimulationVariantId("")
													setSimulationRatePlanId("")
												}}
											>
												<option value="">Selecciona un producto</option>
												{props.initialResources.products.map((product) => (
													<option key={product.id} value={product.id}>
														{product.label}
													</option>
												))}
											</Select>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Unidad o salida</span>
											<Select
												value={simulationVariantId}
												onChange={(event) => {
													setSimulationVariantId(event.target.value)
													setSimulationRatePlanId("")
												}}
											>
												<option value="">Selecciona una unidad</option>
												{selectableVariants.map((variant) => (
													<option key={variant.id} value={variant.id}>
														{variant.label}
													</option>
												))}
											</Select>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Tarifa</span>
											<Select
												value={simulationRatePlanId}
												onChange={(event) => setSimulationRatePlanId(event.target.value)}
											>
												<option value="">Selecciona una tarifa</option>
												{selectableRatePlans.map((ratePlan) => (
													<option key={ratePlan.id} value={ratePlan.id}>
														{ratePlan.label}
													</option>
												))}
											</Select>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Canal</span>
											<Select
												value={draft.channel || "web"}
												onChange={(event) => updateDraft({ channel: event.target.value })}
											>
												<option value="web">Web directa</option>
												<option value="channel_manager">Canal conectado</option>
											</Select>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Entrada</span>
											<Input
												type="date"
												value={draft.checkIn}
												max={draft.checkOut || undefined}
												onChange={(event) => updateDraft({ checkIn: event.target.value })}
											/>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">Salida</span>
											<Input
												type="date"
												min={draft.checkIn || undefined}
												value={draft.checkOut}
												onChange={(event) => updateDraft({ checkOut: event.target.value })}
											/>
										</label>
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">
												Residencia del huésped
											</span>
											<Input
												type="text"
												placeholder="Ej. AR"
												maxLength={2}
												value={draft.guestResidenceCountry}
												onChange={(event) =>
													updateDraft({ guestResidenceCountry: event.target.value.toUpperCase() })
												}
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
										<label className="flex flex-col gap-2">
											<span className="text-sm font-medium text-slate-700">
												Habitaciones o cantidad
											</span>
											<Input
												type="number"
												min="1"
												value={draft.rooms}
												onChange={(event) => updateDraft({ rooms: event.target.value })}
											/>
										</label>
									</div>

									<details className="border-y border-slate-200 py-4">
										<summary className="cursor-pointer text-sm font-semibold text-slate-800">
											Usar importe de prueba
										</summary>
										<div className="mt-4 grid max-w-md gap-2">
											<label className="flex flex-col gap-2">
												<span className="text-sm font-medium text-slate-700">
													Importe base manual
												</span>
												<Input
													type="number"
													min="0"
													step="0.01"
													value={draft.base}
													onChange={(event) => updateDraft({ base: event.target.value })}
												/>
											</label>
											<p className="text-xs text-amber-800">
												Este modo verifica la fórmula fiscal. No certifica el precio comercial de
												una tarifa.
											</p>
										</div>
									</details>
									<p className="text-xs text-slate-500">
										La unidad, la tarifa y el canal delimitan las reglas que se prueban. Mientras el
										importe provenga de la prueba manual, no representa una cotización comercial de
										esa tarifa.
									</p>

									<div className="flex flex-wrap gap-3">
										<Button
											type="button"
											onClick={() => void runPreview()}
											disabled={isPreviewLoading || !definitionId || !draft.productId.trim()}
										>
											{isPreviewLoading ? "Calculando cotización..." : "Simular cotización"}
										</Button>
										{editingDefinitionId && (
											<Badge variant="neutral" className="px-4 py-2 text-sm">
												La versión se publica por separado de sus asignaciones comerciales.
											</Badge>
										)}
									</div>
									<div className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
										<p className="font-semibold text-slate-950">
											Cambios respecto de la versión publicada
										</p>
										<p className="mt-1">
											{changedFields.join(" · ")}.{" "}
											{baselineDefinition
												? `Se creará la versión ${(baselineDefinition?.revision ?? 0) + 1}.`
												: "Se creará la versión 1."}
										</p>
									</div>

									{previewResult && (
										<div className="space-y-5 border-y border-slate-200 py-5" aria-live="polite">
											<div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
												<div>
													<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
														{previewResult.quote.pricing.source === "legacy"
															? "Prueba de cálculo fiscal"
															: "Cotización verificada"}
													</p>
													<p className="mt-1 text-2xl font-semibold text-slate-950">
														{formatMoney(
															previewResult.quote.totalAmount,
															previewResult.quote.currency
														)}
													</p>
												</div>
												<div className="text-right text-xs text-slate-500">
													<p>{previewResult.quote.quoteId}</p>
													<p className="mt-1">
														{new Intl.DateTimeFormat("es-CL", {
															dateStyle: "medium",
															timeStyle: "short",
														}).format(new Date(previewResult.quote.issuedAt))}
													</p>
												</div>
											</div>
											{previewResult.quote.pricing.source === "legacy" && (
												<p className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
													El total usa el importe base manual. La simulación valida el cálculo
													fiscal, no el precio comercial de la tarifa.
												</p>
											)}
											<div className="grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-3">
												<div>
													<p className="text-xs font-medium text-slate-500">Precio base</p>
													<p className="mt-1 text-lg font-semibold text-slate-950">
														{formatMoney(
															previewResult.breakdown.base,
															previewResult.quote.currency
														)}
													</p>
												</div>
												<div>
													<p className="text-xs font-medium text-slate-500">Pagado ahora</p>
													<p className="mt-1 text-lg font-semibold text-slate-950">
														{formatMoney(
															previewResult.settlement.paidNow,
															previewResult.quote.currency
														)}
													</p>
												</div>
												<div>
													<p className="text-xs font-medium text-slate-500">
														Pendiente en propiedad
													</p>
													<p className="mt-1 text-lg font-semibold text-slate-950">
														{formatMoney(
															previewResult.settlement.pendingAtProperty,
															previewResult.quote.currency
														)}
													</p>
												</div>
											</div>
											<div className="flex flex-wrap gap-2">
												{previewResult.flags.hasIncluded && (
													<Badge variant="success">Incluye cargos</Badge>
												)}
												{previewResult.flags.hasExcluded && (
													<Badge variant="warning">Cargos adicionales al confirmar</Badge>
												)}
											</div>

											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<h3 className="text-sm font-semibold text-slate-900">
														Incluidos en el precio
													</h3>
													<ul className="mt-2 space-y-2 text-sm text-slate-700">
														{includedLines.length === 0 ? (
															<li className="border-b border-slate-100 py-2">
																No hay cargos incluidos adicionales.
															</li>
														) : (
															includedLines.map((line, index) => (
																<li
																	key={`${line.code}-included-${index}`}
																	className="flex items-center justify-between gap-4 border-b border-slate-100 py-2"
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
													<h3 className="text-sm font-semibold text-slate-900">
														Cargos adicionales
													</h3>
													<ul className="mt-2 space-y-2 text-sm text-slate-700">
														{excludedLines.length === 0 ? (
															<li className="border-b border-slate-100 py-2">
																No se agregarán cargos extra después.
															</li>
														) : (
															excludedLines.map((line, index) => (
																<li
																	key={`${line.code}-excluded-${index}`}
																	className="flex items-center justify-between gap-4 border-b border-slate-100 py-2"
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

											<div className="flex items-end justify-between border-t border-slate-300 pt-4">
												<p className="text-sm font-medium text-slate-700">Total</p>
												<p className="text-2xl font-semibold text-slate-950">
													{formatMoney(previewResult.total, previewResult.quote.currency)}
												</p>
											</div>
											<details
												className="border-t border-slate-200 pt-4"
												open={technicalOpen}
												onToggle={(event) =>
													setTechnicalOpen((event.target as HTMLDetailsElement).open)
												}
											>
												<summary className="cursor-pointer text-sm font-semibold text-slate-800">
													Cómo se calculó
												</summary>
												<div className="mt-4 overflow-x-auto">
													<table className="w-full min-w-[700px] text-left text-sm">
														<thead className="border-b border-slate-200 text-xs tracking-[0.08em] text-slate-500 uppercase">
															<tr>
																<th className="pb-2">Regla y versión</th>
																<th className="pb-2">Origen</th>
																<th className="pb-2">Base</th>
																<th className="pb-2">Multiplicador</th>
																<th className="pb-2">Redondeo</th>
																<th className="pb-2 text-right">Importe</th>
															</tr>
														</thead>
														<tbody className="divide-y divide-slate-100">
															{previewResult.technical.map((line) => (
																<tr key={line.definitionId}>
																	<td className="py-3 font-medium text-slate-900">
																		{line.name}
																		<span className="block text-xs font-normal text-slate-500">
																			{line.definitionVersionId ?? "Borrador sin publicar"}
																		</span>
																	</td>
																	<td className="py-3">{line.source.scope}</td>
																	<td className="py-3">
																		{line.taxableBase === "booking_base"
																			? "Precio base"
																			: "Base + incluidos"}
																	</td>
																	<td className="py-3">{line.multiplier}</td>
																	<td className="py-3">Redondeo a 2 decimales</td>
																	<td className="py-3 text-right font-medium">
																		{formatMoney(line.amount, previewResult.quote.currency)}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											</details>
										</div>
									)}
								</>
							)}
						</div>
					)}

					{publicationIntent && step === 5 && (
						<Notice variant="warning" title="Confirmar publicación de versión">
							<p>
								{publicationIntent === "schedule"
									? `La versión quedará publicada con estado programado y se aplicará desde ${draft.effectiveFrom ? formatDateForSummary(draft.effectiveFrom) : "la fecha configurada"}.`
									: "Esta versión quedará disponible inmediatamente para sus asignaciones activas."}
							</p>
							<p className="mt-2">
								{baselineDefinition?.assignments?.some(
									(assignment) => assignment.status === "active"
								)
									? "Las asignaciones activas podrán usar esta versión. Las reservas históricas no cambian."
									: "No hay asignaciones activas: la versión no afectará ventas hasta que asignes la regla."}
							</p>
							<div className="mt-4 flex flex-wrap gap-3">
								<Button
									type="button"
									variant="secondary"
									onClick={() => setPublicationIntent(null)}
								>
									Cancelar
								</Button>
								<Button
									type="button"
									variant="success"
									className="!bg-sky-600 hover:!bg-sky-700 focus:!ring-sky-600"
									onClick={finishPublication}
								>
									Confirmar publicación
								</Button>
							</div>
						</Notice>
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
							{step < 5 ? (
								<Button
									type="button"
									onClick={() => {
										if (
											step <= 4 &&
											!window.confirm(
												"Tu progreso quedará guardado temporalmente en este navegador. ¿Quieres salir?"
											)
										)
											return
										props.onCancel?.()
									}}
									disabled={isSavingDefinition || isPreviewLoading}
									variant="secondary"
								>
									Salir
								</Button>
							) : null}
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
											: "Guardar borrador"
										: "Continuar"}
								</Button>
							)}

							{step === 5 && (
								<Button
									type="button"
									onClick={() =>
										confirmPublication(
											draft.applicationPeriod === "always" ? "publish" : "schedule"
										)
									}
									disabled={
										!simulationCertificate?.isCurrent || isCheckingSimulation || isSavingDefinition
									}
									variant="success"
									className="!bg-sky-600 hover:!bg-sky-700 focus:!ring-sky-600"
								>
									{isSavingDefinition
										? "Publicando..."
										: `Publicar versión ${(baselineDefinition?.revision ?? 0) + 1}`}
								</Button>
							)}
						</div>
					</div>
				</section>
			</section>
		</div>
	)
}
