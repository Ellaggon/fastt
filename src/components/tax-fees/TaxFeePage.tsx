import { useState } from "react"

import TaxFeeWizard, {
	type ApiWarning,
	type DefinitionSummary,
	type TaxFeeWizardMode,
} from "./TaxFeeWizard"

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
			<div className="rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 xl:col-span-2">
				DEBUG: TaxFeePage is rendering. definitions={definitions.length} mode={mode}
			</div>
			<aside className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
							Definitions
						</p>
						<h2 className="mt-2 text-2xl font-semibold text-neutral-950">Existing taxes & fees</h2>
					</div>
					<button
						type="button"
						onClick={startCreating}
						className="rounded-full bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
					>
						Create tax or fee
					</button>
				</div>

				{warnings.length > 0 && (
					<div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
						<p className="font-semibold">Needs attention</p>
						<div className="mt-3 space-y-3">
							{warnings.map((warning, index) => (
								<div key={`${warning.code}-${index}`}>
									<p className="font-medium">{warningTitle(warning.code)}</p>
									<p className="mt-1">{warning.message}</p>
								</div>
							))}
						</div>
					</div>
				)}

				{!hasDefinitions ? (
					<div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-5">
						<h3 className="text-lg font-semibold text-neutral-950">
							No taxes or fees configured yet
						</h3>
						<p className="mt-2 text-sm leading-6 text-neutral-600">
							Add taxes or fees here so guests can see accurate pricing before they book.
						</p>
						<button
							type="button"
							onClick={startCreating}
							className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
						>
							Create tax or fee
						</button>
					</div>
				) : (
					<div className="space-y-3">
						{definitions.map((definition) => (
							<div key={definition.id} className="rounded-3xl border border-neutral-200 p-4">
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
											{definition.kind === "tax" ? "Tax" : "Fee"}
										</p>
										<h3 className="mt-1 text-lg font-semibold text-neutral-950">
											{definition.name}
										</h3>
										<p className="mt-1 text-sm text-neutral-600">
											{definition.inclusionType === "included"
												? "Included in price"
												: "Added at checkout"}
										</p>
									</div>
									<button
										type="button"
										onClick={() => startEditing(definition)}
										className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-950"
									>
										Edit
									</button>
								</div>
								<p className="mt-3 text-sm text-neutral-700">
									{formatDefinitionValue(definition)} · {formatAppliesPer(definition.appliesPer)}
								</p>
							</div>
						))}
					</div>
				)}
			</aside>

			<div>
				{successMessage && (
					<div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
						{successMessage}
					</div>
				)}

				{mode === "idle" ? (
					<section className="rounded-[2rem] border border-dashed border-neutral-300 bg-white/80 p-8 shadow-sm">
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
							Wizard
						</p>
						<h2 className="mt-3 text-2xl font-semibold text-neutral-950">
							{hasDefinitions
								? "Create a new tax or fee, or edit an existing one"
								: "Start your first tax or fee"}
						</h2>
						<p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
							{hasDefinitions
								? "Use the create button to add something new, or choose Edit on any item to reopen it in the wizard."
								: "Use the button below to open the wizard. We will guide you step by step from preset to preview."}
						</p>
						<button
							type="button"
							onClick={startCreating}
							className="mt-6 rounded-full bg-neutral-950 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
						>
							Create tax or fee
						</button>
					</section>
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
