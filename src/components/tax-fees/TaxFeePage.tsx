import { useEffect, useMemo, useState } from "react"

import TaxFeeWizard, {
	type ApiWarning,
	type DefinitionSummary,
	type TaxFeeScopeResources,
	type TaxFeeWizardMode,
	type TaxFeeSuggestedDraft,
} from "./TaxFeeWizard"
import FiscalReviewCenter from "./FiscalReviewCenter"
import { Badge, Button, Card, IconButton, Input, Notice, Select } from "../ui-react"

type TaxFeePageProps = {
	initialDefinitions: DefinitionSummary[]
	initialWarnings: ApiWarning[]
	initialMode?: PageMode
	initialDefinitionId?: string | null
	initialDuplicateDefinitionId?: string | null
	canManageFiscality: boolean
	initialResources: TaxFeeScopeResources
	initialSuggestion?: TaxFeeSuggestedDraft | null
	initialReview?: boolean
}

type PageMode = "idle" | "creating" | "editing"
type SavedDraftSummary = { id: string; name: string }
type SimulationCertification = {
	isCurrent: boolean
	quoteId: string | null
	issuedAt: string | null
}

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

function statusLabel(status: DefinitionSummary["operationalStatus"]) {
	return {
		draft: "Borrador",
		active: "Activa",
		paused: "Pausada",
		scheduled: "Programada",
		expired: "Vencida",
		conflict: "En conflicto",
		archived: "Archivada",
	}[status ?? "draft"]
}

function scopeLabel(
	assignment: NonNullable<DefinitionSummary["assignments"]>[number],
	resources: TaxFeeScopeResources
) {
	if (assignment.scope === "provider") return "Toda la cuenta"
	if (assignment.scope === "product") {
		return resources.products.find((item) => item.id === assignment.scopeId)?.label ?? "Producto"
	}
	if (assignment.scope === "variant") {
		return resources.variants.find((item) => item.id === assignment.scopeId)?.label ?? "Unidad"
	}
	return resources.ratePlans.find((item) => item.id === assignment.scopeId)?.label ?? "Tarifa"
}

function auditLabel(action: string) {
	return (
		{
			tax_fee_definition_created: "Definición creada",
			tax_fee_definition_updated: "Definición actualizada",
			tax_fee_definition_archived: "Definición archivada",
			tax_fee_assignment_created: "Asignación publicada",
			tax_fee_assignment_paused: "Asignación pausada",
			tax_fee_assignment_reactivated: "Asignación reactivada",
		}[action] ?? "Cambio registrado"
	)
}

function jurisdictionLabel(definition: DefinitionSummary) {
	const jurisdiction = definition.jurisdictionJson as {
		country?: string
		region?: string
		city?: string
	} | null
	return (
		[jurisdiction?.country, jurisdiction?.region, jurisdiction?.city].filter(Boolean).join(" · ") ||
		"Sin definir"
	)
}

function definitionSubtitle(definition: DefinitionSummary) {
	return `${definition.kind === "tax" ? "Impuesto" : "Cargo"} · ${formatDefinitionValue(definition)} · ${formatAppliesPer(definition.appliesPer)}`
}

function canDeleteDraft(definition: DefinitionSummary) {
	return (
		definition.operationalStatus === "draft" &&
		!definition.currentVersion &&
		(definition.assignments?.length ?? 0) === 0
	)
}

function responsibilityLabel(definition: DefinitionSummary) {
	const jurisdiction = definition.jurisdictionJson as { collectionResponsibility?: string } | null
	return (
		{ provider: "Proveedor", platform: "Plataforma", marketplace: "Marketplace" }[
			jurisdiction?.collectionResponsibility ?? "provider"
		] ?? "Proveedor"
	)
}

