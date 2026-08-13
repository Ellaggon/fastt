import { useEffect, useMemo, useState } from "react"

import { Button, Input, Select } from "../ui-react"

type Definition = { id: string; name: string; code: string }
type Assignment = {
	id: string
	definitionId: string
	name: string
	effectiveFrom: string | null
	effectiveTo: string | null
}
type Rate = {
	id: string
	name: string
	isActive: boolean
	directAssignments: Assignment[]
	effectiveRules: Array<{
		id: string
		name: string
		code: string
		source: string
		inherited: boolean
	}>
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
	scope: AssignableScope
	scopeId: string
	assignments: Assignment[]
	name: string
}
type CoverageRow = {
	key: string
	level: 0 | 1 | 2 | 3
	scope: AssignableScope
	scopeId: string
	name: string
	kind: string
	directAssignments: Assignment[]
	effectiveRules: Rate["effectiveRules"]
	conflict: boolean
	isRate: boolean
}

const scopeLabel: Record<string, string> = {
	provider: "Proveedor",
	product: "Producto",
	variant: "Unidad",
	rate_plan: "Tarifa",
}

export default function FiscalAssignmentsMatrix({
	canManage,
	selectedScopeId,
}: {
	canManage: boolean
	selectedScopeId?: string | null
}) {
	const [tree, setTree] = useState<Tree | null>(null)
	const [context, setContext] = useState("all")
	const [productId, setProductId] = useState(selectedScopeId ?? "all")
	const [ruleId, setRuleId] = useState("all")
	const [channel, setChannel] = useState("")
	const [showInherited, setShowInherited] = useState(true)
	const [onlyConflicts, setOnlyConflicts] = useState(false)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [selected, setSelected] = useState<Map<string, SelectedResource>>(new Map())
	const [isAssigning, setIsAssigning] = useState(false)
	const [view, setView] = useState<"coverage" | "matrix">("coverage")
	const [selectedRule, setSelectedRule] = useState("")
	const [effectiveFrom, setEffectiveFrom] = useState("")
	const [effectiveTo, setEffectiveTo] = useState("")
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState("")

	const load = async () => {
		const params = new URLSearchParams()
		if (channel) params.set("channel", channel)
		if (selectedScopeId) params.set("scope", selectedScopeId)
		const response = await fetch(`/api/provider/tax-fees/assignments/tree?${params.toString()}`)
		if (!response.ok) throw new Error("No se pudieron cargar las asignaciones")
		const data = (await response.json()) as Tree
		setTree(data)
		setExpanded(new Set(data.products.map((product) => product.id)))
	}
	useEffect(() => {
		load().catch((error) => setMessage(error.message))
	}, [channel, selectedScopeId])

	const visibleProducts = useMemo(
		() =>
			(tree?.products ?? []).filter((product) => {
				if (
					context !== "all" &&
					!String(product.productType).toLowerCase().includes(context.slice(0, -1))
				)
					return false
				return productId === "all" || product.id === productId
			}),
		[tree, context, productId]
	)
	const coverageRows = useMemo<CoverageRow[]>(() => {
		if (!tree) return []
		const rows: CoverageRow[] = []
		if (productId === "all" && context === "all") {
			rows.push({
				key: `provider:${tree.provider.id}`,
				level: 0,
				scope: "provider",
				scopeId: tree.provider.id,
				name: tree.provider.name,
				kind: "Cuenta",
				directAssignments: tree.provider.directAssignments,
				effectiveRules: [],
				conflict: false,
				isRate: false,
			})
		}
		for (const product of visibleProducts) {
			const matchesRule = (assignments: Assignment[], rates: Rate[]) =>
				ruleId === "all" ||
				assignments.some((assignment) => assignment.definitionId === ruleId) ||
				rates.some(
					(rate) =>
						rate.directAssignments.some((assignment) => assignment.definitionId === ruleId) ||
						rate.effectiveRules.some((rule) => rule.id === ruleId)
				)
			if (
				!matchesRule(
					product.directAssignments,
					product.variants.flatMap((variant) => variant.rates)
				)
			)
				continue
			rows.push({
				key: `product:${product.id}`,
				level: 1,
				scope: "product",
				scopeId: product.id,
				name: product.name,
				kind: product.productTypeLabel,
				directAssignments: product.directAssignments,
				effectiveRules: [],
				conflict: false,
				isRate: false,
			})
			for (const variant of product.variants) {
				if (!matchesRule(variant.directAssignments, variant.rates)) continue
				rows.push({
					key: `variant:${variant.id}`,
					level: 2,
					scope: "variant",
					scopeId: variant.id,
					name: variant.name,
					kind: variant.kind,
					directAssignments: variant.directAssignments,
					effectiveRules: [],
					conflict: false,
					isRate: false,
				})
				for (const rate of variant.rates) {
					if (
						ruleId !== "all" &&
						!rate.directAssignments.some((assignment) => assignment.definitionId === ruleId) &&
						!rate.effectiveRules.some((rule) => rule.id === ruleId)
					)
						continue
					if (onlyConflicts && !rate.conflict) continue
					rows.push({
						key: `rate_plan:${rate.id}`,
						level: 3,
						scope: "rate_plan",
						scopeId: rate.id,
						name: rate.name,
						kind: "Tarifa",
						directAssignments: rate.directAssignments,
						effectiveRules: rate.effectiveRules,
						conflict: rate.conflict,
						isRate: true,
					})
				}
			}
		}
		return rows
	}, [context, onlyConflicts, productId, ruleId, tree, visibleProducts])
	const canAssignPublished = canManage && Boolean(tree?.definitions.length)
	const selectedResources = [...selected.values()]
	const toggleExpanded = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})
	const toggleSelected = (resource: SelectedResource) =>
		setSelected((current) => {
			const next = new Map(current)
			const key = `${resource.scope}:${resource.scopeId}`
			next.has(key) ? next.delete(key) : next.set(key, resource)
			return next
		})
	const selectForAssignment = (resource: SelectedResource) => {
		setSelected((current) => {
			const key = `${resource.scope}:${resource.scopeId}`
			if (current.has(key)) return current
			const next = new Map(current)
			next.set(key, resource)
			return next
		})
		setIsAssigning(true)
	}
	const perform = async (operation: "assign" | "pause" | "inherit") => {
		if (!selectedResources.length || (operation === "assign" && !selectedRule)) return
		setBusy(true)
		setMessage("")
		try {
			const targets =
				operation === "assign"
					? selectedResources.map((target) => ({
							scope: target.scope,
							scopeId: target.scopeId,
							channel: channel || null,
							effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
							effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
						}))
					: selectedResources.flatMap((target) =>
							target.assignments.map((assignment) => ({
								scope: target.scope,
								scopeId: target.scopeId,
								assignmentId: assignment.id,
							}))
						)
			if (!targets.length)
				throw new Error("Las tarifas seleccionadas no tienen una asignación directa para modificar")
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
			setMessage(
				operation === "assign"
					? "Reglas asignadas."
					: operation === "pause"
						? "Asignaciones pausadas."
						: "Se restauró la herencia."
			)
			setSelected(new Map())
			setIsAssigning(false)
			await load()
		} catch (error: any) {
			setMessage(error.message ?? "No se pudo completar la operación")
		} finally {
			setBusy(false)
		}
	}

	return (
		<section aria-labelledby="assignments-heading" className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
				<div>
					<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
						Cobertura comercial
					</p>
					<h2 id="assignments-heading" className="mt-1 text-lg font-semibold text-slate-950">
						Asignaciones
					</h2>
				</div>
				{canManage && (
					<Button type="button" disabled={!canAssignPublished} onClick={() => setIsAssigning(true)}>
						Asignar reglas
					</Button>
				)}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
				<div className="flex gap-5" role="tablist" aria-label="Vista de asignaciones">
					<button
						type="button"
						role="tab"
						aria-selected={view === "coverage"}
						onClick={() => setView("coverage")}
						className={`border-b-2 pb-2 text-sm font-semibold ${view === "coverage" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}
					>
						Cobertura
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={view === "matrix"}
						onClick={() => setView("matrix")}
						className={`border-b-2 pb-2 text-sm font-semibold ${view === "matrix" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}
					>
						Vista avanzada
					</button>
				</div>
				<p className="text-sm text-slate-600">
					{coverageRows.filter((row) => row.isRate && row.effectiveRules.length === 0).length}{" "}
					tarifas sin regla efectiva
				</p>
			</div>

			<div className="grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-2 lg:grid-cols-6">
				<label className="text-xs font-medium text-slate-600">
					Contexto
					<Select
						value={context}
						onChange={(event) => setContext(event.target.value)}
						className="mt-1 h-9"
					>
						<option value="all">Todo</option>
						<option value="hotels">Hoteles</option>
						<option value="tours">Tours</option>
					</Select>
				</label>
				<label className="text-xs font-medium text-slate-600">
					Producto
					<Select
						value={productId}
						onChange={(event) => setProductId(event.target.value)}
						className="mt-1 h-9"
					>
						<option value="all">Todos</option>
						{tree?.products.map((product) => (
							<option key={product.id} value={product.id}>
								{product.name}
							</option>
						))}
					</Select>
				</label>
				<label className="text-xs font-medium text-slate-600">
					Canal
					<Select
						value={channel}
						onChange={(event) => setChannel(event.target.value)}
						className="mt-1 h-9"
					>
						<option value="">Todos</option>
						<option value="web">Web directo</option>
					</Select>
				</label>
				<label className="text-xs font-medium text-slate-600">
					Regla
					<Select
						value={ruleId}
						onChange={(event) => setRuleId(event.target.value)}
						className="mt-1 h-9"
					>
						<option value="all">Todas</option>
						{tree?.definitions.map((definition) => (
							<option key={definition.id} value={definition.id}>
								{definition.name}
							</option>
						))}
					</Select>
				</label>
				<label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
					<input
						type="checkbox"
						checked={showInherited}
						onChange={(event) => setShowInherited(event.target.checked)}
					/>
					Mostrar heredadas
				</label>
				<label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
					<input
						type="checkbox"
						checked={onlyConflicts}
						onChange={(event) => setOnlyConflicts(event.target.checked)}
					/>
					Solo conflictos
				</label>
			</div>

			{isAssigning && (
				<div className="grid gap-3 border-y border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
					<label className="text-xs font-medium text-slate-600">
						Regla para {selectedResources.length} recurso{selectedResources.length === 1 ? "" : "s"}
						<Select
							value={selectedRule}
							onChange={(event) => setSelectedRule(event.target.value)}
							className="mt-1 h-9"
						>
							<option value="">Selecciona una regla</option>
							{tree?.definitions.map((definition) => (
								<option key={definition.id} value={definition.id}>
									{definition.name} ({definition.code})
								</option>
							))}
						</Select>
					</label>
					<label className="text-xs font-medium text-slate-600">
						Inicio
						<Input
							type="datetime-local"
							value={effectiveFrom}
							onChange={(event) => setEffectiveFrom(event.target.value)}
							className="mt-1 h-9"
						/>
					</label>
					<label className="text-xs font-medium text-slate-600">
						Fin
						<Input
							type="datetime-local"
							value={effectiveTo}
							onChange={(event) => setEffectiveTo(event.target.value)}
							className="mt-1 h-9"
						/>
					</label>
					<div className="flex items-end gap-2">
						<Button
							type="button"
							disabled={busy || !selectedResources.length || !selectedRule}
							onClick={() => perform("assign")}
						>
							Aplicar
						</Button>
						<Button type="button" variant="ghost" onClick={() => setIsAssigning(false)}>
							Cancelar
						</Button>
					</div>
				</div>
			)}
			{selectedResources.length > 0 && (
				<div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3 text-sm">
					<span className="font-medium text-slate-900">
						{selectedResources.length} recursos seleccionados
					</span>
					{canManage && (
						<>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={busy}
								onClick={() => perform("pause")}
							>
								Pausar directas
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={busy}
								onClick={() => perform("inherit")}
							>
								Volver a herencia
							</Button>
						</>
					)}
				</div>
			)}
			{message && (
				<p role="status" className="text-sm text-slate-700">
					{message}
				</p>
			)}

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

			{view === "coverage" ? (
				<div className="overflow-x-auto border-y border-slate-200">
					<table className="w-full min-w-[800px] text-left text-sm">
						<thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
							<tr>
								<th className="w-10 px-3 py-3"></th>
								<th className="px-3 py-3">Recurso</th>
								<th className="px-3 py-3">Reglas aplicadas</th>
								<th className="px-3 py-3">Origen</th>
								<th className="px-3 py-3">Estado</th>
								<th className="px-3 py-3 text-right">Acciones</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{coverageRows.map((row) => {
								const isSelected = selected.has(row.key)
								const inheritedSources = row.effectiveRules
									.filter((rule) => rule.inherited)
									.map((rule) => scopeLabel[rule.source])
									.filter((value, index, values) => values.indexOf(value) === index)
								const applied = row.isRate
									? row.effectiveRules
									: row.directAssignments.map((assignment) => ({ name: assignment.name }))
								return (
									<tr
										key={row.key}
										className={row.level < 3 ? "bg-slate-50/70" : "hover:bg-slate-50"}
									>
										<td className="px-3 py-3">
											{canAssignPublished ? (
												<input
													type="checkbox"
													aria-label={`Seleccionar ${row.name}`}
													checked={isSelected}
													onChange={() =>
														toggleSelected({
															scope: row.scope,
															scopeId: row.scopeId,
															assignments: row.directAssignments,
															name: row.name,
														})
													}
												/>
											) : null}
										</td>
										<td className="px-3 py-3">
											<p
												className={
													row.level < 2
														? "font-semibold text-slate-950"
														: "font-medium text-slate-950"
												}
												style={{ paddingLeft: `${row.level * 16}px` }}
											>
												{row.name}
											</p>
											<p
												className="mt-0.5 text-xs text-slate-500"
												style={{ paddingLeft: `${row.level * 16}px` }}
											>
												{row.kind}
											</p>
										</td>
										<td className="px-3 py-3 text-slate-700">
											{applied.length
												? applied.map((rule) => rule.name).join(", ")
												: row.isRate
													? "Sin regla"
													: "Sin asignación directa"}
										</td>
										<td className="px-3 py-3 text-slate-600">
											{row.isRate ? inheritedSources.join(", ") || "Directa o sin regla" : "—"}
										</td>
										<td className="px-3 py-3">
											{row.conflict ? (
												<span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">
													Conflicto
												</span>
											) : row.isRate && row.effectiveRules.length === 0 ? (
												<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
													Sin cobertura
												</span>
											) : (
												<span className="text-slate-600">Correcto</span>
											)}
										</td>
										<td className="px-3 py-3 text-right">
											<span className="inline-flex items-center gap-3">
												{canAssignPublished ? (
													<Button
														type="button"
														size="sm"
														variant="ghost"
														onClick={() =>
															selectForAssignment({
																scope: row.scope,
																scopeId: row.scopeId,
																assignments: row.directAssignments,
																name: row.name,
															})
														}
													>
														Asignar
													</Button>
												) : canManage ? (
													<Button href="/provider/settings/tax-fees" size="sm" variant="ghost">
														Completar regla
													</Button>
												) : null}
												{row.isRate ? (
													<Button
														href={`/provider/settings/tax-fees/simulator?ratePlanId=${encodeURIComponent(row.scopeId)}`}
														size="sm"
														variant="ghost"
													>
														Simular
													</Button>
												) : null}
											</span>
										</td>
									</tr>
								)
							})}
							{!coverageRows.length ? (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
										No hay recursos que coincidan con los filtros.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			) : (
				<div className="overflow-x-auto rounded-md border border-slate-200">
					<table className="w-full min-w-[1020px] text-left text-sm">
						<thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-[0.08em] text-slate-500 uppercase">
							<tr>
								<th className="w-10 px-3 py-3"></th>
								<th className="py-3 pr-3 font-semibold">Recurso</th>
								<th className="px-3 py-3 font-semibold">Directa</th>
								<th className="px-3 py-3 font-semibold">Efectivas</th>
								<th className="px-3 py-3 font-semibold">Herencia</th>
								<th className="px-3 py-3 font-semibold">Conflicto</th>
								<th className="px-3 py-3 font-semibold">Sincronización</th>
								<th className="px-3 py-3 font-semibold">Vigencia</th>
								<th className="px-3 py-3 font-semibold">Resultado</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{tree && (
								<tr className="bg-slate-100">
									<td className="px-3 py-3"></td>
									<td className="py-3 font-semibold text-slate-950">{tree.provider.name}</td>
									<td className="px-3 py-3 text-slate-700">
										{tree.provider.directAssignments.map((item) => item.name).join(", ") || "—"}
									</td>
									<td colSpan={6}></td>
								</tr>
							)}
							{visibleProducts.map((product) => (
								<ProductRows
									key={product.id}
									product={product}
									expanded={expanded}
									toggleExpanded={toggleExpanded}
									selected={selected}
									toggleSelected={toggleSelected}
									ruleId={ruleId}
									showInherited={showInherited}
									onlyConflicts={onlyConflicts}
								/>
							))}
							{tree && !visibleProducts.length && (
								<tr>
									<td colSpan={9} className="px-4 py-10 text-center text-slate-600">
										No hay recursos que coincidan con los filtros.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}

function ProductRows({
	product,
	expanded,
	toggleExpanded,
	selected,
	toggleSelected,
	ruleId,
	showInherited,
	onlyConflicts,
}: {
	product: Product
	expanded: Set<string>
	toggleExpanded: (id: string) => void
	selected: Map<string, any>
	toggleSelected: (resource: SelectedResource) => void
	ruleId: string
	showInherited: boolean
	onlyConflicts: boolean
}) {
	const productOpen = expanded.has(product.id)
	return (
		<>
			<tr className="bg-slate-50">
				<td className="px-3 py-3">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						aria-label={`Alternar ${product.name}`}
						onClick={() => toggleExpanded(product.id)}
					>
						{productOpen ? "−" : "+"}
					</Button>
				</td>
				<td className="py-3 font-semibold text-slate-950">
					{product.name}{" "}
					<span className="ml-2 font-normal text-slate-500">{product.productTypeLabel}</span>
				</td>
				<td className="px-3 py-3 text-slate-700">
					{product.directAssignments.map((item) => item.name).join(", ") || "—"}
				</td>
				<td colSpan={6}></td>
			</tr>
			{productOpen &&
				product.variants.map((variant) => (
					<VariantRows
						key={variant.id}
						variant={variant}
						expanded={expanded}
						toggleExpanded={toggleExpanded}
						selected={selected}
						toggleSelected={toggleSelected}
						ruleId={ruleId}
						showInherited={showInherited}
						onlyConflicts={onlyConflicts}
					/>
				))}
		</>
	)
}

function VariantRows({
	variant,
	expanded,
	toggleExpanded,
	selected,
	toggleSelected,
	ruleId,
	showInherited,
	onlyConflicts,
}: {
	variant: Variant
	expanded: Set<string>
	toggleExpanded: (id: string) => void
	selected: Map<string, any>
	toggleSelected: (resource: SelectedResource) => void
	ruleId: string
	showInherited: boolean
	onlyConflicts: boolean
}) {
	const visibleRates = variant.rates.filter(
		(rate) =>
			(ruleId === "all" ||
				rate.effectiveRules.some((rule) => rule.id === ruleId) ||
				rate.directAssignments.some((assignment) => assignment.definitionId === ruleId)) &&
			(!onlyConflicts || rate.conflict)
	)
	if (!visibleRates.length) return null
	const open = expanded.has(variant.id)
	return (
		<>
			<tr>
				<td className="px-3 py-3">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						aria-label={`Alternar ${variant.name}`}
						onClick={() => toggleExpanded(variant.id)}
					>
						{open ? "−" : "+"}
					</Button>
				</td>
				<td className="py-3 pl-6 font-medium text-slate-800">
					{variant.name} <span className="ml-2 text-slate-500">{variant.kind}</span>
				</td>
				<td className="px-3 py-3 text-slate-700">
					{variant.directAssignments.map((item) => item.name).join(", ") || "—"}
				</td>
				<td colSpan={6}></td>
			</tr>
			{open &&
				visibleRates.map((rate) => (
					<tr key={rate.id} className="hover:bg-slate-50">
						<td className="px-3 py-3">
							<input
								aria-label={`Seleccionar ${rate.name}`}
								type="checkbox"
								checked={selected.has(`rate_plan:${rate.id}`)}
								onChange={() =>
									toggleSelected({
										scope: "rate_plan",
										scopeId: rate.id,
										assignments: rate.directAssignments,
										name: rate.name,
									})
								}
							/>
						</td>
						<td className="py-3 pl-12 font-medium text-slate-900">{rate.name}</td>
						<td className="px-3 py-3 text-slate-700">
							{rate.directAssignments.length
								? rate.directAssignments.map((assignment) => assignment.name).join(", ")
								: "—"}
						</td>
						<td className="px-3 py-3 text-slate-700">
							{rate.effectiveRules.length} regla{rate.effectiveRules.length === 1 ? "" : "s"}
						</td>
						<td className="px-3 py-3 text-slate-700">
							{showInherited
								? rate.effectiveRules
										.filter((rule) => rule.inherited)
										.map((rule) => scopeLabel[rule.source])
										.filter((value, index, values) => values.indexOf(value) === index)
										.join(", ") || "—"
								: "Oculta"}
						</td>
						<td className="px-3 py-3">
							{rate.conflict ? (
								<span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">
									Revisar
								</span>
							) : (
								"—"
							)}
						</td>
						<td className="px-3 py-3">
							<span
								className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rate.syncStatus === "ready" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
							>
								{rate.syncStatus === "ready" ? "Lista" : "Pendiente"}
							</span>
						</td>
						<td className="px-3 py-3 text-slate-600">
							{rate.directAssignments[0]?.effectiveFrom
								? new Intl.DateTimeFormat("es", { dateStyle: "short" }).format(
										new Date(rate.directAssignments[0].effectiveFrom)
									)
								: "Inmediata"}
						</td>
						<td className="px-3 py-3">
							<a
								href={`/provider/settings/tax-fees/simulator?ratePlanId=${encodeURIComponent(rate.id)}`}
								className="text-slate-700 underline underline-offset-4"
							>
								Por qué aplica
							</a>
						</td>
					</tr>
				))}
		</>
	)
}
