import { useMemo, useState } from "react"

import TaxFeeWizard, {
	type ApiWarning,
	type DefinitionSummary,
	type TaxFeeScopeResources,
	type TaxFeeWizardMode,
	type TaxFeeSuggestedDraft,
} from "./TaxFeeWizard"
import { Badge, Button, IconButton, Input, Notice, Select } from "../ui-react"

type TaxFeePageProps = {
	initialDefinitions: DefinitionSummary[]
	initialWarnings: ApiWarning[]
	initialMode?: PageMode
	initialDefinitionId?: string | null
	initialDuplicateDefinitionId?: string | null
	canManageFiscality: boolean
	initialResources: TaxFeeScopeResources
	initialSuggestion?: TaxFeeSuggestedDraft | null
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
		case "overlapping_taxes":
			return "Posible solapamiento"
		case "duplicate_code":
			return "Ya existe un cargo similar"
		case "active_without_assignment":
			return "Sin alcance de venta"
		case "duplicate_active_assignment":
			return "Asignación duplicada"
		case "missing_jurisdiction":
			return "Jurisdicción pendiente"
		default:
			return "Requiere revisión"
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

	const hasDefinitions = Array.isArray(definitions) && definitions.length > 0
	const wizardMode: TaxFeeWizardMode = mode === "editing" ? "editing" : "creating"
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
		setMode("creating")
	}

	function startEditing(definition: DefinitionSummary) {
		if (!props.canManageFiscality) return
		setSelectedDefinition(definition)
		setSuccessMessage(null)
		setMode("editing")
	}

	function startDuplicating(definition: DefinitionSummary) {
		if (!props.canManageFiscality) return
		setSelectedDefinition(definition)
		setInspectedDefinition(null)
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

	return (
		<section className="min-w-0">
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

			{warnings.length > 0 && (
				<Notice variant="warning" title="Requiere atención" className="mt-4">
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
				<div className="fastt-empty-state mt-4 border border-dashed border-slate-300 bg-slate-50 p-5">
					<h3 className="text-lg font-semibold text-slate-950">
						Aún no hay impuestos ni cargos configurados
					</h3>
					<p className="mt-2 text-sm leading-6 text-slate-600">
						Agrega impuestos o cargos para que los huéspedes vean precios correctos antes de
						reservar.
					</p>
				</div>
			) : (
				<>
					<div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
						<Input
							className="h-9 min-w-48 flex-1"
							placeholder="Buscar por nombre o código"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<Select
							className="h-9 w-auto"
							value={statusFilter}
							onChange={(event) => setStatusFilter(event.target.value)}
						>
							<option value="all">Todos los estados</option>
							{["active", "scheduled", "conflict", "draft", "paused", "expired", "archived"].map(
								(status) => (
									<option key={status} value={status}>
										{statusLabel(status as DefinitionSummary["operationalStatus"])}
									</option>
								)
							)}
						</Select>
						<Select
							className="h-9 w-auto"
							value={kindFilter}
							onChange={(event) => setKindFilter(event.target.value)}
						>
							<option value="all">Tipo</option>
							<option value="tax">Impuestos</option>
							<option value="fee">Cargos</option>
						</Select>
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
						<Select
							className="h-9 w-auto"
							value={validityFilter}
							onChange={(event) => setValidityFilter(event.target.value)}
						>
							<option value="all">Vigencia</option>
							<option value="dated">Con vigencia</option>
							<option value="open">Sin fecha</option>
						</Select>
					</div>
					<div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 sm:grid-cols-4">
						<div className="py-3 text-center">
							<p className="text-xs text-slate-500">Activas</p>
							<p className="font-semibold">
								{definitions.filter((item) => item.operationalStatus === "active").length}
							</p>
						</div>
						<div className="py-3 text-center">
							<p className="text-xs text-slate-500">Programadas</p>
							<p className="font-semibold">
								{definitions.filter((item) => item.operationalStatus === "scheduled").length}
							</p>
						</div>
						<div className="py-3 text-center">
							<p className="text-xs text-slate-500">Conflictos</p>
							<p className="font-semibold">
								{definitions.filter((item) => item.operationalStatus === "conflict").length}
							</p>
						</div>
						<div className="py-3 text-center">
							<p className="text-xs text-slate-500">Borradores</p>
							<p className="font-semibold">
								{definitions.filter((item) => item.operationalStatus === "draft").length}
							</p>
						</div>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[1050px] text-left text-sm">
							<thead className="border-b border-slate-200 text-xs tracking-[0.06em] text-slate-500 uppercase">
								<tr>
									<th className="py-3 pr-3">Regla</th>
									<th className="px-3 py-3">Tipo</th>
									<th className="px-3 py-3">Cálculo</th>
									<th className="px-3 py-3">Base</th>
									<th className="px-3 py-3">Recauda</th>
									<th className="px-3 py-3">Jurisdicción</th>
									<th className="px-3 py-3">Vigencia</th>
									<th className="px-3 py-3">Asignadas</th>
									<th className="px-3 py-3">Estado</th>
									<th className="py-3 pl-3"></th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{visibleDefinitions.map((definition) => (
									<tr
										key={definition.id}
										className="cursor-pointer hover:bg-slate-50"
										onClick={() => setInspectedDefinition(definition)}
									>
										<td className="py-3 pr-3">
											<p className="font-medium text-slate-950">{definition.name}</p>
											<p className="mt-0.5 text-xs text-slate-500">{definition.code}</p>
										</td>
										<td className="px-3 py-3 text-slate-600">
											{definition.kind === "tax" ? "Impuesto" : "Cargo"}
										</td>
										<td className="px-3 py-3 text-slate-700">
											{formatDefinitionValue(definition)}
											<br />
											<span className="text-xs text-slate-500">
												{formatAppliesPer(definition.appliesPer)}
											</span>
										</td>
										<td className="px-3 py-3 text-slate-600">
											{(definition.jurisdictionJson as any)?.taxableBase === "base_plus_included"
												? "Base + incluidos"
												: "Base de reserva"}
										</td>
										<td className="px-3 py-3 text-slate-600">{responsibilityLabel(definition)}</td>
										<td className="px-3 py-3 text-slate-600">{jurisdictionLabel(definition)}</td>
										<td className="px-3 py-3 text-slate-600">
											{definition.effectiveFrom || definition.effectiveTo
												? `${definition.effectiveFrom ?? "Ahora"} - ${definition.effectiveTo ?? "Sin fin"}`
												: "Continua"}
										</td>
										<td className="px-3 py-3 text-slate-600">
											{definition.assignments?.filter(
												(assignment) => assignment.status === "active"
											).length ?? 0}
										</td>
										<td className="px-3 py-3">
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
										<td className="py-3 pl-3 text-right">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={(event) => {
													event.stopPropagation()
													setInspectedDefinition(definition)
												}}
											>
												Ver
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
				</>
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
									{inspectedDefinition.code} · Revisión v
									{inspectedDefinition.currentVersion?.version ?? "sin publicar"}
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
											{inspectedDefinition.effectiveFrom ?? "Ahora"} -{" "}
											{inspectedDefinition.effectiveTo ?? "Sin fin"}
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
									{((inspectedDefinition.jurisdictionJson as any)?.seasons ?? []).length ||
										"Sin temporadas"}
								</p>
							</section>
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
									La última simulación se consulta en Simulador usando esta regla.
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
							</div>
						) : null}
					</aside>
				</div>
			) : null}

			<div className="mt-5">
				{operationError && (
					<Notice variant="error" className="mb-4">
						{operationError}
					</Notice>
				)}
				{successMessage && (
					<Notice variant="success" className="mb-4">
						{successMessage}
					</Notice>
				)}

				{mode === "idle" ? null : (
					<TaxFeeWizard
						initialDefinitions={definitions}
						initialWarnings={warnings}
						initialMode={wizardMode}
						initialResources={props.initialResources}
						initialSuggestion={props.initialSuggestion}
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