export default function TaxFeePage(props: TaxFeePageProps) {
	const [mode, setMode] = useState<PageMode>(
		props.canManageFiscality ? (props.initialMode ?? "idle") : "idle"
	)
	const [selectedDefinition, setSelectedDefinition] = useState<DefinitionSummary | null>(
		props.initialDefinitionId
			? (props.initialDefinitions.find(
					(definition) => definition.id === props.initialDefinitionId
				) ?? null)
			: null
	)
	const [definitions, setDefinitions] = useState<DefinitionSummary[]>(props.initialDefinitions)
	const [warnings, setWarnings] = useState<ApiWarning[]>(props.initialWarnings)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)
	const [operationError, setOperationError] = useState<string | null>(null)
	const [isUpdatingAssignment, setIsUpdatingAssignment] = useState<string | null>(null)
	const [inspectedDefinition, setInspectedDefinition] = useState<DefinitionSummary | null>(null)
	const [query, setQuery] = useState("")
	const [statusFilter, setStatusFilter] = useState("all")
	const [kindFilter, setKindFilter] = useState("all")
	const [jurisdictionFilter, setJurisdictionFilter] = useState("all")
	const [responsibilityFilter, setResponsibilityFilter] = useState("all")
	const [validityFilter, setValidityFilter] = useState("all")
	const [filtersOpen, setFiltersOpen] = useState(false)
	const [savedDraftSummary, setSavedDraftSummary] = useState<SavedDraftSummary | null>(null)
	const [simulationCertification, setSimulationCertification] =
		useState<SimulationCertification | null>(null)
	const [isCheckingSimulationCertification, setIsCheckingSimulationCertification] = useState(false)

	const hasDefinitions = Array.isArray(definitions) && definitions.length > 0
	const wizardMode: TaxFeeWizardMode = mode === "editing" ? "editing" : "creating"
	const inspectedRuleIsComplete = Boolean(
		inspectedDefinition &&
		inspectedDefinition.name.trim() &&
		inspectedDefinition.calculationType &&
		Number(inspectedDefinition.value) > 0 &&
		jurisdictionLabel(inspectedDefinition) !== "Sin definir"
	)
	const inspectedSimulatorHref = inspectedDefinition
		? `/provider/settings/tax-fees/simulator?definitionId=${encodeURIComponent(inspectedDefinition.id)}&returnTo=${encodeURIComponent(`/provider/settings/tax-fees?edit=${inspectedDefinition.id}&review=1`)}`
		: ""
	const inspectedReviewHref = inspectedDefinition
		? `/provider/settings/tax-fees?edit=${encodeURIComponent(inspectedDefinition.id)}&review=1`
		: ""

	useEffect(() => {
		if (!inspectedDefinition || inspectedDefinition.operationalStatus !== "draft") {
			setSimulationCertification(null)
			setIsCheckingSimulationCertification(false)
			return
		}
		let cancelled = false
		setSimulationCertification(null)
		setIsCheckingSimulationCertification(true)
		void fetch(
			`/api/provider/tax-fees/simulation-certification?definitionId=${encodeURIComponent(inspectedDefinition.id)}`
		)
			.then(async (response) => {
				if (!response.ok) throw new Error("No se pudo consultar la certificación")
				return (await response.json()) as SimulationCertification
			})
			.then((result) => {
				if (!cancelled) setSimulationCertification(result)
			})
			.catch(() => {
				if (!cancelled) setSimulationCertification(null)
			})
			.finally(() => {
				if (!cancelled) setIsCheckingSimulationCertification(false)
			})
		return () => {
			cancelled = true
		}
	}, [inspectedDefinition?.id, inspectedDefinition?.operationalStatus])
	const availableJurisdictions = useMemo(
		() => [
			...new Set(definitions.map(jurisdictionLabel).filter((value) => value !== "Sin definir")),
		],
		[definitions]
	)
	const visibleDefinitions = useMemo(() => {
		const normalized = query.trim().toLowerCase()
		return definitions.filter((definition) => {
			const matchesText =
				!normalized || `${definition.name} ${definition.code}`.toLowerCase().includes(normalized)
			const matchesStatus = statusFilter === "all" || definition.operationalStatus === statusFilter
			const matchesKind = kindFilter === "all" || definition.kind === kindFilter
			const matchesJurisdiction =
				jurisdictionFilter === "all" || jurisdictionLabel(definition) === jurisdictionFilter
			const matchesResponsibility =
				responsibilityFilter === "all" || responsibilityLabel(definition) === responsibilityFilter
			const matchesValidity =
				validityFilter === "all" ||
				(validityFilter === "dated"
					? Boolean(definition.effectiveFrom || definition.effectiveTo)
					: !definition.effectiveFrom && !definition.effectiveTo)
			return (
				matchesText &&
				matchesStatus &&
				matchesKind &&
				matchesJurisdiction &&
				matchesResponsibility &&
				matchesValidity
			)
		})
	}, [
		definitions,
		query,
		statusFilter,
		kindFilter,
		jurisdictionFilter,
		responsibilityFilter,
		validityFilter,
	])

	function startCreating() {
		if (!props.canManageFiscality) return
		setSelectedDefinition(null)
		setSuccessMessage(null)
		setSavedDraftSummary(null)
		setMode("creating")
	}

	function clearFilters() {
		setQuery("")
		setStatusFilter("all")
		setKindFilter("all")
		setJurisdictionFilter("all")
		setResponsibilityFilter("all")
		setValidityFilter("all")
	}

	function startEditing(definition: DefinitionSummary) {
		if (!props.canManageFiscality) return
		setSelectedDefinition(definition)
		setSuccessMessage(null)
		setSavedDraftSummary(null)
		setMode("editing")
	}

	function startDuplicating(definition: DefinitionSummary) {
		if (!props.canManageFiscality) return
		setSelectedDefinition(definition)
		setInspectedDefinition(null)
		setSavedDraftSummary(null)
		setMode("creating")
	}

	async function updateAssignmentStatus(assignmentId: string, status: "active" | "archived") {
		if (!props.canManageFiscality) return
		setIsUpdatingAssignment(assignmentId)
		setSuccessMessage(null)
		setOperationError(null)
		try {
			const form = new FormData()
			form.set("assignmentId", assignmentId)
			form.set("status", status)
			const response = await fetch("/api/provider/tax-fees/assignments", {
				method: "PUT",
				body: form,
			})
			if (!response.ok) throw new Error("No se pudo actualizar la asignación.")
			setDefinitions((current) =>
				current.map((definition) => ({
					...definition,
					assignments: definition.assignments?.map((assignment) =>
						assignment.id === assignmentId ? { ...assignment, status } : assignment
					),
					operationalStatus:
						definition.operationalStatus === "scheduled" ||
						definition.operationalStatus === "expired"
							? definition.operationalStatus
							: definition.status === "archived"
								? "archived"
								: (definition.assignments ?? []).some((assignment) =>
											assignment.id === assignmentId
												? status === "active"
												: assignment.status === "active"
									  )
									? "active"
									: (definition.assignments ?? []).length
										? "paused"
										: "draft",
				}))
			)
			setSuccessMessage(status === "active" ? "Asignación reactivada." : "Asignación pausada.")
		} catch (error) {
			setOperationError(
				error instanceof Error ? error.message : "No se pudo actualizar la asignación."
			)
		} finally {
			setIsUpdatingAssignment(null)
		}
	}

	async function updateDefinitionStatus(
		definition: DefinitionSummary,
		status: "active" | "archived"
	) {
		if (!props.canManageFiscality) return
		setIsUpdatingAssignment(`definition:${definition.id}`)
		setSuccessMessage(null)
		setOperationError(null)
		try {
			const form = new FormData()
			form.set("id", definition.id)
			form.set("code", definition.code)
			form.set("name", definition.name)
			form.set("kind", definition.kind)
			form.set("calculationType", definition.calculationType)
			form.set("value", String(definition.value))
			if (definition.calculationType === "fixed" && definition.currency)
				form.set("currency", definition.currency)
			form.set("inclusionType", definition.inclusionType)
			form.set("appliesPer", definition.appliesPer)
			form.set("priority", String(definition.priority))
			form.set("status", status)
			if (definition.jurisdictionJson)
				form.set("jurisdictionJson", JSON.stringify(definition.jurisdictionJson))
			if (definition.effectiveFrom) form.set("effectiveFrom", definition.effectiveFrom)
			if (definition.effectiveTo) form.set("effectiveTo", definition.effectiveTo)
			const response = await fetch("/api/provider/tax-fees/definitions", {
				method: "PUT",
				body: form,
			})
			if (!response.ok) throw new Error("No se pudo actualizar el estado de la definición.")
			setDefinitions((current) =>
				current.map((item) =>
					item.id === definition.id
						? {
								...item,
								status,
								operationalStatus:
									status === "archived"
										? "archived"
										: (item.assignments ?? []).some((assignment) => assignment.status === "active")
											? "active"
											: (item.assignments ?? []).length
												? "paused"
												: "draft",
								revision: (item.revision ?? 1) + 1,
								lastChangedAt: new Date().toISOString(),
							}
						: item
				)
			)
			setSuccessMessage(status === "archived" ? "Definición archivada." : "Definición reactivada.")
		} catch (error) {
			setOperationError(
				error instanceof Error ? error.message : "No se pudo actualizar el estado de la definición."
			)
		} finally {
			setIsUpdatingAssignment(null)
		}
	}

	async function deleteDraft(definition: DefinitionSummary) {
		if (!props.canManageFiscality || !canDeleteDraft(definition)) return
		if (
			!window.confirm(
				`Eliminar el borrador “${definition.name}”? No tiene versiones publicadas ni asignaciones. Esta acción no modificará ventas ni reservas.`
			)
		)
			return
		setIsUpdatingAssignment(`definition:${definition.id}`)
		setSuccessMessage(null)
		setOperationError(null)
		try {
			const response = await fetch(
				`/api/provider/tax-fees/definitions?id=${encodeURIComponent(definition.id)}`,
				{ method: "DELETE" }
			)
			if (!response.ok) {
				const body = await response.json().catch(() => null)
				throw new Error(body?.message ?? "No se pudo eliminar el borrador.")
			}
			setDefinitions((current) => current.filter((item) => item.id !== definition.id))
			setInspectedDefinition(null)
			setSuccessMessage("Borrador eliminado.")
		} catch (error) {
			setOperationError(error instanceof Error ? error.message : "No se pudo eliminar el borrador.")
		} finally {
			setIsUpdatingAssignment(null)
		}
	}

	if (mode !== "idle") {
		return (
			<section className="min-w-0">
				<div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
					<div>
						<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
							{savedDraftSummary
								? "Definición guardada"
								: mode === "creating"
									? "Nueva definición"
									: "Editar definición"}
						</p>
						<h2 className="mt-1 text-lg font-semibold text-slate-950">
							{savedDraftSummary?.name ??
								(mode === "creating" ? "Configura una regla fiscal" : selectedDefinition?.name)}
						</h2>
					</div>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							setMode("idle")
							setSelectedDefinition(null)
							setSavedDraftSummary(null)
						}}
					>
						Volver a definiciones
					</Button>
				</div>
				{operationError && (
					<Notice variant="error" className="mb-4">
						{operationError}
					</Notice>
				)}
				<TaxFeeWizard
					initialDefinitions={definitions}
					initialWarnings={warnings}
					initialMode={wizardMode}
					initialResources={props.initialResources}
					initialSuggestion={props.initialSuggestion}
					initialReview={props.initialReview}
					initialDefinitionId={selectedDefinition?.id ?? null}
					initialDuplicateDefinitionId={
						mode === "creating" && selectedDefinition ? selectedDefinition.id : null
					}
					showDefinitionsSidebar={false}
					onDefinitionsChange={(nextDefinitions, nextWarnings) => {
						setDefinitions(nextDefinitions)
						setWarnings(nextWarnings)
					}}
					onEditingComplete={(message) => {
						setMode("idle")
						setSelectedDefinition(null)
						setSavedDraftSummary(null)
						setSuccessMessage(message)
					}}
					onDraftSaved={setSavedDraftSummary}
					onResumeEditing={() => setSavedDraftSummary(null)}
					onCancel={() => {
						setMode("idle")
						setSelectedDefinition(null)
						setSavedDraftSummary(null)
					}}
				/>
			</section>
		)
	}

	return (
		<section className="min-w-0 space-y-5">
			{(operationError || successMessage) && (
				<div className="space-y-4">
					{operationError && <Notice variant="error">{operationError}</Notice>}
					{successMessage && <Notice variant="success">{successMessage}</Notice>}
				</div>
			)}

			<Card as="section" className="fastt-workspace-panel overflow-hidden p-4 text-slate-900">
				<div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
					<div>
						<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
							Definiciones
						</p>
						<h2 className="mt-1 text-lg font-semibold text-slate-950">
							Impuestos y cargos existentes
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							{definitions.length} total ·{" "}
							{definitions.filter((definition) => definition.operationalStatus === "active").length}{" "}
							activas
						</p>
					</div>
					{hasDefinitions && props.canManageFiscality && (
						<Button type="button" onClick={startCreating}>
							Crear
						</Button>
					)}
				</div>

				<FiscalReviewCenter
					definitions={definitions}
					warnings={warnings}
					canManageFiscality={props.canManageFiscality}
					onResolveDefinition={startEditing}
				/>
			</Card>

			{!hasDefinitions ? (
				<Card as="section" className="fastt-workspace-panel overflow-hidden p-4 text-slate-900">
					<div className="fastt-empty-state border border-dashed border-slate-300 bg-slate-50 p-5">
						<h3 className="text-lg font-semibold text-slate-950">
							Aún no hay impuestos ni cargos configurados
						</h3>
						<p className="mt-2 text-sm leading-6 text-slate-600">
							Agrega impuestos o cargos para que los huéspedes vean precios correctos antes de
							reservar.
						</p>
					</div>
				</Card>
			) : (
				<Card as="section" className="fastt-workspace-panel overflow-hidden p-0 text-slate-900">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
						<div className="min-w-56 flex-1">
							<Input
								className="h-9 w-full"
								placeholder="Buscar por nombre o código"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
						<button
							type="button"
							onClick={() => setFiltersOpen(!filtersOpen)}
							aria-expanded={filtersOpen}
							className="fastt-button inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
						>
							Filtros{" "}
							<span className="text-xs text-slate-500">
								{[
									statusFilter,
									kindFilter,
									jurisdictionFilter,
									responsibilityFilter,
									validityFilter,
								].filter((value) => value !== "all").length || ""}
							</span>
						</button>
					</div>
					{filtersOpen && (
						<div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
							<div className="flex flex-wrap items-start justify-between gap-3 sm:col-span-2 lg:col-span-3">
								<div>
									<p className="text-sm font-semibold text-slate-950">
										Filtrar definiciones visibles
									</p>
									<p className="mt-1 text-xs text-slate-500">
										Acota el catálogo sin salir de esta página.
									</p>
								</div>
								<Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
									Limpiar filtros
								</Button>
							</div>
							<label className="grid gap-1 text-xs font-semibold text-slate-500">
								Estado
								<Select
									className="h-9 w-auto"
									value={statusFilter}
									onChange={(event) => setStatusFilter(event.target.value)}
								>
									<option value="all">Todos los estados</option>
									{[
										"active",
										"scheduled",
										"conflict",
										"draft",
										"paused",
										"expired",
										"archived",
									].map((status) => (
										<option key={status} value={status}>
											{statusLabel(status as DefinitionSummary["operationalStatus"])}
										</option>
									))}
								</Select>
							</label>
							<label className="grid gap-1 text-xs font-semibold text-slate-500">
								Tipo
								<Select
									className="h-9 w-auto"
									value={kindFilter}
									onChange={(event) => setKindFilter(event.target.value)}
								>
									<option value="all">Tipo</option>
									<option value="tax">Impuestos</option>
									<option value="fee">Cargos</option>
								</Select>
							</label>
							<label className="grid gap-1 text-xs font-semibold text-slate-500">
								Jurisdicción
								<Select
									className="h-9 w-auto"
									value={jurisdictionFilter}
									onChange={(event) => setJurisdictionFilter(event.target.value)}
								>
									<option value="all">Jurisdicción</option>
									{availableJurisdictions.map((item) => (
										<option key={item} value={item}>
											{item}
										</option>
									))}
								</Select>
							</label>
							<label className="grid gap-1 text-xs font-semibold text-slate-500">
								Responsable de recaudo
								<Select
									className="h-9 w-auto"
									value={responsibilityFilter}
									onChange={(event) => setResponsibilityFilter(event.target.value)}
								>
									<option value="all">Recauda</option>
									<option value="Proveedor">Proveedor</option>
									<option value="Plataforma">Plataforma</option>
									<option value="Marketplace">Marketplace</option>
								</Select>
							</label>
							<label className="grid gap-1 text-xs font-semibold text-slate-500">
								Vigencia
								<Select
									className="h-9 w-auto"
									value={validityFilter}
									onChange={(event) => setValidityFilter(event.target.value)}
								>
									<option value="all">Vigencia</option>
									<option value="dated">Con vigencia</option>
									<option value="open">Sin fecha</option>
								</Select>
							</label>
						</div>
					)}
					<div className="fiscal-definitions-table overflow-x-auto">
						<table className="w-full min-w-[1080px] text-left text-sm">
							<thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-[0.06em] text-slate-500 uppercase">
								<tr>
									<th className="w-[20%] px-4 py-3">Regla</th>
									<th className="w-[8%] px-3 py-3">Tipo</th>
									<th className="w-[12%] px-3 py-3">Cálculo</th>
									<th className="w-[11%] px-3 py-3">Base</th>
									<th className="w-[10%] px-3 py-3">Recauda</th>
									<th className="w-[11%] px-3 py-3">Jurisdicción</th>
									<th className="w-[11%] px-3 py-3">Vigencia</th>
									<th className="w-[7%] px-3 py-3">Asignadas</th>
									<th className="w-[10%] px-3 py-3">Estado</th>
									<th className="px-4 py-3 text-right">Acciones</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{visibleDefinitions.map((definition) => (
									<tr
										key={definition.id}
										className="cursor-pointer hover:bg-slate-50"
										onClick={() => setInspectedDefinition(definition)}
									>
										<td className="px-4 py-4">
											<p className="font-semibold text-slate-950">{definition.name}</p>
											<p className="mt-1 text-xs text-slate-500">
												{definitionSubtitle(definition)}
											</p>
										</td>
										<td className="px-3 py-4 text-slate-600">
											{definition.kind === "tax" ? "Impuesto" : "Cargo"}
										</td>
										<td className="px-3 py-4 text-slate-700">
											<span className="font-semibold text-slate-950">
												{formatDefinitionValue(definition)}
											</span>
											<br />
											<span className="text-xs text-slate-500">
												{formatAppliesPer(definition.appliesPer)}
											</span>
										</td>
										<td className="px-3 py-4 text-slate-600">
											{(definition.jurisdictionJson as any)?.taxableBase === "base_plus_included"
												? "Base + incluidos"
												: "Base de reserva"}
										</td>
										<td className="px-3 py-4 text-slate-600">{responsibilityLabel(definition)}</td>
										<td className="px-3 py-4 text-slate-600">{jurisdictionLabel(definition)}</td>
										<td className="px-3 py-4 text-slate-600">
											{definition.effectiveFrom || definition.effectiveTo
												? `${definition.effectiveFrom ?? "Ahora"} - ${definition.effectiveTo ?? "Sin fin"}`
												: "Continua"}
										</td>
										<td className="px-3 py-4 text-slate-600">
											{definition.assignments?.filter(
												(assignment) => assignment.status === "active"
											).length ?? 0}
										</td>
										<td className="px-3 py-4">
											<Badge
												variant={
													definition.operationalStatus === "conflict"
														? "warning"
														: definition.operationalStatus === "active"
															? "success"
															: "neutral"
												}
											>
												{statusLabel(definition.operationalStatus)}
											</Badge>
										</td>
										<td className="px-4 py-4 text-right">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={(event) => {
													event.stopPropagation()
													setInspectedDefinition(definition)
												}}
											>
												{definition.operationalStatus === "active" ? "Ver" : "Resolver"}
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{visibleDefinitions.length === 0 ? (
						<p className="py-8 text-center text-sm text-slate-500">
							No hay definiciones con estos filtros.
						</p>
					) : null}
				</Card>
			)}

			{inspectedDefinition ? (
				<div
					className="fastt-modal-backdrop fixed inset-0 z-50 flex justify-end bg-slate-950/30"
					role="dialog"
					aria-modal="true"
					aria-label={`Detalle de ${inspectedDefinition.name}`}
				>
					<aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl sm:p-6">
						<div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
									Detalle de regla
								</p>
								<h2 className="mt-1 text-xl font-semibold text-slate-950">
									{inspectedDefinition.name}
								</h2>
								<p className="mt-1 text-sm text-slate-500">
									{inspectedDefinition.currentVersion
										? `Versión ${inspectedDefinition.currentVersion.version}`
										: "Borrador sin publicar"}
								</p>
							</div>
							<IconButton
								label="Cerrar detalle"
								size="sm"
								variant="secondary"
								onClick={() => setInspectedDefinition(null)}
							>
								×
							</IconButton>
						</div>
						{inspectedDefinition.operationalStatus === "draft" && (
							<section className="border-b border-slate-200 py-5" aria-live="polite">
								<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
									Siguiente paso
								</p>
								{!inspectedRuleIsComplete ? (
									<>
										<h3 className="mt-2 text-base font-semibold text-slate-950">
											Completa la definición
										</h3>
										<p className="mt-1 text-sm text-slate-600">
											Agrega la jurisdicción antes de comprobar cómo se aplicará esta regla.
										</p>
										<div className="mt-4">
											<Button
												type="button"
												onClick={() => {
													startEditing(inspectedDefinition)
													setInspectedDefinition(null)
												}}
											>
												Completar definición
											</Button>
										</div>
									</>
								) : isCheckingSimulationCertification ? (
									<p className="mt-2 text-sm text-slate-600">
										Comprobando el estado de la simulación...
									</p>
								) : simulationCertification?.isCurrent ? (
									<>
										<h3 className="mt-2 text-base font-semibold text-slate-950">
											Lista para publicar
										</h3>
										<p className="mt-1 text-sm text-slate-600">
											La simulación vigente confirmó el cálculo de esta versión
											{simulationCertification.quoteId
												? ` · ${simulationCertification.quoteId}`
												: ""}
											.
										</p>
										<div className="mt-4">
											<Button href={inspectedReviewHref}>Revisar y publicar</Button>
										</div>
									</>
								) : (
									<>
										<h3 className="mt-2 text-base font-semibold text-slate-950">
											Comprueba cómo se cobrará al huésped
										</h3>
										<p className="mt-1 text-sm text-slate-600">
											Usa una reserva de ejemplo para confirmar el importe, cuándo se cobra y quién
											lo recauda. La simulación no modifica ventas.
										</p>
										<div className="mt-4">
											<Button href={inspectedSimulatorHref}>Comprobar en Simulador</Button>
										</div>
									</>
								)}
								<ol
									className="mt-5 grid gap-2 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4"
									aria-label="Progreso de esta regla"
								>
									<li className="font-medium text-emerald-700">✓ Definida</li>
									<li
										className={
											simulationCertification?.isCurrent
												? "font-medium text-emerald-700"
												: "font-medium text-slate-950"
										}
									>
										{simulationCertification?.isCurrent ? "✓ Comprobada" : "● Comprobar"}
									</li>
									<li className="text-slate-500">○ Publicar</li>
									<li className="text-slate-500">○ Asignar</li>
								</ol>
							</section>
						)}
						<div className="divide-y divide-slate-200">
							<section className="py-5">
								<h3 className="font-semibold text-slate-950">Cálculo</h3>
								<dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
									<div>
										<dt className="text-slate-500">Monto</dt>
										<dd className="mt-1 font-medium">
											{formatDefinitionValue(inspectedDefinition)}
										</dd>
									</div>
									<div>
										<dt className="text-slate-500">Base imponible</dt>
										<dd className="mt-1 font-medium">
											{(inspectedDefinition.jurisdictionJson as any)?.taxableBase ===
											"base_plus_included"
												? "Base + incluidos"
												: "Base de reserva"}
										</dd>
									</div>
									<div>
										<dt className="text-slate-500">Recauda</dt>
										<dd className="mt-1 font-medium">{responsibilityLabel(inspectedDefinition)}</dd>
									</div>
									<div>
										<dt className="text-slate-500">Vigencia</dt>
										<dd className="mt-1 font-medium">
											{inspectedDefinition.effectiveFrom || inspectedDefinition.effectiveTo
												? `${inspectedDefinition.effectiveFrom ?? "Desde ahora"} · ${inspectedDefinition.effectiveTo ?? "Sin fecha de finalización"}`
												: "Sin fecha de finalización"}
										</dd>
									</div>
								</dl>
							</section>
							<section className="py-5">
								<h3 className="font-semibold text-slate-950">Jurisdicción y excepciones</h3>
								<p className="mt-2 text-sm text-slate-600">
									{jurisdictionLabel(inspectedDefinition)}
								</p>
								<p className="mt-3 text-sm text-slate-600">
									Exenciones:{" "}
									{(
										(inspectedDefinition.jurisdictionJson as any)?.exemptGuestResidenceCountries ??
										[]
									).join(", ") || "Ninguna"}
								</p>
								<p className="mt-1 text-sm text-slate-600">
									Tope: {(inspectedDefinition.jurisdictionJson as any)?.maxAmount ?? "No definido"}{" "}
									· Noches:{" "}
									{(inspectedDefinition.jurisdictionJson as any)?.maxNights ?? "Sin límite"}
								</p>
								<p className="mt-1 text-sm text-slate-600">
									Temporadas:{" "}
									{((inspectedDefinition.jurisdictionJson as any)?.seasons ?? []).length
										? (inspectedDefinition.jurisdictionJson as any).seasons
												.map((season: any) => `${season.from} a ${season.to}`)
												.join(", ")
										: "Sin temporadas"}
								</p>
							</section>
							<details className="py-5">
								<summary className="cursor-pointer text-sm font-medium text-slate-600">
									Información técnica
								</summary>
								<div className="mt-3 flex items-center justify-between gap-3 text-sm">
									<code className="break-all text-slate-600">{inspectedDefinition.code}</code>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => void navigator.clipboard?.writeText(inspectedDefinition.code)}
									>
										Copiar código
									</Button>
								</div>
							</details>
							<section className="py-5">
								<h3 className="font-semibold text-slate-950">Asignaciones y canales</h3>
								{inspectedDefinition.assignments?.length ? (
									<div className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
										{inspectedDefinition.assignments.map((assignment) => (
											<div
												className="flex items-center justify-between gap-3 py-2 text-sm"
												key={assignment.id}
											>
												<span>
													{scopeLabel(assignment, props.initialResources)} ·{" "}
													{assignment.channel ?? "Todos los canales"}
												</span>
												{props.canManageFiscality ? (
													<Button
														type="button"
														size="sm"
														variant="ghost"
														disabled={isUpdatingAssignment === assignment.id}
														onClick={() =>
															void updateAssignmentStatus(
																assignment.id,
																assignment.status === "active" ? "archived" : "active"
															)
														}
													>
														{assignment.status === "active" ? "Pausar" : "Reactivar"}
													</Button>
												) : (
													<span className="text-slate-500">
														{assignment.status === "active" ? "Activa" : "Pausada"}
													</span>
												)}
											</div>
										))}
									</div>
								) : (
									<p className="mt-2 text-sm text-amber-700">No tiene asignaciones activas.</p>
								)}
							</section>
							<section className="py-5">
								<h3 className="font-semibold text-slate-950">Versión y actividad</h3>
								<p className="mt-2 text-sm text-slate-600">
									Última versión:{" "}
									{inspectedDefinition.currentVersion
										? `v${inspectedDefinition.currentVersion.version} · ${new Date(inspectedDefinition.currentVersion.createdAt).toLocaleDateString("es-CL")}`
										: "Aún no publicada"}
								</p>
								<div className="mt-3 space-y-1 text-sm text-slate-600">
									{inspectedDefinition.auditTrail?.map((event, index) => (
										<p key={`${event.action}-${index}`}>
											{auditLabel(event.action)} ·{" "}
											{new Date(event.createdAt).toLocaleDateString("es-CL")}
										</p>
									)) ?? <p>Sin actividad registrada.</p>}
								</div>
								<p className="mt-3 text-sm text-slate-500">
									{simulationCertification?.isCurrent
										? "La simulación vigente corresponde a la configuración actual."
										: "Una modificación de la regla requiere volver a comprobar su cálculo antes de publicarla."}
								</p>
							</section>
						</div>
						{props.canManageFiscality ? (
							<div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
								<Button
									type="button"
									variant="secondary"
									onClick={() => startDuplicating(inspectedDefinition)}
								>
									Duplicar
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={() => {
										startEditing(inspectedDefinition)
										setInspectedDefinition(null)
									}}
								>
									Editar
								</Button>
								{canDeleteDraft(inspectedDefinition) ? (
									<Button
										type="button"
										variant="danger"
										disabled={isUpdatingAssignment === `definition:${inspectedDefinition.id}`}
										onClick={() => void deleteDraft(inspectedDefinition)}
									>
										Eliminar borrador
									</Button>
								) : inspectedDefinition.operationalStatus === "draft" ? null : (
									<Button
										type="button"
										variant="secondary"
										onClick={() =>
											void updateDefinitionStatus(
												inspectedDefinition,
												inspectedDefinition.status === "active" ? "archived" : "active"
											)
										}
									>
										{inspectedDefinition.status === "active" ? "Archivar" : "Reactivar"}
									</Button>
								)}
							</div>
						) : null}
					</aside>
				</div>
			) : null}
		</section>
	)
}
