import { useEffect, useMemo, useState } from "react"

type TaxFeeKind = "tax" | "fee"
type CalculationType = "percentage" | "fixed"
type AppliesPer = "stay" | "night" | "guest" | "guest_night"
type InclusionType = "included" | "excluded"
type ScopeType = "product" | "variant" | "rate_plan" | "provider"

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
	effectiveFrom: string | null
	effectiveTo: string | null
	status: "active" | "archived"
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
}

type WarningGroup = {
	title: string
	items: ApiWarning[]
}

export type TaxFeeWizardMode = "creating" | "editing"

type TaxFeeWizardProps = {
	initialDefinitions: DefinitionSummary[]
	initialWarnings: ApiWarning[]
	initialMode?: TaxFeeWizardMode
	initialDefinitionId?: string | null
	showDefinitionsSidebar?: boolean
	onDefinitionsChange?: (definitions: DefinitionSummary[], warnings: ApiWarning[]) => void
	onAssignmentSuccess?: (message: string) => void
	onEditingComplete?: (message: string) => void
	onCancel?: () => void
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
		description: "A percentage tax included in the displayed price.",
		calculationType: "percentage",
		appliesPer: "stay",
		inclusionType: "included",
	},
	{
		key: "CITY_TAX",
		kind: "tax",
		label: "City Tax",
		description: "A fixed local tax commonly charged per guest per night.",
		calculationType: "fixed",
		appliesPer: "guest_night",
		inclusionType: "excluded",
	},
	{
		key: "SERVICE_FEE",
		kind: "fee",
		label: "Service Fee",
		description: "A percentage-based operational fee added to the stay subtotal.",
		calculationType: "percentage",
		appliesPer: "stay",
		inclusionType: "excluded",
	},
	{
		key: "CLEANING_FEE",
		kind: "fee",
		label: "Cleaning Fee",
		description: "A one-time fixed fee charged once per stay.",
		calculationType: "fixed",
		appliesPer: "stay",
		inclusionType: "excluded",
	},
	{
		key: "RESORT_FEE",
		kind: "fee",
		label: "Resort Fee",
		description: "A fixed fee commonly charged per night for on-site services.",
		calculationType: "fixed",
		appliesPer: "night",
		inclusionType: "excluded",
	},
	{
		key: "CUSTOM",
		kind: "both",
		label: "Custom",
		description: "Start from a neutral setup and configure the charge manually.",
	},
]

const STEP_LABELS = [
	{ id: 1, title: "Type" },
	{ id: 2, title: "Preset" },
	{ id: 3, title: "Amount" },
	{ id: 4, title: "Scope" },
	{ id: 5, title: "Review" },
	{ id: 6, title: "Preview" },
]

const APPLIES_PER_OPTIONS: Array<{ value: AppliesPer; label: string }> = [
	{ value: "stay", label: "Per stay" },
	{ value: "night", label: "Per night" },
	{ value: "guest", label: "Per guest" },
	{ value: "guest_night", label: "Per guest per night" },
]

const INCLUDED_OPTIONS: Array<{ value: InclusionType; label: string; helper: string }> = [
	{
		value: "included",
		label: "Included in price",
		helper: "Guests see this already inside the shown price.",
	},
	{
		value: "excluded",
		label: "Added at checkout",
		helper: "Guests see this added on top of the shown price.",
	},
]

const CALCULATION_OPTIONS: Array<{ value: CalculationType; label: string; helper: string }> = [
	{
		value: "percentage",
		label: "Percentage",
		helper: "Calculated as a percentage of the stay subtotal.",
	},
	{
		value: "fixed",
		label: "Fixed",
		helper: "Charged as a flat amount using the selected frequency.",
	},
]

const KIND_OPTIONS: Array<{ value: TaxFeeKind; label: string; description: string }> = [
	{
		value: "tax",
		label: "Tax",
		description: "Government or local charges such as VAT or city tax.",
	},
	{
		value: "fee",
		label: "Fee",
		description: "Operational charges such as cleaning or service fees.",
	},
]

