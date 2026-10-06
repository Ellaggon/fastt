import {
	getVerticalOpsVocabulary,
	getVerticalVocabulary,
	normalizeVertical,
	type VerticalOpsVocabulary,
} from "@/lib/verticalVocabulary"

export type FinancialPresentationVocabulary = {
	vertical: string | null
	ops: VerticalOpsVocabulary
	scopeProduct: string
	scopeVariant: string
	productPlural: string
	stayGuestLabel: string
	evidenceSearchDescription: string
	evidenceSearchPlaceholder: string
	evidenceReasonPlaceholder: string
	workspaceSearchPlaceholder: string
}

function readScopeElement(): HTMLElement | null {
	if (typeof document === "undefined") return null
	return document.getElementById("financialScopeContext")
}

function parseEmbeddedOps(raw: string): VerticalOpsVocabulary | null {
	if (!raw) return null
	try {
		return JSON.parse(raw) as VerticalOpsVocabulary
	} catch {
		return null
	}
}

function capitalizeWord(value: string): string {
	if (!value) return value
	return value.charAt(0).toUpperCase() + value.slice(1)
}

export function resolveFinancialPresentationFromContext(input: {
	vertical?: string | null
	embeddedOps?: VerticalOpsVocabulary | null
	scopeProduct?: string
	scopeVariant?: string
	productPlural?: string
}): FinancialPresentationVocabulary {
	const vertical = String(input.vertical ?? "").trim() || null
	const presentation = buildPresentation(vertical, input.embeddedOps ?? null)
	if (input.scopeProduct) presentation.scopeProduct = input.scopeProduct
	if (input.scopeVariant) presentation.scopeVariant = input.scopeVariant
	if (input.productPlural) {
		presentation.productPlural = input.productPlural
		presentation.workspaceSearchPlaceholder = `Buscar reserva, ${input.productPlural}, proveedor o referencia...`
	}
	return presentation
}

function buildPresentation(
	vertical: string | null,
	embeddedOps: VerticalOpsVocabulary | null
): FinancialPresentationVocabulary {
	const normalized = normalizeVertical(vertical ?? "generic")
	const catalog = getVerticalVocabulary(normalized)
	const ops = embeddedOps ?? getVerticalOpsVocabulary(normalized)
	return {
		vertical: vertical || normalized,
		ops,
		scopeProduct: catalog.scopeProduct,
		scopeVariant: catalog.scopeVariant,
		productPlural: catalog.productPlural,
		stayGuestLabel: `${ops.stayWindow} y ${ops.guest}`,
		evidenceSearchDescription: `Busca por código, ${ops.guest} o fecha. Solo verás reservas de esta cuenta.`,
		evidenceSearchPlaceholder: `Código, ${ops.guest} o fecha (AAAA-MM-DD)`,
		evidenceReasonPlaceholder: `Ej. La referencia y el importe coinciden con el comprobante del ${ops.guest}.`,
		workspaceSearchPlaceholder: `Buscar reserva, ${catalog.productPlural}, proveedor o referencia...`,
	}
}

/**
 * Scope vocabulary drives the surrounding UI (search placeholder, switcher, headings). Row and
 * drawer copy pass the booking's own vertical so a mixed account (`scope=all`) still names a
 * tour as a tour and a stay as a stay instead of falling back to generic wording.
 */
export function getFinancialPresentationVocabulary(
	itemVertical?: unknown
): FinancialPresentationVocabulary {
	const context = readScopeElement()
	const scopeVertical = String(context?.dataset.vertical ?? "").trim() || null
	const ownVertical = normalizeItemVertical(itemVertical)
	if (ownVertical && ownVertical !== scopeVertical) {
		return resolveFinancialPresentationFromContext({ vertical: ownVertical })
	}
	return resolveFinancialPresentationFromContext({
		vertical: scopeVertical,
		embeddedOps: parseEmbeddedOps(String(context?.dataset.opsVocabulary ?? "")),
		scopeProduct: String(context?.dataset.scopeProduct ?? "").trim() || undefined,
		scopeVariant: String(context?.dataset.scopeVariant ?? "").trim() || undefined,
		productPlural: String(context?.dataset.productPlural ?? "").trim() || undefined,
	})
}

/** Accepts a vertical ("tour", "hotel") or a commercial line ("tour", "lodging"). */
export function normalizeItemVertical(value: unknown): string | null {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	if (!raw) return null
	if (raw === "lodging") return "hotel"
	const normalized = normalizeVertical(raw)
	return normalized === "generic" ? null : normalized
}

export function getFinancialOpsVocabulary(itemVertical?: unknown): VerticalOpsVocabulary {
	return getFinancialPresentationVocabulary(itemVertical).ops
}

export function financialScopeProductLabel(itemVertical?: unknown): string {
	return getFinancialPresentationVocabulary(itemVertical).scopeProduct
}

export function financialStayGuestLabel(itemVertical?: unknown): string {
	return getFinancialPresentationVocabulary(itemVertical).stayGuestLabel
}

export function financialProductNameFallback(itemVertical?: unknown): string {
	return capitalizeWord(getFinancialPresentationVocabulary(itemVertical).scopeProduct)
}

export function financialVariantNameFallback(itemVertical?: unknown): string {
	return getFinancialPresentationVocabulary(itemVertical).scopeVariant
}

export function applyFinancialOpsCopyToDocument(root: ParentNode = document): void {
	const copy = getFinancialPresentationVocabulary()
	const description = root.querySelector<HTMLElement>("#financialEvidenceAssociationDescription")
	if (description) description.textContent = copy.evidenceSearchDescription
	const search = root.querySelector<HTMLInputElement>("#financialEvidenceBookingSearch")
	if (search) search.placeholder = copy.evidenceSearchPlaceholder
	const reason = root.querySelector<HTMLTextAreaElement>("#financialEvidenceAssociationReason")
	if (reason) reason.placeholder = copy.evidenceReasonPlaceholder
	const workspaceSearch = root.querySelector<HTMLInputElement>("#financialSearchFilter")
	if (workspaceSearch) workspaceSearch.placeholder = copy.workspaceSearchPlaceholder
}
