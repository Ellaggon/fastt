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
			return "Por estadía"
		case "night":
			return "Por noche"
		case "guest":
			return "Por huésped"
		case "guest_night":
			return "Por huésped por noche"
	}
}

function warningTitle(code: string) {
	switch (code) {
		case "high_percentage":
			return "Revisar monto"
		case "overlap_detected":
			return "Posible solapamiento"
		case "duplicate_code":
			return "Ya existe un cargo similar"
		default:
			return "Requiere revisión"
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
			<Card as="aside">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-slate-500 uppercase">Definiciones</p>
						<h2 className="mt-2 text-2xl font-semibold text-slate-950">
							Impuestos y cargos existentes
						</h2>
					</div>
					{hasDefinitions && (
						<Button type="button" onClick={startCreating}>
							Crear
						</Button>
					)}
				</div>

				{warnings.length > 0 && (
					<Notice variant="warning" title="Requiere atención" className="mb-4">
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
							Aún no hay impuestos ni cargos configurados
						</h3>
						<p className="mt-2 text-sm leading-6 text-slate-600">
							Agrega impuestos o cargos para que los huéspedes vean precios correctos antes de
							reservar.
						</p>
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
										<Badge variant="neutral">
											{definition.kind === "tax" ? "Impuesto" : "Cargo"}
										</Badge>
										<h3 className="mt-2 text-lg font-semibold text-slate-950">{definition.name}</h3>
										<p className="mt-1 text-sm text-slate-600">
											{definition.inclusionType === "included"
												? "Incluido en el precio"
												: "Se agrega al confirmar"}
										</p>
									</div>
									<Button
										type="button"
										onClick={() => startEditing(definition)}
										variant="secondary"
										size="sm"
									>
										Editar
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
						<p className="text-xs font-semibold text-slate-500 uppercase">Asistente</p>
						<h2 className="mt-3 text-2xl font-semibold text-slate-950">
							{hasDefinitions
								? "Crea una regla nueva o edita una existente"
								: "Crea tu primer impuesto o cargo"}
						</h2>
						<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
							{hasDefinitions
								? "Usa Crear en el encabezado de definiciones para agregar una regla nueva, o Editar para revisar una existente."
								: "El asistente te guía desde el preset hasta una vista previa real antes de asignar."}
						</p>
						{!hasDefinitions && (
							<Button type="button" onClick={startCreating} className="mt-6">
								Crear impuesto o cargo
							</Button>
						)}
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
