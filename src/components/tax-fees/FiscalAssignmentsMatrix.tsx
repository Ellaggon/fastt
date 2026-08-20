import { useEffect, useMemo, useRef, useState } from "react"

import { Button, Input, SegmentedControl, SegmentedItem, Select, SideSheet } from "../ui-react"

type Definition = {
	id: string
	name: string
	code: string
	kind: "tax" | "fee"
	calculationType: "percentage" | "fixed"
	value: number
	currency: string | null
	appliesPer: string
	inclusionType: "included" | "excluded"
	jurisdictionJson: {
		country?: string
		collectionResponsibility?: "provider" | "platform" | "marketplace"
	} | null
}
type Assignment = {
	id: string
	definitionId: string
	name: string
	effectiveFrom: string | null
	effectiveTo: string | null
}
type EffectiveRule = {
	id: string
	name: string
	code: string
	source: string
	inherited: boolean
}
type Rate = {
	id: string
	name: string
	isActive: boolean
	directAssignments: Assignment[]
	effectiveRules: EffectiveRule[]
	conflict: boolean
	syncStatus: "ready" | "pending"
}
type Variant = {
	id: string
	name: string
	kind: string
	directAssignments: Assignment[]
	rates: Rate[]
}
type Product = {
	id: string
	name: string
	productType: string
	productTypeLabel: string
	directAssignments: Assignment[]
	variants: Variant[]
}
type Tree = {
	provider: { id: string; name: string; directAssignments: Assignment[] }
	products: Product[]
	definitions: Definition[]
}

type AssignableScope = "provider" | "product" | "variant" | "rate_plan"
type SelectedResource = {
	key: string
	path: string[]
	scope: AssignableScope
	scopeId: string
	assignments: Assignment[]
	name: string
	descendantRateIds: string[]
	pathLabels: string[]
}
type CoverageRow = SelectedResource & {
	level: 0 | 1 | 2 | 3
	kind: string
	directAssignments: Assignment[]
	effectiveRules: EffectiveRule[]
	conflict: boolean
	isRate: boolean
	canExpand: boolean
	coveredRateCount: number
	totalRateCount: number
	syncStatus: "ready" | "pending" | null
}
type AssignmentPreview = {
	canApply: boolean
	blockers: string[]
	warnings: string[]
}

const scopeLabel: Record<string, string> = {
	provider: "Proveedor",
	product: "Producto",
	variant: "Unidad",
	rate_plan: "Tarifa",
}

const appliesPerLabel: Record<string, string> = {
	stay: "por estadía",
	night: "por noche",
	guest: "por huésped",
	guest_night: "por huésped y noche",
}

function translatedKind(kind: string) {
	if (kind === "hotel_room") return "Habitación"
	if (kind === "tour_departure") return "Salida"
	return kind.replaceAll("_", " ")
}

function definitionValue(definition: Definition) {
	return definition.calculationType === "percentage"
		? `${definition.value}%`
		: `${definition.currency ?? "USD"} ${definition.value}`
}

function isPathPrefix(parent: string[], child: string[]) {
	return parent.length <= child.length && parent.every((part, index) => child[index] === part)
}

function formatDate(value: string | null) {
	if (!value) return null
	return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(value))
}

function responsibilityLabel(value: "provider" | "platform" | "marketplace" | undefined) {
	if (value === "platform") return "Fastt"
	if (value === "marketplace") return "canal de venta"
	return "proveedor"
}

function statusPill(
	status: "assigned" | "inherited" | "scheduled" | "uncovered" | "conflict" | "complete" | "partial"
) {
	const styles = {
		assigned: "bg-emerald-50 text-emerald-800",
		inherited: "bg-sky-50 text-sky-800",
		scheduled: "bg-sky-50 text-sky-800",
		uncovered: "bg-slate-100 text-slate-700",
		conflict: "bg-rose-50 text-rose-800",
		complete: "bg-emerald-50 text-emerald-800",
		partial: "bg-amber-50 text-amber-900",
	}
	const labels = {
		assigned: "Asignada",
		inherited: "Heredada",
		scheduled: "Programada",
		uncovered: "Sin cobertura",
		conflict: "Conflicto",
		complete: "Completa",
		partial: "Parcial",
	}
	return (
		<span
			className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}
		>
			{labels[status]}
		</span>
	)
}

