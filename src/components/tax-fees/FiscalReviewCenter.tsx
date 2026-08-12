import { useEffect, useMemo, useState } from "react"

import type { ApiWarning, DefinitionSummary } from "./TaxFeeWizard"
import { Badge, Button, IconButton } from "../ui-react"

type Suggestion = {
	id: string
	title: string
	country: string
	serviceType: "lodging" | "tour" | "all"
	sourceName: string
	sourceUrl: string
	consultedAt: string
	effectiveFrom: string
	suggestedRate: number | null
	confidence: "low" | "medium" | "high"
	version: string
	reviewNote: string
	comparison: Array<{ id: string; name: string; value: number; calculationType: string }>
}

type ReviewGroup = {
	definition: DefinitionSummary | null
	warnings: ApiWarning[]
}

type Props = {
	definitions: DefinitionSummary[]
	warnings: ApiWarning[]
	canManageFiscality: boolean
	onResolveDefinition: (definition: DefinitionSummary) => void
}

const confidenceLabel = { low: "Baja", medium: "Media", high: "Alta" }

function warningTitle(code: string) {
	return (
		{
			high_percentage: "Revisar monto",
			overlap_detected: "Conflicto de alcance",
			overlapping_taxes: "Conflicto de alcance",
			duplicate_code: "Código duplicado",
			active_without_assignment: "Sin alcance de venta",
			duplicate_active_assignment: "Asignación duplicada",
			missing_jurisdiction: "Falta jurisdicción",
		}[code] ?? "Requiere revisión"
	)
}

function warningDefinitionIds(warning: ApiWarning) {
	const ids = warning.meta?.definitionIds
	return Array.isArray(ids) ? ids.map(String) : []
}

function actionLabel(group: ReviewGroup) {
	if (group.warnings.some((warning) => warning.code === "missing_jurisdiction"))
		return "Completar jurisdicción"
	if (group.warnings.some((warning) => warning.code === "active_without_assignment"))
		return "Ver asignaciones"
	return "Revisar regla"
}

