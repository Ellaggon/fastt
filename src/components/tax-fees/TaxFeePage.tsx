import { useState } from "react"

import TaxFeeWizard, {
	type ApiWarning,
	type DefinitionSummary,
	type TaxFeeWizardMode,
} from "./TaxFeeWizard"
import { Badge, Button, Card, Notice } from "../ui-react"

type TaxFeePageProps = {
	initialDefinitions: DefinitionSummary[]
	initialWarnings: ApiWarning[]
	initialMode?: PageMode
}

type PageMode = "idle" | "creating" | "editing"

function formatDefinitionValue(definition: DefinitionSummary) {
	if (definition.calculationType === "percentage") return `${definition.value}%`
	return `${definition.currency ?? "USD"} ${definition.value}`
}

function formatAppliesPer(value: DefinitionSummary["appliesPer"]) {
	switch (value) {
		case "stay":
			return "Per stay"
		case "night":
			return "Per night"
		case "guest":
			return "Per guest"
		case "guest_night":
			return "Per guest per night"
	}
}

function warningTitle(code: string) {
	switch (code) {
		case "high_percentage":
			return "Check the amount"
		case "overlap_detected":
			return "Possible overlap"
		case "duplicate_code":
			return "Similar charge already exists"
		default:
			return "Please review"
	}
}

export default function TaxFeePage(props: TaxFeePageProps) {
	const [mode, setMode] = useState<PageMode>(props.initialMode ?? "idle")
	const [selectedDefinition, setSelectedDefinition] = useState<DefinitionSummary | null>(null)
	const [definitions, setDefinitions] = useState<DefinitionSummary[]>(props.initialDefinitions)
	const [warnings, setWarnings] = useState<ApiWarning[]>(props.initialWarnings)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)

	const hasDefinitions = Array.isArray(definitions) && definitions.length > 0
	const wizardMode: TaxFeeWizardMode = mode === "editing" ? "editing" : "creating"

	function startCreating() {
		setSelectedDefinition(null)
		setSuccessMessage(null)
		setMode("creating")
	}

	function startEditing(definition: DefinitionSummary) {
		setSelectedDefinition(definition)
		setSuccessMessage(null)
		setMode("editing")
	}

	return (
		<section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
			<Notice variant="error" className="xl:col-span-2">
				DEBUG: TaxFeePage is rendering. definitions={definitions.length} mode={mode}
			</Notice>
			<Card as="aside">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-slate-500 uppercase">Definitions</p>
						<h2 className="mt-2 text-2xl font-semibold text-slate-950">Existing taxes & fees</h2>
					</div>
					<Button type="button" onClick={startCreating}>
						Create tax or fee
					</Button>
				</div>

				{warnings.length > 0 && (
					<Notice variant="warning" title="Needs attention" className="mb-4">
						<div className="mt-3 space-y-3">
							{warnings.map((warning, index) => (
								<div key={`${warning.code}-${index}`}>
									<p className="font-medium">{warningTitle(warning.code)}</p>
									<p className="mt-1">{warning.message}</p>
								</div>
							))}
						</div>
					</Notice>
				)}

				{!hasDefinitions ? (
					<div className="fastt-empty-state rounded-[var(--fastt-radius-card)] border border-dashed border-slate-300 bg-slate-50 p-5">
						<h3 className="text-lg font-semibold text-slate-950">
							No taxes or fees configured yet
						</h3>
						<p className="mt-2 text-sm leading-6 text-slate-600">
							Agrega impuestos o cargos para que los huéspedes vean precios correctos antes de
							reservar.
						</p>
						<Button type="button" onClick={startCreating} className="mt-4">
							Create tax or fee
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{definitions.map((definition) => (
							<div
								key={definition.id}
								className="fastt-row-card rounded-[var(--fastt-radius-card)] border border-slate-200 p-4"
							>
								<div className="flex items-start justify-between gap-4">
									<div>
										<Badge variant="neutral">{definition.kind === "tax" ? "Tax" : "Fee"}</Badge>
										<h3 className="mt-2 text-lg font-semibold text-slate-950">{definition.name}</h3>
										<p className="mt-1 text-sm text-slate-600">
											{definition.inclusionType === "included"
												? "Included in price"
												: "Added at checkout"}
										</p>
									</div>
									<Button
										type="button"
										onClick={() => startEditing(definition)}
										variant="secondary"
										size="sm"
									>
										Edit
									</Button>
								</div>
								<p className="mt-3 text-sm text-slate-700">
									{formatDefinitionValue(definition)} · {formatAppliesPer(definition.appliesPer)}
								</p>
							</div>
						))}
					</div>
				)}
			</Card>

			<div>
				{successMessage && (
					<Notice variant="success" className="mb-4">
						{successMessage}
					</Notice>
				)}

				{mode === "idle" ? (
					<Card className="border-dashed border-slate-300 bg-white/90 p-8">
						<p className="text-xs font-semibold text-slate-500 uppercase">Wizard</p>
						<h2 className="mt-3 text-2xl font-semibold text-slate-950">
							{hasDefinitions
								? "Create a new tax or fee, or edit an existing one"
								: "Start your first tax or fee"}
						</h2>
						<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
							{hasDefinitions
								? "Use the create button to add something new, or choose Edit on any item to reopen it in the wizard."
								: "Use the button below to open the wizard. We will guide you step by step from preset to preview."}
						</p>
						<Button type="button" onClick={startCreating} className="mt-6">
							Create tax or fee
						</Button>
					</Card>
				) : (
					<TaxFeeWizard
						initialDefinitions={definitions}
						initialWarnings={warnings}
						initialMode={wizardMode}
						initialDefinitionId={selectedDefinition?.id ?? null}
						showDefinitionsSidebar={false}
						onDefinitionsChange={(nextDefinitions, nextWarnings) => {
							setDefinitions(nextDefinitions)
							setWarnings(nextWarnings)
						}}
						onAssignmentSuccess={(message) => {
							setMode("idle")
							setSelectedDefinition(null)
							setSuccessMessage(message)
						}}
						onEditingComplete={(message) => {
							setMode("idle")
							setSelectedDefinition(null)
							setSuccessMessage(message)
						}}
						onCancel={() => {
							setMode("idle")
							setSelectedDefinition(null)
						}}
					/>
				)}
			</div>
		</section>
	)
}