export default function FiscalAssignmentsMatrix({
	canManage,
	selectedScopeId,
	initialDefinitionId,
	initialTargetScope,
	initialTargetId,
}: {
	canManage: boolean
	selectedScopeId?: string | null
	initialDefinitionId?: string | null
	initialTargetScope?: string | null
	initialTargetId?: string | null
}) {
	const [tree, setTree] = useState<Tree | null>(null)
	const [productId, setProductId] = useState(selectedScopeId ?? "all")
	const [ruleId, setRuleId] = useState("all")
	const [resourceQuery, setResourceQuery] = useState("")
	const [showInherited, setShowInherited] = useState(true)
	const [onlyConflicts, setOnlyConflicts] = useState(false)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [selected, setSelected] = useState<Map<string, SelectedResource>>(new Map())
	const [isAssigning, setIsAssigning] = useState(Boolean(initialDefinitionId))
	const [selectedRule, setSelectedRule] = useState(initialDefinitionId ?? "")
	const [assignmentTiming, setAssignmentTiming] = useState<"now" | "schedule">("now")
	const [effectiveFrom, setEffectiveFrom] = useState("")
	const [effectiveTo, setEffectiveTo] = useState("")
	const [inspectedRow, setInspectedRow] = useState<CoverageRow | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState("")
	const [messageTone, setMessageTone] = useState<"success" | "error">("success")
	const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview | null>(null)
	const [isCheckingAssignment, setIsCheckingAssignment] = useState(false)
	const [lastAssignmentDefinitionId, setLastAssignmentDefinitionId] = useState<string | null>(null)
	const didApplyInitialTarget = useRef(false)

	const load = async () => {
		const params = new URLSearchParams()
		if (selectedScopeId) params.set("scope", selectedScopeId)
		// Avoid handing off to a stale matrix immediately after publication.
		if (initialDefinitionId) params.set("definitionId", initialDefinitionId)
		const response = await fetch(`/api/provider/tax-fees/assignments/tree?${params.toString()}`)
		if (!response.ok) throw new Error("No se pudieron cargar las asignaciones")
		const data = (await response.json()) as Tree
		setTree(data)
		const initiallyExpanded = new Set<string>()
		if (data.products.length === 1) initiallyExpanded.add(data.products[0].id)
		if (initialTargetScope && initialTargetId) {
			for (const product of data.products) {
				const variant = product.variants.find(
					(candidate) =>
						(initialTargetScope === "variant" && candidate.id === initialTargetId) ||
						(initialTargetScope === "rate_plan" &&
							candidate.rates.some((rate) => rate.id === initialTargetId))
				)
				if (initialTargetScope === "product" && product.id === initialTargetId)
					initiallyExpanded.add(product.id)
				if (variant) {
					initiallyExpanded.add(product.id)
					initiallyExpanded.add(variant.id)
				}
			}
		}
		setExpanded(initiallyExpanded)
	}

	useEffect(() => {
		load().catch((error) => {
			setMessageTone("error")
			setMessage(error.message)
		})
	}, [initialDefinitionId, initialTargetId, initialTargetScope, selectedScopeId])

	useEffect(() => {
		if (
			!initialDefinitionId ||
			!tree?.definitions.some((definition) => definition.id === initialDefinitionId)
		)
			return
		setSelectedRule(initialDefinitionId)
		setIsAssigning(true)
	}, [initialDefinitionId, tree])

	const assignmentDefinition = tree?.definitions.find(
		(definition) => definition.id === selectedRule
	)
	const targetDefinitionId =
		isAssigning && selectedRule ? selectedRule : ruleId !== "all" ? ruleId : null

	const visibleProducts = useMemo(
		() =>
			(tree?.products ?? []).filter((product) => productId === "all" || product.id === productId),
		[productId, tree]
	)

	const coverageRows = useMemo<CoverageRow[]>(() => {
		if (!tree) return []
		const rows: CoverageRow[] = []
		const normalizedQuery = resourceQuery.trim().toLocaleLowerCase("es")
		const rateMatchesRule = (rate: Rate) =>
			ruleId === "all" ||
			rate.effectiveRules.some((rule) => rule.id === ruleId) ||
			rate.directAssignments.some((assignment) => assignment.definitionId === ruleId)
		const rateCovered = (rate: Rate) =>
			targetDefinitionId
				? rate.effectiveRules.some((rule) => rule.id === targetDefinitionId)
				: rate.effectiveRules.length > 0
		const relevantRates = (rates: Rate[]) =>
			rates.filter((rate) => rateMatchesRule(rate) && (!onlyConflicts || rate.conflict))
		const allVisibleRates = visibleProducts.flatMap((product) =>
			product.variants.flatMap((variant) => relevantRates(variant.rates))
		)

		if (productId === "all" && !normalizedQuery && !onlyConflicts && ruleId === "all") {
			rows.push({
				key: `provider:${tree.provider.id}`,
				path: [`provider:${tree.provider.id}`],
				level: 0,
				scope: "provider",
				scopeId: tree.provider.id,
				name: "Toda la cuenta",
				pathLabels: ["Toda la cuenta"],
				kind: "Proveedor",
				assignments: tree.provider.directAssignments,
				directAssignments: tree.provider.directAssignments,
				effectiveRules: [],
				conflict: allVisibleRates.some((rate) => rate.conflict),
				isRate: false,
				canExpand: false,
				coveredRateCount: allVisibleRates.filter(rateCovered).length,
				totalRateCount: allVisibleRates.length,
				descendantRateIds: allVisibleRates.map((rate) => rate.id),
				syncStatus: null,
			})
		}

		for (const product of visibleProducts) {
			const productRates = relevantRates(product.variants.flatMap((variant) => variant.rates))
			const productMatches = product.name.toLocaleLowerCase("es").includes(normalizedQuery)
			const matchingVariants = product.variants.filter((variant) => {
				const variantMatches = variant.name.toLocaleLowerCase("es").includes(normalizedQuery)
				const matchingRates = relevantRates(variant.rates).filter((rate) =>
					rate.name.toLocaleLowerCase("es").includes(normalizedQuery)
				)
				return !normalizedQuery || productMatches || variantMatches || matchingRates.length > 0
			})
			if ((onlyConflicts || ruleId !== "all") && productRates.length === 0) continue
			if (normalizedQuery && !productMatches && matchingVariants.length === 0) continue

			const productKey = `product:${product.id}`
			const productPath = [`provider:${tree.provider.id}`, productKey]
			rows.push({
				key: productKey,
				path: productPath,
				level: 1,
				scope: "product",
				scopeId: product.id,
				name: product.name,
				pathLabels: ["Toda la cuenta", product.name],
				kind: product.productTypeLabel,
				assignments: product.directAssignments,
				directAssignments: product.directAssignments,
				effectiveRules: [],
				conflict: productRates.some((rate) => rate.conflict),
				isRate: false,
				canExpand: matchingVariants.length > 0,
				coveredRateCount: productRates.filter(rateCovered).length,
				totalRateCount: productRates.length,
				descendantRateIds: productRates.map((rate) => rate.id),
				syncStatus: null,
			})

			if (!normalizedQuery && !expanded.has(product.id)) continue
			for (const variant of matchingVariants) {
				const variantMatches = variant.name.toLocaleLowerCase("es").includes(normalizedQuery)
				const variantRates = relevantRates(variant.rates).filter(
					(rate) =>
						!normalizedQuery ||
						productMatches ||
						variantMatches ||
						rate.name.toLocaleLowerCase("es").includes(normalizedQuery)
				)
				if ((onlyConflicts || ruleId !== "all") && variantRates.length === 0) continue
				const variantPath = [...productPath, `variant:${variant.id}`]
				rows.push({
					key: `variant:${variant.id}`,
					path: variantPath,
					level: 2,
					scope: "variant",
					scopeId: variant.id,
					name: variant.name,
					pathLabels: ["Toda la cuenta", product.name, variant.name],
					kind: translatedKind(variant.kind),
					assignments: variant.directAssignments,
					directAssignments: variant.directAssignments,
					effectiveRules: [],
					conflict: variantRates.some((rate) => rate.conflict),
					isRate: false,
					canExpand: variantRates.length > 0,
					coveredRateCount: variantRates.filter(rateCovered).length,
					totalRateCount: variantRates.length,
					descendantRateIds: variantRates.map((rate) => rate.id),
					syncStatus: null,
				})

				if (!normalizedQuery && !expanded.has(variant.id)) continue
				for (const rate of variantRates) {
					const ratePath = [...variantPath, `rate_plan:${rate.id}`]
					rows.push({
						key: `rate_plan:${rate.id}`,
						path: ratePath,
						level: 3,
						scope: "rate_plan",
						scopeId: rate.id,
						name: rate.name,
						pathLabels: ["Toda la cuenta", product.name, variant.name, rate.name],
						kind: "Tarifa",
						assignments: rate.directAssignments,
						directAssignments: rate.directAssignments,
						effectiveRules: rate.effectiveRules,
						conflict: rate.conflict,
						isRate: true,
						canExpand: false,
						coveredRateCount: rateCovered(rate) ? 1 : 0,
						totalRateCount: 1,
						descendantRateIds: [rate.id],
						syncStatus: rate.syncStatus,
					})
				}
			}
		}
		return rows
	}, [
		expanded,
		onlyConflicts,
		productId,
		resourceQuery,
		ruleId,
		targetDefinitionId,
		tree,
		visibleProducts,
	])

	useEffect(() => {
		if (didApplyInitialTarget.current || !initialTargetScope || !initialTargetId) return
		const target = coverageRows.find(
			(row) => row.scope === initialTargetScope && row.scopeId === initialTargetId
		)
		if (!target) return
		didApplyInitialTarget.current = true
		setSelected(new Map([[target.key, target]]))
	}, [coverageRows, initialTargetId, initialTargetScope])

	const allRates = useMemo(
		() =>
			visibleProducts.flatMap((product) => product.variants.flatMap((variant) => variant.rates)),
		[visibleProducts]
	)
	const selectedResources = useMemo(() => [...selected.values()], [selected])
	const assignmentTargets = useMemo(
		() =>
			selectedResources.map((target) => ({
				scope: target.scope,
				scopeId: target.scopeId,
				channel: null,
				effectiveFrom:
					assignmentTiming === "schedule" && effectiveFrom
						? new Date(`${effectiveFrom}T00:00:00`).toISOString()
						: null,
				effectiveTo:
					assignmentTiming === "schedule" && effectiveTo
						? new Date(`${effectiveTo}T23:59:59`).toISOString()
						: null,
			})),
		[assignmentTiming, effectiveFrom, effectiveTo, selectedResources]
	)
	const impactedRateCount = new Set(
		selectedResources.flatMap((resource) => resource.descendantRateIds)
	).size
	const selectedHasDirectAssignments = selectedResources.some(
		(resource) => resource.assignments.length > 0
	)
	const conflictCount = allRates.filter((rate) => rate.conflict).length
	const coveredRateCount = targetDefinitionId
		? allRates.filter((rate) => rate.effectiveRules.some((rule) => rule.id === targetDefinitionId))
				.length
		: allRates.filter((rate) => rate.effectiveRules.length > 0).length
	const canAssignPublished = canManage && Boolean(tree?.definitions.length)

	useEffect(() => {
		if (!isAssigning || !selectedRule || assignmentTargets.length === 0) {
			setAssignmentPreview(null)
			setIsCheckingAssignment(false)
			return
		}
		let cancelled = false
		setIsCheckingAssignment(true)
		void fetch("/api/provider/tax-fees/assignments/bulk", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				operation: "preview",
				taxFeeDefinitionId: selectedRule,
				targets: assignmentTargets,
			}),
		})
			.then(async (response) => {
				const body = (await response.json()) as AssignmentPreview & { message?: string }
				if (!response.ok) throw new Error(body.message ?? "No se pudo revisar la asignación")
				return body
			})
			.then((preview) => {
				if (!cancelled) setAssignmentPreview(preview)
			})
			.catch((error) => {
				if (!cancelled)
					setAssignmentPreview({
						canApply: false,
						blockers: [error instanceof Error ? error.message : "No se pudo revisar la asignación"],
						warnings: [],
					})
			})
			.finally(() => {
				if (!cancelled) setIsCheckingAssignment(false)
			})
		return () => {
			cancelled = true
		}
	}, [assignmentTargets, isAssigning, selectedRule])

	const toggleExpanded = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})

	const toggleSelected = (row: CoverageRow) =>
		setSelected((current) => {
			const next = new Map(current)
			if (next.has(row.key)) {
				next.delete(row.key)
				return next
			}
			for (const [key, resource] of next) {
				if (isPathPrefix(resource.path, row.path) || isPathPrefix(row.path, resource.path)) {
					next.delete(key)
				}
			}
			next.set(row.key, row)
			return next
		})

	const perform = async (operation: "assign" | "pause" | "inherit") => {
		if (!selectedResources.length || (operation === "assign" && !selectedRule)) return
		if (operation === "assign" && (!assignmentPreview?.canApply || isCheckingAssignment)) return
		setBusy(true)
		setMessage("")
		try {
			const targets =
				operation === "assign"
					? assignmentTargets
					: selectedResources.flatMap((target) =>
							target.assignments.map((assignment) => ({
								scope: target.scope,
								scopeId: target.scopeId,
								assignmentId: assignment.id,
							}))
						)
			if (!targets.length)
				throw new Error("Los recursos seleccionados no tienen asignaciones directas para modificar")
			const response = await fetch("/api/provider/tax-fees/assignments/bulk", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					operation,
					taxFeeDefinitionId: operation === "assign" ? selectedRule : undefined,
					targets,
				}),
			})
			const result = await response.json()
			if (!response.ok) throw new Error(result.message ?? "No se pudo actualizar la asignación")
			setMessageTone("success")
			setMessage(
				operation === "assign"
					? `${assignmentDefinition?.name ?? "La regla"} quedó asignada. Comprueba el resultado aplicado antes de continuar.`
					: operation === "pause"
						? "Las asignaciones directas quedaron pausadas."
						: "Se eliminó la sobrescritura y se restauró la herencia."
			)
			if (operation === "assign") setLastAssignmentDefinitionId(selectedRule)
			setSelected(new Map())
			setIsAssigning(false)
			await load()
		} catch (error) {
			setMessageTone("error")
			setMessage(error instanceof Error ? error.message : "No se pudo completar la operación")
		} finally {
			setBusy(false)
		}
	}

	return (
		<section aria-labelledby="assignments-heading" className="space-y-5">
			<header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Cobertura comercial
					</p>
					<h2 id="assignments-heading" className="mt-1 text-lg font-semibold text-slate-950">
						{isAssigning ? "Asignar cobertura" : "Asignaciones"}
					</h2>
					<p className="mt-1 text-sm text-slate-600">
						{initialDefinitionId
							? "Define dónde comienza a aplicar la regla publicada."
							: "Revisa y administra dónde se aplican las reglas fiscales publicadas."}
					</p>
				</div>
				{canManage && !isAssigning ? (
					<Button type="button" disabled={!canAssignPublished} onClick={() => setIsAssigning(true)}>
						Asignar una regla
					</Button>
				) : null}
			</header>

			{isAssigning ? (
				<section
					aria-labelledby="assignment-context-heading"
					className="border-y border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
				>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
								Regla para asignar
							</p>
							{initialDefinitionId && assignmentDefinition ? (
								<>
									<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
										<h3
											id="assignment-context-heading"
											className="text-base font-semibold text-slate-950"
										>
											{assignmentDefinition.name}
										</h3>
										<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
											Publicada
										</span>
									</div>
									<p className="mt-1 text-sm text-slate-700">
										{assignmentDefinition.kind === "tax" ? "Impuesto" : "Cargo"} ·{" "}
										{definitionValue(assignmentDefinition)} ·{" "}
										{appliesPerLabel[assignmentDefinition.appliesPer] ??
											assignmentDefinition.appliesPer}
									</p>
									<p className="mt-1 text-xs text-slate-500">
										{assignmentDefinition.inclusionType === "included"
											? "Incluido en el precio"
											: "Agregado al total"}{" "}
										· Recauda{" "}
										{responsibilityLabel(
											assignmentDefinition.jurisdictionJson?.collectionResponsibility
										)}
										{assignmentDefinition.jurisdictionJson?.country
											? ` · ${assignmentDefinition.jurisdictionJson.country}`
											: ""}
									</p>
								</>
							) : (
								<label className="mt-2 block text-sm font-medium text-slate-700">
									Regla que quieres asignar
									<Select
										value={selectedRule}
										onChange={(event) => setSelectedRule(event.target.value)}
										className="mt-1 min-w-64"
									>
										<option value="">Selecciona una regla</option>
										{tree?.definitions.map((definition) => (
											<option key={definition.id} value={definition.id}>
												{definition.name}
											</option>
										))}
									</Select>
								</label>
							)}
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setSelected(new Map())
								setIsAssigning(false)
							}}
						>
							Salir sin asignar
						</Button>
					</div>
					<div className="mt-4 flex flex-wrap items-end gap-4">
						<div>
							<p className="mb-1 text-xs font-medium text-slate-600">Inicio de cobertura</p>
							<SegmentedControl aria-label="Inicio de cobertura">
								<SegmentedItem
									active={assignmentTiming === "now"}
									onClick={() => setAssignmentTiming("now")}
								>
									Desde ahora
								</SegmentedItem>
								<SegmentedItem
									active={assignmentTiming === "schedule"}
									onClick={() => setAssignmentTiming("schedule")}
								>
									Programar
								</SegmentedItem>
							</SegmentedControl>
						</div>
						{assignmentTiming === "schedule" ? (
							<div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
								<label className="text-xs font-medium text-slate-600">
									Comienza
									<Input
										type="date"
										value={effectiveFrom}
										onChange={(event) => setEffectiveFrom(event.target.value)}
										className="mt-1 h-9"
									/>
								</label>
								<label className="text-xs font-medium text-slate-600">
									Finaliza <span className="font-normal text-slate-400">(opcional)</span>
									<Input
										type="date"
										value={effectiveTo}
										onChange={(event) => setEffectiveTo(event.target.value)}
										min={effectiveFrom || undefined}
										className="mt-1 h-9"
									/>
								</label>
							</div>
						) : (
							<p className="pb-1 text-sm text-slate-600">
								La cobertura comienza ahora y continúa hasta que la pauses.
							</p>
						)}
					</div>
				</section>
			) : null}

			<div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-4">
				<label className="min-w-64 flex-1 text-xs font-medium text-slate-600">
					Buscar cobertura
					<Input
						type="search"
						value={resourceQuery}
						onChange={(event) => setResourceQuery(event.target.value)}
						placeholder="Alojamiento, unidad o tarifa"
						className="mt-1 h-10"
					/>
				</label>
				{!selectedScopeId && (tree?.products.length ?? 0) > 1 ? (
					<label className="min-w-52 text-xs font-medium text-slate-600">
						Producto
						<Select
							value={productId}
							onChange={(event) => {
								setProductId(event.target.value)
								setSelected(new Map())
							}}
							className="mt-1 h-10"
						>
							<option value="all">Todos los productos</option>
							{tree?.products.map((product) => (
								<option key={product.id} value={product.id}>
									{product.name}
								</option>
							))}
						</Select>
					</label>
				) : null}
				<details className="group relative">
					<summary className="fastt-button flex h-10 cursor-pointer list-none items-center rounded-[var(--fastt-radius-control)] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
						Filtros{onlyConflicts || ruleId !== "all" ? " · activos" : ""}
					</summary>
					<div className="fastt-soft-box absolute top-12 right-0 z-20 w-72 border border-slate-200 bg-white p-4 shadow-lg">
						{!initialDefinitionId ? (
							<label className="block text-xs font-medium text-slate-600">
								Regla visible
								<Select
									value={ruleId}
									onChange={(event) => setRuleId(event.target.value)}
									className="mt-1 h-9"
								>
									<option value="all">Todas las reglas</option>
									{tree?.definitions.map((definition) => (
										<option key={definition.id} value={definition.id}>
											{definition.name}
										</option>
									))}
								</Select>
							</label>
						) : null}
						<label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
							<input
								type="checkbox"
								checked={showInherited}
								onChange={(event) => setShowInherited(event.target.checked)}
								className="mt-0.5 size-4"
							/>
							<span>
								Incluir reglas heredadas
								<span className="mt-0.5 block text-xs text-slate-500">
									Muestra reglas recibidas desde niveles superiores.
								</span>
							</span>
						</label>
						<label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
							<input
								type="checkbox"
								checked={onlyConflicts}
								onChange={(event) => setOnlyConflicts(event.target.checked)}
								className="size-4"
							/>
							Solo conflictos {conflictCount ? `(${conflictCount})` : ""}
						</label>
						{onlyConflicts || ruleId !== "all" ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-4 h-auto px-0 underline underline-offset-4"
								onClick={() => {
									setOnlyConflicts(false)
									setRuleId("all")
								}}
							>
								Limpiar filtros
							</Button>
						) : null}
					</div>
				</details>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<p className="font-medium text-slate-900">
					{targetDefinitionId
						? coveredRateCount
							? `${coveredRateCount} de ${allRates.length} tarifas usan esta regla`
							: "Esta regla aún no tiene cobertura"
						: `${coveredRateCount} de ${allRates.length} tarifas tienen reglas fiscales`}
				</p>
				<p className="text-slate-500">
					Selecciona el nivel más alto que comparta el mismo tratamiento.
				</p>
			</div>

			{message ? (
				<div
					role="status"
					className={`border-l-2 px-3 py-2 text-sm ${messageTone === "success" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-rose-500 bg-rose-50 text-rose-900"}`}
				>
					{message}
					{messageTone === "success" && lastAssignmentDefinitionId ? (
						<a
							href={`/provider/settings/tax-fees/simulator?definitionId=${encodeURIComponent(lastAssignmentDefinitionId)}`}
							className="ml-2 font-semibold underline underline-offset-4"
						>
							Comprobar en Simulador
						</a>
					) : null}
				</div>
			) : null}

			{tree && tree.definitions.length === 0 ? (
				<div className="border-y border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
					No hay reglas publicadas y completas disponibles para asignar.{" "}
					<a
						href="/provider/settings/tax-fees"
						className="font-semibold underline underline-offset-4"
					>
						Completa y publica una definición
					</a>{" "}
					antes de cubrir recursos.
				</div>
			) : null}

			<div className="overflow-hidden rounded-md border border-slate-200">
				<table className="w-full text-left text-sm">
					<thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						<tr>
							<th className="w-12 px-3 py-3">
								<span className="sr-only">Seleccionar</span>
							</th>
							<th className="px-3 py-3">Recurso</th>
							<th className="hidden px-3 py-3 md:table-cell">Cobertura actual</th>
							<th className="hidden px-3 py-3 lg:table-cell">Alcance</th>
							<th className="px-3 py-3">Estado</th>
							<th className="w-12 px-3 py-3 text-right">
								<span className="sr-only">Detalle</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{coverageRows.map((row) => {
							const directlySelected = selected.has(row.key)
							const selectedByAncestor = selectedResources.some(
								(resource) => resource.key !== row.key && isPathPrefix(resource.path, row.path)
							)
							const selectedDescendant = selectedResources.some(
								(resource) => resource.key !== row.key && isPathPrefix(row.path, resource.path)
							)
							const visibleRules = row.effectiveRules.filter(
								(rule) => showInherited || !rule.inherited
							)
							const directRuleNames = row.directAssignments.map((assignment) => assignment.name)
							const appliedNames = row.isRate
								? visibleRules.map((rule) => rule.name)
								: directRuleNames
							const inheritedRule = row.effectiveRules.find((rule) => rule.inherited)
							const appliesDirectly =
								row.isRate && row.effectiveRules.some((rule) => !rule.inherited)
							const targetApplied = targetDefinitionId
								? row.isRate && row.effectiveRules.some((rule) => rule.id === targetDefinitionId)
								: row.coveredRateCount > 0
							const parentCoverageStatus =
								row.totalRateCount > 0 && row.coveredRateCount === row.totalRateCount
									? "Completa"
									: row.coveredRateCount > 0
										? "Parcial"
										: "Sin cobertura"
							const canSelectRow = canManage && (isAssigning || row.directAssignments.length > 0)
							return (
								<tr
									key={row.key}
									className={`${row.level < 3 ? "bg-slate-50/60" : "bg-white"} ${directlySelected || selectedByAncestor ? "outline -outline-offset-1 outline-slate-300" : "hover:bg-slate-50"}`}
								>
									<td className="px-3 py-3 align-top">
										{canSelectRow && (isAssigning ? canAssignPublished : true) ? (
											<input
												type="checkbox"
												aria-label={`Seleccionar ${row.name}`}
												checked={directlySelected}
												ref={(element) => {
													if (element)
														element.indeterminate = selectedDescendant && !directlySelected
												}}
												disabled={selectedByAncestor}
												onChange={() => toggleSelected(row)}
												className="mt-1 size-4 rounded border-slate-300"
											/>
										) : null}
									</td>
									<td className="px-3 py-3 align-top">
										<div
											className="flex items-start"
											style={{ paddingLeft: `${Math.max(0, row.level - 1) * 18}px` }}
										>
											{row.canExpand ? (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													aria-label={`${expanded.has(row.scopeId) ? "Contraer" : "Expandir"} ${row.name}`}
													aria-expanded={expanded.has(row.scopeId)}
													className="mr-2 size-6 shrink-0 p-0 text-lg leading-none text-slate-500"
													onClick={() => toggleExpanded(row.scopeId)}
												>
													<span aria-hidden="true">{expanded.has(row.scopeId) ? "⌄" : "›"}</span>
												</Button>
											) : (
												<span className="mr-2 size-6 shrink-0" />
											)}
											<div className="min-w-0">
												<p className="font-semibold text-slate-950">{row.name}</p>
												<p className="mt-0.5 text-xs text-slate-500">
													{row.kind}
													{selectedByAncestor ? " · incluida en la selección superior" : ""}
												</p>
											</div>
										</div>
									</td>
									<td className="hidden px-3 py-3 align-top text-slate-700 md:table-cell">
										{row.isRate
											? appliedNames.join(", ") || "Sin reglas fiscales"
											: directRuleNames.join(", ") ||
												`${row.coveredRateCount} de ${row.totalRateCount} tarifas`}
									</td>
									<td className="hidden px-3 py-3 align-top text-slate-600 lg:table-cell">
										{row.isRate
											? appliesDirectly
												? "Directa"
												: inheritedRule
													? `Heredada de ${scopeLabel[inheritedRule.source] ?? inheritedRule.source}`
													: "Sin aplicación"
											: row.directAssignments.length
												? "Se hereda a niveles inferiores"
												: "Sin regla directa"}
									</td>
									<td className="px-3 py-3 align-top">
										{row.conflict
											? statusPill("conflict")
											: targetApplied
												? statusPill(appliesDirectly ? "assigned" : "inherited")
												: row.isRate
													? statusPill("uncovered")
													: statusPill(
															parentCoverageStatus === "Completa"
																? "complete"
																: parentCoverageStatus === "Parcial"
																	? "partial"
																	: "uncovered"
														)}
									</td>
									<td className="px-3 py-3 text-right align-top">
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() => setInspectedRow(row)}
										>
											<span aria-hidden="true" className="text-lg leading-none">
												›
											</span>
											<span className="sr-only">Ver detalle</span>
										</Button>
									</td>
								</tr>
							)
						})}
						{!coverageRows.length ? (
							<tr>
								<td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
									No hay recursos que coincidan con la búsqueda y los filtros.
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>

			{selectedResources.length > 0 ? (
				<div className="fastt-soft-box sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-4 border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-lg">
					<div>
						<p className="text-sm font-semibold">
							{selectedResources.length} recurso{selectedResources.length === 1 ? "" : "s"}{" "}
							seleccionado
							{selectedResources.length === 1 ? "" : "s"}
						</p>
						<p className="mt-0.5 text-xs text-slate-300">
							Afecta {impactedRateCount} tarifa{impactedRateCount === 1 ? "" : "s"} actual
							{impactedRateCount === 1 ? "" : "es"} · Web directa
						</p>
						{selectedResources.some((resource) => resource.scope !== "rate_plan") ? (
							<p className="mt-1 text-xs text-slate-400">
								Las nuevas tarifas dentro de este nivel heredarán la regla.
							</p>
						) : null}
						{isAssigning && isCheckingAssignment ? (
							<p className="mt-1 text-xs text-slate-400">Comprobando asignaciones existentes…</p>
						) : null}
						{isAssigning &&
							assignmentPreview?.warnings.map((warning) => (
								<p key={warning} className="mt-1 text-xs text-amber-200">
									{warning}
								</p>
							))}
						{isAssigning &&
							assignmentPreview?.blockers.map((blocker) => (
								<p key={blocker} className="mt-1 text-xs text-rose-200">
									{blocker}
								</p>
							))}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{selectedHasDirectAssignments ? (
							<>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="text-slate-200 hover:bg-slate-800 hover:text-white"
									disabled={busy}
									onClick={() => perform("pause")}
								>
									Pausar directas
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="text-slate-200 hover:bg-slate-800 hover:text-white"
									disabled={busy}
									onClick={() => perform("inherit")}
								>
									Volver a herencia
								</Button>
							</>
						) : null}
						{isAssigning ? (
							<Button
								type="button"
								size="sm"
								variant="secondary"
								className="border-white bg-white text-slate-950 hover:bg-slate-100"
								disabled={
									busy ||
									!selectedRule ||
									(assignmentTiming === "schedule" && !effectiveFrom) ||
									isCheckingAssignment ||
									!assignmentPreview?.canApply
								}
								onClick={() => perform("assign")}
							>
								{busy ? (
									"Aplicando…"
								) : (
									<>
										<span className="sm:hidden">Asignar a {impactedRateCount}</span>
										<span className="hidden sm:inline">
											Asignar {assignmentDefinition?.name ?? "regla"} a {impactedRateCount} tarifa
											{impactedRateCount === 1 ? "" : "s"}
										</span>
									</>
								)}
							</Button>
						) : null}
					</div>
				</div>
			) : isAssigning ? (
				<p className="text-sm text-slate-500">Selecciona una fila para habilitar la asignación.</p>
			) : null}

			{inspectedRow ? (
				<SideSheet
					eyebrow="Aplicación efectiva"
					title={inspectedRow.name}
					description={`${inspectedRow.kind} · ${inspectedRow.coveredRateCount} de ${inspectedRow.totalRateCount} tarifas con cobertura`}
					onClose={() => setInspectedRow(null)}
				>
					<div className="space-y-6 text-sm">
						<section>
							<h3 className="font-semibold text-slate-950">Jerarquía</h3>
							<p className="mt-2 text-sm text-slate-600">{inspectedRow.pathLabels.join(" › ")}</p>
						</section>
						<section>
							<h3 className="font-semibold text-slate-950">Cobertura actual</h3>
							<p className="mt-2 text-slate-600">
								{inspectedRow.directAssignments.length
									? inspectedRow.directAssignments.map((assignment) => assignment.name).join(", ")
									: inspectedRow.isRate && inspectedRow.effectiveRules.length
										? inspectedRow.effectiveRules.map((rule) => rule.name).join(", ")
										: "No hay una regla aplicada directamente en este nivel."}
							</p>
							{!inspectedRow.isRate ? (
								<p className="mt-2 text-xs text-slate-500">
									Una asignación aquí se heredará a {inspectedRow.totalRateCount} tarifa
									{inspectedRow.totalRateCount === 1 ? "" : "s"} descendiente
									{inspectedRow.totalRateCount === 1 ? "" : "s"}.
								</p>
							) : null}
						</section>
						<section className="border-t border-slate-200 pt-5">
							<h3 className="font-semibold text-slate-950">Resolución</h3>
							<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
								<div>
									<dt className="text-xs text-slate-500">Nivel</dt>
									<dd className="mt-0.5 font-medium text-slate-900">
										{scopeLabel[inspectedRow.scope]}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-slate-500">Conflicto</dt>
									<dd className="mt-0.5 font-medium text-slate-900">
										{inspectedRow.conflict ? "Requiere revisión" : "Sin conflictos"}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-slate-500">Sincronización</dt>
									<dd className="mt-0.5 font-medium text-slate-900">
										{inspectedRow.syncStatus === "pending"
											? "Pendiente de confirmar"
											: inspectedRow.isRate
												? "Web directa lista"
												: "Se resuelve en sus tarifas"}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-slate-500">Vigencia</dt>
									<dd className="mt-0.5 font-medium text-slate-900">
										{formatDate(inspectedRow.directAssignments[0]?.effectiveFrom ?? null) ??
											"Inmediata"}
									</dd>
								</div>
							</dl>
						</section>
						{canManage && canAssignPublished ? (
							<div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
								<Button
									type="button"
									size="sm"
									onClick={() => {
										setSelected(new Map([[inspectedRow.key, inspectedRow]]))
										setIsAssigning(true)
										setInspectedRow(null)
									}}
								>
									Asignar en este nivel
								</Button>
							</div>
						) : null}
						{inspectedRow.isRate ? (
							<div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
								<Button
									href={`/provider/settings/tax-fees/simulator?ratePlanId=${encodeURIComponent(inspectedRow.scopeId)}${selectedRule ? `&definitionId=${encodeURIComponent(selectedRule)}` : ""}`}
									size="sm"
								>
									Comprobar en Simulador
								</Button>
							</div>
						) : null}
						<details className="border-t border-slate-200 pt-5">
							<summary className="cursor-pointer text-sm font-semibold text-slate-700">
								Información técnica
							</summary>
							<p className="mt-3 text-xs break-all text-slate-500">
								Recurso {inspectedRow.scopeId}
							</p>
						</details>
					</div>
				</SideSheet>
			) : null}
		</section>
	)
}