export default function FiscalReviewCenter({
	definitions,
	warnings,
	canManageFiscality,
	onResolveDefinition,
}: Props) {
	const [open, setOpen] = useState(false)
	const [view, setView] = useState<"configuration" | "suggestions">("configuration")
	const [suggestions, setSuggestions] = useState<Suggestion[]>([])
	const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
	const [message, setMessage] = useState("")

	useEffect(() => {
		fetch("/api/provider/tax-fees/suggestions")
			.then((response) => (response.ok ? response.json() : { suggestions: [] }))
			.then((body) => setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []))
			.catch(() => setSuggestions([]))
	}, [])

	const groups = useMemo<ReviewGroup[]>(() => {
		const grouped = new Map<string, ApiWarning[]>()
		const general: ApiWarning[] = []
		for (const warning of warnings) {
			const ids = warningDefinitionIds(warning)
			if (!ids.length) {
				general.push(warning)
				continue
			}
			for (const id of ids) grouped.set(id, [...(grouped.get(id) ?? []), warning])
		}
		return [
			...Array.from(grouped.entries()).map(([id, groupedWarnings]) => ({
				definition: definitions.find((definition) => definition.id === id) ?? null,
				warnings: groupedWarnings,
			})),
			...general.map((warning) => ({ definition: null, warnings: [warning] })),
		]
	}, [definitions, warnings])

	const affectedDefinitions = groups.filter((group) => group.definition).length
	const pendingLabel =
		affectedDefinitions === 1
			? "1 definición requiere completar"
			: `${affectedDefinitions} definiciones requieren completar`
	const openReview = (nextView: "configuration" | "suggestions") => {
		setView(nextView)
		setSelectedSuggestion(null)
		setOpen(true)
	}

	async function handleSuggestionAction(
		suggestion: Suggestion,
		action: "dismiss" | "apply_for_review"
	) {
		const response = await fetch("/api/provider/tax-fees/suggestions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ suggestionId: suggestion.id, action }),
		})
		if (!response.ok) {
			setMessage("No se pudo registrar esta revisión. Intenta nuevamente.")
			return
		}
		if (action === "apply_for_review") {
			window.location.href = `/provider/settings/tax-fees?create=1&suggestion=${encodeURIComponent(suggestion.id)}`
			return
		}
		setSuggestions((current) => current.filter((item) => item.id !== suggestion.id))
		setSelectedSuggestion(null)
		setMessage("Sugerencia descartada y registrada en Actividad.")
	}

	if (!groups.length && !suggestions.length) return null

	return (
		<>
			<section className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 bg-slate-50 px-4 py-3">
				<div className="min-w-0">
					<p className="text-sm font-semibold text-slate-950">Revisión pendiente</p>
					<p className="mt-0.5 text-sm text-slate-600">
						{groups.length ? pendingLabel : "Configuración sin incidencias"}
						{suggestions.length ? ` · ${suggestions.length} sugerencias disponibles` : ""}
					</p>
				</div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={() => openReview(groups.length ? "configuration" : "suggestions")}
				>
					Abrir revisión
				</Button>
			</section>

			{open ? (
				<div
					className="fastt-modal-backdrop fixed inset-0 z-50"
					role="dialog"
					aria-modal="true"
					aria-labelledby="fiscal-review-title"
				>
					<button
						type="button"
						aria-label="Cerrar revisión"
						className="fastt-button absolute inset-0 bg-slate-950/40"
						onClick={() => setOpen(false)}
					/>
					<aside className="fastt-side-sheet absolute top-0 right-0 flex h-full w-full max-w-xl flex-col bg-white text-slate-900 shadow-xl">
						<div className="fastt-side-sheet-header flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
							<div>
								<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
									Fiscalidad de ventas
								</p>
								<h2 id="fiscal-review-title" className="mt-1 text-xl font-semibold text-slate-950">
									Revisión pendiente
								</h2>
							</div>
							<IconButton
								label="Cerrar revisión"
								size="sm"
								variant="secondary"
								onClick={() => setOpen(false)}
							>
								×
							</IconButton>
						</div>
						<div className="border-b border-slate-200 px-5 sm:px-6">
							<div className="flex gap-5" role="tablist" aria-label="Contenido de revisión">
								<Button
									type="button"
									role="tab"
									aria-selected={view === "configuration"}
									variant="ghost"
									size="sm"
									onClick={() => {
										setView("configuration")
										setSelectedSuggestion(null)
									}}
									className={`rounded-none border-b-2 px-0 ${view === "configuration" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}
								>
									Configuración {groups.length ? `(${affectedDefinitions})` : ""}
								</Button>
								<Button
									type="button"
									role="tab"
									aria-selected={view === "suggestions"}
									variant="ghost"
									size="sm"
									onClick={() => {
										setView("suggestions")
										setSelectedSuggestion(null)
									}}
									className={`rounded-none border-b-2 px-0 ${view === "suggestions" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}
								>
									Sugerencias {suggestions.length ? `(${suggestions.length})` : ""}
								</Button>
							</div>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
							{message ? (
								<p className="border-b border-slate-200 py-3 text-sm text-slate-700">{message}</p>
							) : null}
							{view === "configuration" ? (
								groups.length ? (
									groups.map((group, index) => (
										<article
											className="border-b border-slate-200 py-5"
											key={group.definition?.id ?? `general-${index}`}
										>
											<div className="flex items-start justify-between gap-4">
												<div className="min-w-0">
													<p className="font-semibold text-slate-950">
														{group.definition?.name ?? "Configuración fiscal"}
													</p>
													<p className="mt-1 text-sm text-slate-600">
														{group.warnings.length}{" "}
														{group.warnings.length === 1 ? "pendiente" : "pendientes"} para
														completar o revisar.
													</p>
												</div>
												{group.definition ? (
													<Badge
														variant={
															group.definition.operationalStatus === "conflict"
																? "warning"
																: "neutral"
														}
													>
														{group.definition.operationalStatus === "draft"
															? "Borrador"
															: "Revisar"}
													</Badge>
												) : null}
											</div>
											<ul className="mt-4 space-y-3">
												{group.warnings.map((warning, warningIndex) => (
													<li key={`${warning.code}-${warningIndex}`}>
														<p className="text-sm font-medium text-slate-900">
															{warningTitle(warning.code)}
														</p>
														<p className="mt-0.5 text-sm leading-5 text-slate-600">
															{warning.message}
														</p>
													</li>
												))}
											</ul>
											{group.definition && canManageFiscality ? (
												<Button
													type="button"
													size="sm"
													variant="secondary"
													className="mt-4"
													onClick={() => {
														setOpen(false)
														onResolveDefinition(group.definition!)
													}}
												>
													{actionLabel(group)}
												</Button>
											) : null}
										</article>
									))
								) : (
									<p className="py-8 text-sm text-slate-600">
										No hay incidencias de configuración pendientes.
									</p>
								)
							) : selectedSuggestion ? (
								<article className="py-5">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setSelectedSuggestion(null)}
									>
										Volver a sugerencias
									</Button>
									<div className="mt-5 flex flex-wrap items-center gap-2">
										<h3 className="text-lg font-semibold text-slate-950">
											{selectedSuggestion.title}
										</h3>
										<Badge variant="info">Nueva</Badge>
									</div>
									<dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-slate-200 py-4 text-sm">
										<div>
											<dt className="text-slate-500">Jurisdicción</dt>
											<dd className="mt-1 font-medium">{selectedSuggestion.country}</dd>
										</div>
										<div>
											<dt className="text-slate-500">Tasa sugerida</dt>
											<dd className="mt-1 font-medium">
												{selectedSuggestion.suggestedRate == null
													? "Por confirmar"
													: `${selectedSuggestion.suggestedRate}%`}
											</dd>
										</div>
										<div>
											<dt className="text-slate-500">Confianza</dt>
											<dd className="mt-1 font-medium">
												{confidenceLabel[selectedSuggestion.confidence]}
											</dd>
										</div>
										<div>
											<dt className="text-slate-500">Vigencia de referencia</dt>
											<dd className="mt-1 font-medium">{selectedSuggestion.effectiveFrom}</dd>
										</div>
									</dl>
									<section className="border-b border-slate-200 py-5">
										<h4 className="font-semibold text-slate-950">
											Comparación con tu configuración
										</h4>
										<p className="mt-2 text-sm leading-6 text-slate-600">
											{selectedSuggestion.comparison.length
												? selectedSuggestion.comparison
														.map(
															(rule) =>
																`${rule.name} (${rule.value}${rule.calculationType === "percentage" ? "%" : ""})`
														)
														.join(", ")
												: `No existe una regla equivalente para ${selectedSuggestion.country}.`}
										</p>
									</section>
									<section className="border-b border-slate-200 py-5">
										<h4 className="font-semibold text-slate-950">Fuente oficial</h4>
										<a
											href={selectedSuggestion.sourceUrl}
											target="_blank"
											rel="noreferrer"
											className="mt-2 inline-block text-sm font-medium text-slate-700 underline underline-offset-4"
										>
											{selectedSuggestion.sourceName}
										</a>
										<p className="mt-1 text-sm text-slate-500">
											Consultada el {selectedSuggestion.consultedAt} · versión{" "}
											{selectedSuggestion.version}
										</p>
									</section>
									<p className="mt-5 border-l-2 border-amber-400 pl-3 text-sm leading-6 text-amber-950">
										{selectedSuggestion.reviewNote}
									</p>
									<div className="mt-6 flex flex-wrap justify-end gap-3">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => void handleSuggestionAction(selectedSuggestion, "dismiss")}
										>
											Descartar
										</Button>
										{canManageFiscality ? (
											<Button
												type="button"
												size="sm"
												onClick={() =>
													void handleSuggestionAction(selectedSuggestion, "apply_for_review")
												}
											>
												Crear borrador
											</Button>
										) : null}
									</div>
								</article>
							) : suggestions.length ? (
								suggestions.map((suggestion) => (
									<article
										className="flex items-start justify-between gap-4 border-b border-slate-200 py-5"
										key={suggestion.id}
									>
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<p className="font-semibold text-slate-950">{suggestion.title}</p>
												<Badge variant="info">Nueva</Badge>
											</div>
											<p className="mt-1 text-sm text-slate-600">
												{suggestion.country} ·{" "}
												{suggestion.serviceType === "lodging"
													? "Alojamiento"
													: suggestion.serviceType === "tour"
														? "Tours"
														: "Ventas"}
											</p>
											<p className="mt-2 text-sm text-slate-600">
												{suggestion.suggestedRate == null
													? "Tasa pendiente de verificación"
													: `${suggestion.suggestedRate}% sugerido`}{" "}
												· Confianza {confidenceLabel[suggestion.confidence].toLowerCase()}
											</p>
										</div>
										<Button
											type="button"
											size="sm"
											variant="secondary"
											onClick={() => setSelectedSuggestion(suggestion)}
										>
											Revisar
										</Button>
									</article>
								))
							) : (
								<p className="py-8 text-sm text-slate-600">
									No hay sugerencias pendientes de revisión.
								</p>
							)}
						</div>
					</aside>
				</div>
			) : null}
		</>
	)
}