const SCOPE_OPTIONS: Array<{ value: ScopeType; label: string; helper: string }> = [
	{ value: "product", label: "Product", helper: "Apply to a full hotel or property listing." },
	{ value: "variant", label: "Variant", helper: "Apply only to one sellable room or unit." },
	{ value: "rate_plan", label: "Rate plan", helper: "Apply to a specific rate plan only." },
	{ value: "provider", label: "Provider", helper: "Apply broadly across this provider account." },
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
	base: "100",
	checkIn: makeTomorrow(7),
	checkOut: makeTomorrow(8),
	adults: "2",
	children: "0",
}

function buttonClass(selected: boolean) {
	return [
		"rounded-3xl border px-4 py-4 text-left transition",
		selected
			? "border-emerald-600 bg-emerald-50 shadow-[0_0_0_1px_rgba(5,150,105,0.2)]"
			: "border-neutral-200 bg-white hover:border-neutral-400",
	].join(" ")
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
				? "Check the amount"
				: warning.code === "overlap_detected"
					? "Possible overlap"
					: warning.code === "duplicate_code"
						? "Similar charge already exists"
						: "Please review"

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
	const [isSavingAssignment, setIsSavingAssignment] = useState(false)
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
	const showDefinitionsSidebar = props.showDefinitionsSidebar !== false

	useEffect(() => {
		setDraft((current) => {
			if (!current.kind || !current.presetKey) return current
			if (current.presetKey === "CUSTOM") {
				return current.name
					? current
					: {
							...current,
							name: current.kind === "tax" ? "Custom Tax" : "Custom Fee",
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

	const stepValid =
		step === 1
			? !!draft.kind
			: step === 2
				? !!draft.presetKey
				: step === 3
					? draft.calculationType !== null &&
						Number(draft.value) > 0 &&
						(draft.calculationType === "percentage" || draft.currency.trim().length > 0)
					: step === 4
						? draft.scopeId.trim().length > 0 &&
							(draft.scope === "product" ||
								draft.scope === "provider" ||
								draft.productId.trim().length > 0)
						: step === 5
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
				throw new Error(body?.message || body?.error || "Failed to refresh definitions")
			}
			const nextDefinitions = Array.isArray(body?.definitions) ? body.definitions : []
			const nextWarnings = Array.isArray(body?.warnings) ? body.warnings : []
			setDefinitions(nextDefinitions)
			setListWarnings(nextWarnings)
			props.onDefinitionsChange?.(nextDefinitions, nextWarnings)
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to refresh definitions")
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
		if (props.initialMode === "creating") {
			if (
				editingDefinitionId !== null ||
				definitionId !== null ||
				step !== 1 ||
				draft.kind !== null
			) {
				resetWizard()
			}
			return
		}

		if (props.initialMode === "editing" && props.initialDefinitionId) {
			const definition = definitions.find((item) => item.id === props.initialDefinitionId)
			if (definition && editingDefinitionId !== definition.id) {
				startEdit(definition)
			}
		}
	}, [
		props.initialMode,
		props.initialDefinitionId,
		definitions,
		editingDefinitionId,
		definitionId,
		step,
		draft.kind,
	])

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
					? current.name || (current.kind === "tax" ? "Custom Tax" : "Custom Fee")
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

	async function persistDefinition() {
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
			form.set("status", "active")
			if (draft.effectiveFrom) form.set("effectiveFrom", draft.effectiveFrom)
			if (draft.effectiveTo) form.set("effectiveTo", draft.effectiveTo)

			const response = await fetch("/api/provider/tax-fees/definitions", {
				method: editingDefinitionId ? "PUT" : "POST",
				body: form,
			})
			const body = await readJsonSafe(response)
			if (!response.ok) {
				throw new Error(body?.message || body?.error || "Failed to save definition")
			}

			const nextId = body?.id
			setDefinitionId(nextId)
			setEditingDefinitionId(nextId)
			setDraft((current) => ({ ...current, code }))
			setPreviewWarnings(Array.isArray(body?.warnings) ? body.warnings : [])
			await refreshDefinitions()
			setSuccessMessage(
				editingDefinitionId
					? "Definition updated. Run preview before assigning."
					: "Definition saved. Run preview before assigning."
			)
			setStep(6)
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to save definition")
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
				throw new Error(body?.message || body?.error || "Preview failed")
			}

			setPreviewResult(body)
			setPreviewWarnings(Array.isArray(body?.warnings) ? body.warnings : [])
			setHasSuccessfulPreview(true)
		} catch (error) {
			setHasSuccessfulPreview(false)
			setPreviewResult(null)
			setPreviewWarnings([])
			setErrorMessage(error instanceof Error ? error.message : "Preview failed")
		} finally {
			setIsPreviewLoading(false)
		}
	}

	async function saveAssignment() {
		if (!definitionId) return
		setIsSavingAssignment(true)
		setErrorMessage(null)
		setSuccessMessage(null)
		try {
			const form = new FormData()
			form.set("taxFeeDefinitionId", definitionId)
			form.set("scope", draft.scope)
			form.set("scopeId", draft.scopeId.trim())
			if (draft.channel.trim()) form.set("channel", draft.channel.trim())

			const response = await fetch("/api/provider/tax-fees/assignments", {
				method: "POST",
				body: form,
			})
			const body = await readJsonSafe(response)
			if (!response.ok) {
				throw new Error(body?.message || body?.error || "Assignment failed")
			}

			setListWarnings(Array.isArray(body?.warnings) ? body.warnings : [])
			await refreshDefinitions()
			setSuccessMessage("Definition assigned successfully.")
			resetWizard()
			props.onAssignmentSuccess?.("Tax or fee assigned successfully.")
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Assignment failed")
		} finally {
			setIsSavingAssignment(false)
		}
	}

	function nextStep() {
		if (!stepValid || step >= 6) return
		if (step === 5) {
			void persistDefinition()
			return
		}
		setStep((current) => Math.min(current + 1, 6))
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
					<aside className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
						<div className="mb-4 flex items-center justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
									Definitions
								</p>
								<h2 className="mt-2 text-2xl font-semibold text-neutral-950">
									Existing taxes & fees
								</h2>
							</div>
							<button
								type="button"
								onClick={() => {
									resetWizard()
									void refreshDefinitions()
								}}
								className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
							>
								{isRefreshingDefinitions ? "Refreshing..." : "New definition"}
							</button>
						</div>

						{listWarnings.length > 0 && (
							<div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
								<p className="font-semibold">Needs attention</p>
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
							</div>
						)}

						<div className="space-y-3">
							{definitions.length === 0 ? (
								<div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
									No taxes or fees configured yet.
								</div>
							) : (
								definitions.map((definition) => (
									<div key={definition.id} className="rounded-3xl border border-neutral-200 p-4">
										<div className="flex items-start justify-between gap-4">
											<div>
												<p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
													{definition.kind}
												</p>
												<h3 className="mt-1 text-lg font-semibold text-neutral-950">
													{definition.name}
												</h3>
												<p className="mt-1 text-sm text-neutral-600">{definition.code}</p>
											</div>
											<button
												type="button"
												onClick={() => startEdit(definition)}
												className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
											>
												Edit
											</button>
										</div>
										<p className="mt-3 text-sm text-neutral-700">
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
					</aside>
				)}

				<section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
					<div className="mb-6 flex flex-wrap gap-3">
						{STEP_LABELS.map((item) => {
							const active = item.id === step
							const complete = item.id < step
							return (
								<div
									key={item.id}
									className={[
										"flex items-center gap-3 rounded-full border px-4 py-2 text-sm",
										active
											? "border-emerald-600 bg-emerald-50 text-emerald-900"
											: complete
												? "border-neutral-300 bg-neutral-100 text-neutral-700"
												: "border-neutral-200 bg-white text-neutral-500",
									].join(" ")}
								>
									<span className="font-semibold">{item.id}</span>
									<span>{item.title}</span>
								</div>
							)
						})}
					</div>

					{errorMessage && (
						<div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
							{errorMessage}
						</div>
					)}

					{successMessage && (
						<div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
							{successMessage}
						</div>
					)}

					{previewWarnings.length > 0 && (
						<div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
							<p className="font-semibold">Review before saving</p>
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
						</div>
					)}

					{step === 1 && (
						<div className="space-y-4">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">What are you adding?</h2>
								<p className="mt-2 text-sm text-neutral-600">
									Start by choosing whether this is a government tax or an operational fee.
								</p>
							</div>
							<div className="grid gap-4 md:grid-cols-2">
								{KIND_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										className={buttonClass(draft.kind === option.value)}
										onClick={() => selectKind(option.value)}
									>
										<div className="text-base font-semibold text-neutral-950">{option.label}</div>
										<p className="mt-2 text-sm text-neutral-600">{option.description}</p>
									</button>
								))}
							</div>
						</div>
					)}

					{step === 2 && (
						<div className="space-y-4">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">
									Choose a starting preset
								</h2>
								<p className="mt-2 text-sm text-neutral-600">
									Start with the closest match. We will fill in the usual setup for you so you
									mostly just need to confirm the amount.
								</p>
							</div>
							<div className="grid gap-4 md:grid-cols-2">
								{filteredPresets.map((preset) => (
									<button
										key={preset.key}
										type="button"
										className={buttonClass(draft.presetKey === preset.key)}
										onClick={() => selectPreset(preset)}
									>
										<div className="text-base font-semibold text-neutral-950">{preset.label}</div>
										<p className="mt-2 text-sm text-neutral-600">{preset.description}</p>
									</button>
								))}
							</div>
						</div>
					)}

					{step === 3 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">Set the amount</h2>
								<p className="mt-2 text-sm text-neutral-600">
									We already filled the common setup for{" "}
									<strong className="font-semibold text-neutral-900">
										{selectedPreset?.label ?? "this charge"}
									</strong>
									. Most of the time you only need to confirm the amount and how guests will see it.
								</p>
							</div>

							<div className="space-y-3">
								<span className="text-sm font-medium text-neutral-700">
									How is this charge set up?
								</span>
								<div className="grid gap-3 md:grid-cols-2">
									{CALCULATION_OPTIONS.map((option) => (
										<button
											key={option.value}
											type="button"
											className={buttonClass(draft.calculationType === option.value)}
											onClick={() => setCalculationType(option.value)}
										>
											<div className="text-base font-semibold text-neutral-950">
												{option.value === "percentage" ? "Percentage of price" : "Fixed amount"}
											</div>
											<p className="mt-2 text-sm text-neutral-600">{option.helper}</p>
										</button>
									))}
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">
										{draft.calculationType === "percentage" ? "Percentage amount" : "Charge amount"}
									</span>
									<input
										type="number"
										min="0"
										step="0.01"
										value={draft.value}
										onChange={(event) => updateDraft({ value: event.target.value })}
										placeholder={draft.calculationType === "percentage" ? "10" : "25.00"}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>

								{draft.calculationType === "fixed" && (
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-neutral-700">Currency</span>
										<select
											value={draft.currency}
											onChange={(event) => updateDraft({ currency: event.target.value })}
											className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
										>
											<option value="USD">USD</option>
											<option value="EUR">EUR</option>
											<option value="CLP">CLP</option>
											<option value="ARS">ARS</option>
										</select>
									</label>
								)}
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<span className="text-sm font-medium text-neutral-700">
										How should guests see it?
									</span>
									<div className="grid gap-3">
										{INCLUDED_OPTIONS.map((option) => (
											<button
												key={option.value}
												type="button"
												className={buttonClass(draft.inclusionType === option.value)}
												onClick={() => updateDraft({ inclusionType: option.value })}
											>
												<div className="text-base font-semibold text-neutral-950">
													{option.label}
												</div>
												<p className="mt-2 text-sm text-neutral-600">{option.helper}</p>
											</button>
										))}
									</div>
								</div>

								<div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
									<p className="text-sm font-medium text-neutral-700">Current setup</p>
									<dl className="mt-3 space-y-3 text-sm text-neutral-700">
										<div className="flex items-center justify-between gap-4">
											<dt>Type</dt>
											<dd className="font-medium text-neutral-950">
												{draft.kind === "tax" ? "Tax" : "Fee"}
											</dd>
										</div>
										<div className="flex items-center justify-between gap-4">
											<dt>Preset</dt>
											<dd className="font-medium text-neutral-950">
												{selectedPreset?.label ?? "Custom"}
											</dd>
										</div>
										<div className="flex items-center justify-between gap-4">
											<dt>Frequency</dt>
											<dd className="font-medium text-neutral-950">
												{APPLIES_PER_OPTIONS.find((item) => item.value === draft.appliesPer)?.label}
											</dd>
										</div>
									</dl>
									<p className="mt-4 text-xs text-neutral-500">
										Need to change how often this applies? You can adjust it in the advanced step.
									</p>
								</div>
							</div>
						</div>
					)}

					{step === 4 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">
									Choose where it will apply
								</h2>
								<p className="mt-2 text-sm text-neutral-600">
									The preview API needs the product context, and the final assignment will use the
									selected scope.
								</p>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								{SCOPE_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										className={buttonClass(draft.scope === option.value)}
										onClick={() => updateDraft({ scope: option.value })}
									>
										<div className="text-base font-semibold text-neutral-950">{option.label}</div>
										<p className="mt-2 text-sm text-neutral-600">{option.helper}</p>
									</button>
								))}
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">Scope ID</span>
									<input
										value={draft.scopeId}
										onChange={(event) => updateDraft({ scopeId: event.target.value })}
										placeholder={
											draft.scope === "product"
												? "prod_123"
												: draft.scope === "variant"
													? "var_123"
													: draft.scope === "rate_plan"
														? "rp_123"
														: "provider_id"
										}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">
										Product ID for preview
									</span>
									<input
										value={draft.productId}
										onChange={(event) => updateDraft({ productId: event.target.value })}
										placeholder="prod_123"
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>

								<label className="flex flex-col gap-2 md:col-span-2">
									<span className="text-sm font-medium text-neutral-700">Channel (optional)</span>
									<input
										value={draft.channel}
										onChange={(event) => updateDraft({ channel: event.target.value })}
										placeholder="web"
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>
							</div>
						</div>
					)}

					{step === 5 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">Advanced details</h2>
								<p className="mt-2 text-sm text-neutral-600">
									Only adjust these if you need something more specific. We will save the definition
									first, then run a real preview before assignment.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">Charge name</span>
									<input
										value={draft.name}
										onChange={(event) => updateDraft({ name: event.target.value, code: "" })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">
										How often does it apply?
									</span>
									<select
										value={draft.appliesPer}
										onChange={(event) =>
											updateDraft({ appliesPer: event.target.value as AppliesPer })
										}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									>
										{APPLIES_PER_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									<p className="text-xs text-neutral-500">
										Most presets already set this correctly. Change it only if your charge works
										differently.
									</p>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">
										Effective from (optional)
									</span>
									<input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.effectiveFrom}
										onChange={(event) => updateDraft({ effectiveFrom: event.target.value })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>

								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">
										Effective to (optional)
									</span>
									<input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.effectiveTo}
										onChange={(event) => updateDraft({ effectiveTo: event.target.value })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>
							</div>

							<div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
								<p className="font-medium text-neutral-900">Internal fields are handled for you</p>
								<p className="mt-1">
									Code and priority are generated internally. You only need to confirm how guests
									should see the charge.
								</p>
							</div>
						</div>
					)}

					{step === 6 && (
						<div className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-neutral-950">
									Run real backend preview
								</h2>
								<p className="mt-2 text-sm text-neutral-600">
									This preview comes directly from the live CAPA 7 backend. It helps you check how
									the price will look to guests before you assign the charge.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">Base amount</span>
									<input
										type="number"
										step="0.01"
										value={draft.base}
										onChange={(event) => updateDraft({ base: event.target.value })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">Check-in</span>
									<input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.checkIn}
										onChange={(event) => updateDraft({ checkIn: event.target.value })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>
								<label className="flex flex-col gap-2">
									<span className="text-sm font-medium text-neutral-700">Check-out</span>
									<input
										type="text"
										placeholder="AAAA-MM-DD"
										pattern="\\d{4}-\\d{2}-\\d{2}"
										value={draft.checkOut}
										onChange={(event) => updateDraft({ checkOut: event.target.value })}
										className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
									/>
								</label>
								<div className="grid gap-4 sm:grid-cols-2">
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-neutral-700">Adults</span>
										<input
											type="number"
											min="0"
											value={draft.adults}
											onChange={(event) => updateDraft({ adults: event.target.value })}
											className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
										/>
									</label>
									<label className="flex flex-col gap-2">
										<span className="text-sm font-medium text-neutral-700">Children</span>
										<input
											type="number"
											min="0"
											value={draft.children}
											onChange={(event) => updateDraft({ children: event.target.value })}
											className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-emerald-600"
										/>
									</label>
								</div>
							</div>

							<div className="flex flex-wrap gap-3">
								<button
									type="button"
									onClick={() => void runPreview()}
									disabled={isPreviewLoading || !definitionId || !draft.productId.trim()}
									className="rounded-full bg-neutral-950 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
								>
									{isPreviewLoading ? "Running preview..." : "Run preview"}
								</button>
								{editingDefinitionId && (
									<span className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-600">
										Editing mode: definition updates only. Assignment is separate.
									</span>
								)}
							</div>

							{previewResult && (
								<div className="space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
									<div className="rounded-2xl bg-white p-4">
										<p className="text-sm font-medium text-neutral-700">Price</p>
										<p className="mt-1 text-2xl font-semibold text-neutral-950">
											{formatMoney(previewResult.breakdown.base, previewCurrency)}
										</p>
										<div className="mt-3 flex flex-wrap gap-2">
											{previewResult.flags.hasIncluded && (
												<span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
													Includes charges
												</span>
											)}
											{previewResult.flags.hasExcluded && (
												<span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
													More charges at checkout
												</span>
											)}
										</div>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<h3 className="text-sm font-semibold text-neutral-900">Included in price</h3>
											<ul className="mt-2 space-y-2 text-sm text-neutral-700">
												{includedLines.length === 0 ? (
													<li className="rounded-2xl bg-white px-3 py-2">
														Nothing extra is included here.
													</li>
												) : (
													includedLines.map((line, index) => (
														<li
															key={`${line.code}-included-${index}`}
															className="flex items-center justify-between gap-4 rounded-2xl bg-white px-3 py-2"
														>
															<div>
																<p className="font-medium text-neutral-900">{line.name}</p>
																<p className="text-xs text-neutral-500">
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
											<h3 className="text-sm font-semibold text-neutral-900">Additional charges</h3>
											<ul className="mt-2 space-y-2 text-sm text-neutral-700">
												{excludedLines.length === 0 ? (
													<li className="rounded-2xl bg-white px-3 py-2">
														No extra charges will be added later.
													</li>
												) : (
													excludedLines.map((line, index) => (
														<li
															key={`${line.code}-excluded-${index}`}
															className="flex items-center justify-between gap-4 rounded-2xl bg-white px-3 py-2"
														>
															<div>
																<p className="font-medium text-neutral-900">{line.name}</p>
																<p className="text-xs text-neutral-500">
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

									<div className="rounded-2xl bg-white p-4">
										<p className="text-sm font-medium text-neutral-700">Total</p>
										<p className="mt-1 text-2xl font-semibold text-neutral-950">
											{formatMoney(previewResult.total, previewCurrency)}
										</p>
									</div>
								</div>
							)}
						</div>
					)}

					<div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5">
						<div className="flex gap-3">
							<button
								type="button"
								onClick={previousStep}
								disabled={
									step === 1 || isSavingDefinition || isPreviewLoading || isSavingAssignment
								}
								className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Back
							</button>
							<button
								type="button"
								onClick={() => {
									resetWizard()
									props.onCancel?.()
								}}
								disabled={isSavingDefinition || isPreviewLoading || isSavingAssignment}
								className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Reset
							</button>
						</div>

						<div className="flex gap-3">
							{step < 6 && (
								<button
									type="button"
									onClick={nextStep}
									disabled={!stepValid || isSavingDefinition}
									className="rounded-full bg-neutral-950 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
								>
									{step === 5 ? (isSavingDefinition ? "Saving..." : "Save definition") : "Next"}
								</button>
							)}

							{step === 6 && !editingDefinitionId && (
								<button
									type="button"
									onClick={() => void saveAssignment()}
									disabled={!hasSuccessfulPreview || !definitionId || isSavingAssignment}
									className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
								>
									{isSavingAssignment ? "Saving..." : "Save and assign"}
								</button>
							)}

							{step === 6 && editingDefinitionId && (
								<button
									type="button"
									onClick={() => {
										setSuccessMessage("Definition changes saved.")
										void refreshDefinitions()
										props.onEditingComplete?.("Tax or fee updated successfully.")
									}}
									disabled={!hasSuccessfulPreview}
									className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
								>
									Finish editing
								</button>
							)}
						</div>
					</div>
				</section>
			</section>
		</div>
	)
}
