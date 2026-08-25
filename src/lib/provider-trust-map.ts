/**
 * V0 — Trust map IA + glosario ES único para Verificación.
 *
 * Separación crítica (Airbnb-style):
 * - Cuenta (identity review) ≠ Documentos (KYC uploads)
 * - «Pendiente» queda prohibido en UI host: colisiona cuenta vs docs.
 *
 * Cuenta:  En revisión | Lista | Requiere cambios
 * Docs:    Falta | Enviado | Verificado | Requiere cambios
 * Trust:   Identidad → Negocio → Fiscal → Pagos
 */

import { routes } from "@/lib/routes"

export type TrustLinkId = "identity" | "business" | "fiscal" | "payments"

/** Aggregate state for a trust-map pill (not a raw DB status). */
export type TrustLinkUiState = "ready" | "in_review" | "action_needed" | "not_started" | "blocked"

export type TrustLinkTone = "success" | "warning" | "error" | "neutral" | "info"

export type ProviderTrustLink = {
	id: TrustLinkId
	/** Short rail label */
	label: string
	/** One-line job description */
	description: string
	href: string
	uiState: TrustLinkUiState
	stateLabel: string
	tone: TrustLinkTone
	/** True when this is the recommended next step */
	isFocus: boolean
}

export type AccountVerificationStatus = "approved" | "rejected" | "pending" | string

export type DocumentKycUiState = "missing" | "pending" | "verified" | "rejected"

/** Canonical glossary — single source of truth for host-facing copy. */
export const TRUST_GLOSSARY = {
	account: {
		inReview: "En revisión",
		ready: "Lista",
		needsChanges: "Requiere cambios",
		/** @deprecated Do not use in UI — collides with document language. */
		legacyPending: "Pendiente",
	},
	document: {
		missing: "Falta",
		submitted: "Enviado",
		verified: "Verificado",
		needsChanges: "Requiere cambios",
	},
	matrix: {
		ready: "Listo",
		submitted: "Enviado",
		missing: "Falta",
	},
	trustLink: {
		ready: "Listo",
		inReview: "En revisión",
		actionNeeded: "Completar",
		notStarted: "Por hacer",
		blocked: "En espera",
	},
	links: {
		identity: {
			label: "Identidad",
			description: "Revisión de la cuenta del proveedor (quién opera).",
		},
		business: {
			label: "Negocio",
			description: "Documentos mínimos: identidad, registro y respaldo fiscal.",
		},
		fiscal: {
			label: "Fiscal",
			description: "NIT/TIN y residencia fiscal para liquidaciones.",
		},
		payments: {
			label: "Pagos",
			description: "Cuenta de cobro verificada para recibir liquidaciones.",
		},
	},
	page: {
		eyebrow: "Cuenta del proveedor",
		heading: "Verificación",
		description:
			"Cuatro eslabones de confianza. Completa el próximo paso: la cuenta y los documentos son cosas distintas.",
		railTitle: "Cuenta",
		railHint: "",
		railComplete: "Cuenta lista",
		deferOtherSlot: "En espera — termina primero el documento en foco.",
		accountVsDocs:
			"La cuenta en revisión no sustituye los documentos. Sin los mínimos verificados no puedes cobrar con confianza.",
		readyEyebrow: "Lista",
		readyTitle: "Confianza del proveedor lista",
		readyBody:
			"Identidad, negocio, fiscal y pagos están listos. Puedes publicar o revisar liquidaciones.",
		readyPrimaryCta: "Publicar producto",
		readySecondaryCta: "Ir a pagos",
	},
	/** Destinos fuera de Verificación (dueños reales de los datos). */
	crossLinks: {
		profile: {
			label: "Perfil",
			hint: "Razón social / nombre legal",
		},
		fiscal: {
			label: "Fiscal",
			hint: "NIT / TIN",
		},
		payments: {
			label: "Pagos",
			hint: "Cuenta de cobro",
		},
	},
	/** Post-save on data surfaces → return to the verification wizard. */
	returnToVerification: {
		label: "Volver a Verificación",
		hint: "Sigue el mapa de confianza y los documentos mínimos.",
	},
} as const

export const PROFILE_LEGAL_NAME_HREF = `${routes.providerSettingsProfile()}#legalName`

export type VerificationCrossLinkId = "profile" | "fiscal" | "payments"

export type VerificationCrossLink = {
	id: VerificationCrossLinkId
	label: string
	hint: string
	href: string
	/** Recommended related destination for the current next step */
	emphasized: boolean
}

/**
 * Persistent cross-links: Perfil (legal name) · Fiscal (TIN) · Pagos (siguiente).
 * Verificación no es dueña de estos datos; solo enlaza.
 *
 * P1 density: when `onlyOffPage`, hide during on-page upload/access jobs so the
 * fold stays one job (no «También conecta» beside Enviar a revisión).
 */
export function shouldShowVerificationCrossLinks(params: {
	ctaKind?: "upload" | "access" | "status" | "navigate" | null
	nextStepLinkId?: TrustLinkId | null
	legalNameComplete?: boolean
}): boolean {
	if (params.legalNameComplete === false) return true
	const kind = params.ctaKind ?? "navigate"
	if (kind === "upload" || kind === "access") return false
	if (kind === "status" && params.nextStepLinkId === "business") return false
	return true
}

/**
 * P1 wait/status: hide yellow «Qué se bloquea» when the active job is upload/access,
 * the hero already owns consequence (anchorsKyc), or docs are already in flight / done
 * (no missing/rejected actionable gaps).
 */
export function shouldSuppressVerificationStatusWarning(params: {
	ctaKind?: "upload" | "access" | "status" | "navigate" | null
	anchorsKyc?: boolean
	/** true if any required KYC slot is still missing or rejected */
	hasActionableDocumentGaps?: boolean
}): boolean {
	const kind = params.ctaKind ?? "navigate"
	if (kind === "upload" || kind === "access") return true
	if (params.anchorsKyc) return true
	if (params.hasActionableDocumentGaps === false) return true
	return false
}

export function buildVerificationCrossLinks(params: {
	legalNameComplete?: boolean
	nextStepLinkId?: TrustLinkId | null
	fiscalReady?: boolean
	paymentsReady?: boolean
	/** Hide during on-page upload / access (default false for hub uses). */
	onlyOffPage?: boolean
	ctaKind?: "upload" | "access" | "status" | "navigate" | null
}): VerificationCrossLink[] {
	if (
		params.onlyOffPage &&
		!shouldShowVerificationCrossLinks({
			ctaKind: params.ctaKind,
			nextStepLinkId: params.nextStepLinkId,
			legalNameComplete: params.legalNameComplete,
		})
	) {
		return []
	}

	const legalNameComplete = Boolean(params.legalNameComplete)
	const nextId = params.nextStepLinkId ?? null
	const fiscalReady = Boolean(params.fiscalReady)
	const paymentsReady = Boolean(params.paymentsReady)

	let emphasized: VerificationCrossLinkId = "fiscal"
	if (!legalNameComplete) {
		emphasized = "profile"
	} else if (nextId === "payments" || (fiscalReady && !paymentsReady && nextId !== "fiscal")) {
		emphasized = "payments"
	} else if (nextId === "fiscal" || nextId === "business") {
		emphasized = "fiscal"
	} else if (nextId === "identity") {
		emphasized = "profile"
	}

	return [
		{
			id: "profile",
			label: TRUST_GLOSSARY.crossLinks.profile.label,
			hint: TRUST_GLOSSARY.crossLinks.profile.hint,
			href: PROFILE_LEGAL_NAME_HREF,
			emphasized: emphasized === "profile",
		},
		{
			id: "fiscal",
			label: TRUST_GLOSSARY.crossLinks.fiscal.label,
			hint: TRUST_GLOSSARY.crossLinks.fiscal.hint,
			href: routes.providerSettingsVerificationFiscal(),
			emphasized: emphasized === "fiscal",
		},
		{
			id: "payments",
			label: TRUST_GLOSSARY.crossLinks.payments.label,
			hint: TRUST_GLOSSARY.crossLinks.payments.hint,
			href: routes.providerSettingsVerificationPayments(),
			emphasized: emphasized === "payments",
		},
	]
}

export type TrustAlignedHubCoach = {
	label: string
	body: string
	ctaLabel: string
	href: string
}

/**
 * Hub coach copy aligned with trust-map language (cuenta vs docs; Perfil/Fiscal/Pagos).
 */
export function resolveTrustAlignedHubCoach(
	blocker: { id: string; label: string; href: string } | null | undefined
): TrustAlignedHubCoach | null {
	if (!blocker?.id) return null
	const id = String(blocker.id)

	if (id === "identity") {
		return {
			label: "Perfil: completa la razón social",
			body: "Nombre comercial y razón social viven en Perfil. Verificación los lee; no los reescribe.",
			ctaLabel: "Completar perfil",
			href: PROFILE_LEGAL_NAME_HREF,
		}
	}
	if (id === "operations") {
		return {
			label: "Perfil: contacto operativo",
			body: "Zona horaria, moneda y soporte se configuran en Perfil (operación).",
			ctaLabel: "Abrir perfil",
			href: `${routes.providerSettingsProfile()}#ops`,
		}
	}
	if (id === "verification") {
		return {
			label: "Identidad: cuenta en revisión",
			body: "La cuenta y los documentos son cosas distintas. Revisa el estado en Verificación.",
			ctaLabel: "Ver identidad",
			href: blocker.href || routes.providerSettingsVerification(),
		}
	}
	if (id === "documents") {
		return {
			label: "Negocio: faltan documentos mínimos",
			body: "Un documento a la vez en Verificación. Sin los mínimos verificados no puedes liquidar con confianza.",
			ctaLabel: "Continuar en verificación",
			href: `${routes.providerSettingsVerification()}#kyc-slots`,
		}
	}
	if (id === "fiscality") {
		return {
			label: "Fiscal: verifica NIT/TIN",
			body: "El registro fiscal (NIT/TIN y residencia) se completa como parte del mapa de Verificación.",
			ctaLabel: "Ir a registro fiscal",
			href: routes.providerSettingsVerificationFiscal(),
		}
	}
	if (id === "payments") {
		return {
			label: "Pagos: verifica cuenta de cobro",
			body: "Añade o confirma la cuenta bancaria para recibir liquidaciones.",
			ctaLabel: "Ir a pagos",
			href: routes.providerSettingsVerificationPayments(),
		}
	}
	if (id === "team") {
		return {
			label: blocker.label,
			body: "Revisa equipo y permisos para poder operar con roles claros.",
			ctaLabel: `Continuar: ${blocker.label}`,
			href: blocker.href,
		}
	}

	return {
		label: blocker.label,
		body: "Un solo paso del mapa de confianza a la vez: Perfil → Verificación → Fiscal → Pagos.",
		ctaLabel: `Continuar: ${blocker.label}`,
		href: blocker.href,
	}
}

export function labelAccountVerificationStatus(status: AccountVerificationStatus): {
	label: string
	tone: TrustLinkTone
	uiState: TrustLinkUiState
} {
	const raw = String(status ?? "pending")
		.trim()
		.toLowerCase()
	if (raw === "approved") {
		return {
			label: TRUST_GLOSSARY.account.ready,
			tone: "success",
			uiState: "ready",
		}
	}
	if (raw === "rejected") {
		return {
			label: TRUST_GLOSSARY.account.needsChanges,
			tone: "error",
			uiState: "action_needed",
		}
	}
	return {
		label: TRUST_GLOSSARY.account.inReview,
		tone: "warning",
		uiState: "in_review",
	}
}

export function labelDocumentKycState(state: DocumentKycUiState): string {
	switch (state) {
		case "verified":
			return TRUST_GLOSSARY.document.verified
		case "pending":
			return TRUST_GLOSSARY.document.submitted
		case "rejected":
			return TRUST_GLOSSARY.document.needsChanges
		case "missing":
		default:
			return TRUST_GLOSSARY.document.missing
	}
}

export function labelDocumentRecordStatus(status: string): string {
	const raw = String(status ?? "")
		.trim()
		.toLowerCase()
	if (raw === "verified") return TRUST_GLOSSARY.document.verified
	if (raw === "pending") return TRUST_GLOSSARY.document.submitted
	if (raw === "rejected") return TRUST_GLOSSARY.document.needsChanges
	if (raw === "superseded") return "Reemplazado"
	return TRUST_GLOSSARY.document.missing
}

export function labelMatrixCheckState(params: { complete: boolean; pending?: boolean }): string {
	if (params.complete) return TRUST_GLOSSARY.matrix.ready
	if (params.pending) return TRUST_GLOSSARY.matrix.submitted
	return TRUST_GLOSSARY.matrix.missing
}

function trustLinkStateLabel(uiState: TrustLinkUiState): string {
	switch (uiState) {
		case "ready":
			return TRUST_GLOSSARY.trustLink.ready
		case "in_review":
			return TRUST_GLOSSARY.trustLink.inReview
		case "action_needed":
			return TRUST_GLOSSARY.trustLink.actionNeeded
		case "blocked":
			return TRUST_GLOSSARY.trustLink.blocked
		case "not_started":
		default:
			return TRUST_GLOSSARY.trustLink.notStarted
	}
}

function trustLinkTone(uiState: TrustLinkUiState): TrustLinkTone {
	switch (uiState) {
		case "ready":
			return "success"
		case "in_review":
			return "warning"
		case "action_needed":
			return "error"
		case "blocked":
			return "neutral"
		case "not_started":
		default:
			return "info"
	}
}

function resolveBusinessUiState(params: {
	documentsComplete: boolean
	hasRejectedDocs: boolean
	hasSubmittedDocs: boolean
	hasMissingDocs: boolean
}): TrustLinkUiState {
	if (params.documentsComplete) return "ready"
	if (params.hasRejectedDocs || params.hasMissingDocs) return "action_needed"
	if (params.hasSubmittedDocs) return "in_review"
	return "not_started"
}

function resolveFiscalUiState(status: string | null | undefined): TrustLinkUiState {
	const raw = String(status ?? "not_configured")
		.trim()
		.toLowerCase()
	if (raw === "verified") return "ready"
	if (raw === "pending") return "in_review"
	if (raw === "requires_attention") return "action_needed"
	return "not_started"
}

function resolvePaymentsUiState(params: {
	verifiedPaymentAccounts: number
	pendingPaymentAccounts: number
}): TrustLinkUiState {
	if (params.verifiedPaymentAccounts > 0) return "ready"
	if (params.pendingPaymentAccounts > 0) return "in_review"
	return "not_started"
}

export type BuildProviderTrustMapInput = {
	accountStatus?: AccountVerificationStatus | null
	documentsComplete?: boolean
	hasRejectedDocs?: boolean
	hasSubmittedDocs?: boolean
	hasMissingDocs?: boolean
	fiscalStatus?: string | null
	verifiedPaymentAccounts?: number
	pendingPaymentAccounts?: number
	/**
	 * Perfil razón social / nombre comercial. When false, Identidad stays action_needed
	 * so Lista cannot light up with an incomplete Perfil (journey gate).
	 * Default true when omitted (backward compatible for unit fixtures).
	 */
	legalNameComplete?: boolean
}

/**
 * Builds the 4-link trust map with focus on the first incomplete eslabón.
 */
export function buildProviderTrustMap(input: BuildProviderTrustMapInput = {}): ProviderTrustLink[] {
	const account = labelAccountVerificationStatus(input.accountStatus ?? "pending")
	const legalNameComplete = input.legalNameComplete !== false
	const identityUi: TrustLinkUiState = !legalNameComplete ? "action_needed" : account.uiState
	const identityHref = !legalNameComplete
		? PROFILE_LEGAL_NAME_HREF
		: `${routes.providerSettingsVerification()}#verification-status-panel`
	const businessUi = resolveBusinessUiState({
		documentsComplete: Boolean(input.documentsComplete),
		hasRejectedDocs: Boolean(input.hasRejectedDocs),
		hasSubmittedDocs: Boolean(input.hasSubmittedDocs),
		hasMissingDocs: Boolean(input.hasMissingDocs ?? !input.documentsComplete),
	})
	const fiscalUi = resolveFiscalUiState(input.fiscalStatus)
	const paymentsUi = resolvePaymentsUiState({
		verifiedPaymentAccounts: Number(input.verifiedPaymentAccounts ?? 0),
		pendingPaymentAccounts: Number(input.pendingPaymentAccounts ?? 0),
	})

	const links: Array<Omit<ProviderTrustLink, "isFocus">> = [
		{
			id: "identity",
			label: TRUST_GLOSSARY.links.identity.label,
			description: TRUST_GLOSSARY.links.identity.description,
			href: identityHref,
			uiState: identityUi,
			stateLabel: trustLinkStateLabel(identityUi),
			tone: trustLinkTone(identityUi),
		},
		{
			id: "business",
			label: TRUST_GLOSSARY.links.business.label,
			description: TRUST_GLOSSARY.links.business.description,
			href: `${routes.providerSettingsVerification()}#kyc-slots`,
			uiState: businessUi,
			stateLabel: trustLinkStateLabel(businessUi),
			tone: trustLinkTone(businessUi),
		},
		{
			id: "fiscal",
			label: TRUST_GLOSSARY.links.fiscal.label,
			description: TRUST_GLOSSARY.links.fiscal.description,
			href: routes.providerSettingsVerificationFiscal(),
			uiState: fiscalUi,
			stateLabel: trustLinkStateLabel(fiscalUi),
			tone: trustLinkTone(fiscalUi),
		},
		{
			id: "payments",
			label: TRUST_GLOSSARY.links.payments.label,
			description: TRUST_GLOSSARY.links.payments.description,
			href: routes.providerSettingsVerificationPayments(),
			uiState: paymentsUi,
			stateLabel: trustLinkStateLabel(paymentsUi),
			tone: trustLinkTone(paymentsUi),
		},
	]

	// V4: account rejected → prioritize Corregir documentos (Negocio) over cuenta matrix.
	const accountRejected =
		String(input.accountStatus ?? "")
			.trim()
			.toLowerCase() === "rejected"
	const preferBusinessOnReject =
		accountRejected && legalNameComplete && businessUi === "action_needed"

	const focusId = preferBusinessOnReject
		? "business"
		: links.every((link) => link.uiState === "ready")
			? null
			: (links.find((link) => link.uiState === "action_needed" || link.uiState === "not_started")
					?.id ??
				links.find((link) => link.uiState === "in_review")?.id ??
				links[0]?.id ??
				null)

	return links.map((link) => ({
		...link,
		isFocus: focusId != null && link.id === focusId,
	}))
}

/** True when Identidad → Negocio → Fiscal → Pagos are all ready (V2 Lista). */
export function isProviderTrustMapComplete(links: ProviderTrustLink[]): boolean {
	return links.length >= 4 && links.every((link) => link.uiState === "ready")
}

/**
 * Lista end-to-end: map complete and Perfil legal name present.
 * Prefer feeding `legalNameComplete` into `buildProviderTrustMap` so the rail matches.
 */
export function isVerificationListaReady(params: {
	trustLinks: ProviderTrustLink[]
	legalNameComplete?: boolean
}): boolean {
	if (params.legalNameComplete === false) return false
	return isProviderTrustMapComplete(params.trustLinks)
}

/** Guards against regressing to the banned «Pendiente» host label. */
export function assertNoLegacyPendingLabel(label: string): boolean {
	return (
		String(label ?? "")
			.trim()
			.toLowerCase() !== "pendiente"
	)
}

export type VerificationNextStep = {
	linkId: TrustLinkId
	title: string
	body: string
	ctaLabel: string
	ctaHref: string
	consequenceLine: string | null
	/** When the next step is an on-page KYC upload */
	anchorsKyc: boolean
	/** V2 Lista success surface */
	tone?: "default" | "success"
	eyebrow?: string
	secondaryCtaLabel?: string | null
	secondaryCtaHref?: string | null
	/**
	 * Hero CTA intent aligned to permission / surface.
	 * upload → form exists · access → team gate · status/navigate → no upload claim
	 */
	ctaKind?: "upload" | "access" | "status" | "navigate"
	/** V1 hero: «N/3 listos» for required KYC slots */
	progressLabel?: string | null
	/** V4: host-facing reject category when account/doc needs changes */
	rejectCategoryLabel?: string | null
}

/** Canonical publish entry used by Lista CTAs. */
export const VERIFICATION_PUBLISH_HREF = routes.productCreate()

/**
 * Access screen when session role cannot upload documents.
 * Human role label only — never «administrador» as the ambiguous ask-target.
 */
export function buildDocumentsAccessDeniedNextStep(params: {
	roleLabel: string
}): VerificationNextStep {
	const roleLabel = String(params.roleLabel ?? "").trim() || "Operaciones"
	return {
		linkId: "business",
		title: "No puedes enviar documentos con tu rol",
		body: `Tu acceso es «${roleLabel}». Solo Propietario o Administrador pueden subir o reenviar documentos de verificación.`,
		ctaLabel: "Ver equipo y roles",
		ctaHref: routes.providerSettingsTeam(),
		consequenceLine:
			"Pide a quien gestione el proveedor que suba los documentos o te asigne un rol con permiso de Documentos.",
		anchorsKyc: false,
		eyebrow: "Acceso",
		ctaKind: "access",
	}
}

/**
 * Hero CTA for a KYC upload slot when the session can manage documents.
 * Verb matches the form submit («Enviar a revisión») — never a dead «Ver documento».
 */
export function buildDocumentsUploadNextStep(params: {
	slot: {
		type: string
		label: string
		state: DocumentKycUiState
	}
	optionalConstancia?: boolean
	progressLabel?: string | null
	rejectCategoryLabel?: string | null
	/** When account verification is rejected, elevate «Corregir documentos» */
	accountRejected?: boolean
}): VerificationNextStep {
	const needsResubmit = params.slot.state === "rejected"
	const optionalConstancia = Boolean(params.optionalConstancia)
	const accountRejected = Boolean(params.accountRejected)
	const rejectCategoryLabel = String(params.rejectCategoryLabel ?? "").trim() || null
	return {
		linkId: "business",
		title: optionalConstancia
			? "Adjunta constancia solo si te la pedimos"
			: accountRejected || needsResubmit
				? `Corrige y reenvía: ${params.slot.label}`
				: `Sube tu ${params.slot.label.toLowerCase()}`,
		body: optionalConstancia
			? "El NIT ya está en Fiscalidad. Usa el envío opcional debajo solo si el equipo o el bureau lo requieren."
			: needsResubmit || accountRejected
				? rejectCategoryLabel
					? `${rejectCategoryLabel}. Completa el envío en foco y pulsa Enviar a revisión.`
					: "Este documento requiere cambios. Completa el envío en foco y pulsa Enviar a revisión."
				: "Un documento a la vez. Completa el envío en foco y pulsa Enviar a revisión.",
		ctaLabel: optionalConstancia
			? "Enviar constancia"
			: accountRejected || needsResubmit
				? "Corregir documentos"
				: "Enviar a revisión",
		ctaHref: `#kyc-slot-${params.slot.type}`,
		consequenceLine:
			"Sin los documentos mínimos verificados no puedes liquidar cobros ni publicar con confianza.",
		anchorsKyc: true,
		ctaKind: "upload",
		eyebrow: accountRejected || needsResubmit ? TRUST_GLOSSARY.account.needsChanges : undefined,
		progressLabel: params.progressLabel ?? null,
		rejectCategoryLabel,
	}
}

/**
 * Hero copy for V1 fold: one next action derived from trust focus + KYC slot.
 * Profile (legal name) gates identity/docs — CTA out to Perfil when missing.
 * tax_document bridge → Fiscalidad (no blind upload).
 * V2 Lista: all trust links ready → publish/payments, no yellow consequence.
 * P0: Hero CTA verb matches permission — upload vs access screen (never dead «Ver documento»).
 */
export function resolveVerificationNextStep(params: {
	trustLinks: ProviderTrustLink[]
	focusSlot?: {
		type: string
		label: string
		state: DocumentKycUiState
		fiscalBridge?: {
			mode: string
			fiscalHref: string
			title: string
			body: string
			ctaLabel: string
			suppressBlindUpload: boolean
		} | null
		rejectCategoryLabel?: string | null
	} | null
	canManageDocuments?: boolean
	legalNameComplete?: boolean
	/** Human role label (Propietario / Administrador / Operaciones) for deny UX */
	roleLabel?: string
	/** Required KYC progress for hero «N/3 listos» */
	kycProgress?: { ready: number; total: number } | null
	accountStatus?: AccountVerificationStatus | null
	accountRejectCategoryLabel?: string | null
}): VerificationNextStep {
	const progressLabel =
		params.kycProgress && params.kycProgress.total > 0
			? `${params.kycProgress.ready}/${params.kycProgress.total} listos`
			: null
	const accountRejected =
		String(params.accountStatus ?? "")
			.trim()
			.toLowerCase() === "rejected"
	const accountRejectCategoryLabel = String(params.accountRejectCategoryLabel ?? "").trim() || null

	if (params.legalNameComplete === false) {
		return {
			linkId: "identity",
			title: "Completa la razón social en Perfil",
			body: "Verificación lee el nombre legal; no lo pide de nuevo. Guarda razón social y vuelve a Verificación.",
			ctaLabel: "Completar perfil",
			ctaHref: PROFILE_LEGAL_NAME_HREF,
			consequenceLine:
				"Sin razón social no podemos contrastar identidad, fiscalidad ni liquidaciones.",
			anchorsKyc: false,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	if (isProviderTrustMapComplete(params.trustLinks)) {
		return {
			linkId: "payments",
			title: TRUST_GLOSSARY.page.readyTitle,
			body: TRUST_GLOSSARY.page.readyBody,
			ctaLabel: TRUST_GLOSSARY.page.readyPrimaryCta,
			ctaHref: VERIFICATION_PUBLISH_HREF,
			secondaryCtaLabel: TRUST_GLOSSARY.page.readySecondaryCta,
			secondaryCtaHref: routes.providerSettingsVerificationPayments(),
			consequenceLine: null,
			anchorsKyc: false,
			tone: "success",
			eyebrow: TRUST_GLOSSARY.page.readyEyebrow,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	const focusLink = params.trustLinks.find((link) => link.isFocus) ?? params.trustLinks[0] ?? null
	const linkId = focusLink?.id ?? "business"
	const slot = params.focusSlot ?? null
	const canUpload = Boolean(params.canManageDocuments)
	const taxBridge = slot?.type === "tax_document" ? slot.fiscalBridge : null
	const roleLabel = String(params.roleLabel ?? "").trim() || "Operaciones"
	const slotRejectLabel = String(slot?.rejectCategoryLabel ?? "").trim() || null

	if (taxBridge?.suppressBlindUpload) {
		return {
			linkId: taxBridge.mode === "enter_nit" ? "business" : "fiscal",
			title: taxBridge.title,
			body: taxBridge.body,
			ctaLabel: taxBridge.ctaLabel,
			ctaHref: taxBridge.fiscalHref,
			consequenceLine: "Sin NIT/TIN verificado en Fiscalidad las liquidaciones pueden retenerse.",
			anchorsKyc: false,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	if (linkId === "business" && slot && (slot.state === "missing" || slot.state === "rejected")) {
		if (!canUpload) {
			return {
				...buildDocumentsAccessDeniedNextStep({ roleLabel }),
				progressLabel,
			}
		}
		return buildDocumentsUploadNextStep({
			slot: { type: slot.type, label: slot.label, state: slot.state },
			optionalConstancia: Boolean(taxBridge && !taxBridge.suppressBlindUpload),
			progressLabel,
			rejectCategoryLabel: slotRejectLabel || accountRejectCategoryLabel,
			accountRejected,
		})
	}

	if (accountRejected && linkId === "identity") {
		const correctHref = slot ? `#kyc-slot-${slot.type}` : "#kyc-slots"
		return {
			linkId: "identity",
			title: "La cuenta requiere cambios",
			body: accountRejectCategoryLabel
				? `${accountRejectCategoryLabel}. Revisa el motivo y corrige los documentos mínimos.`
				: "Revisa el motivo de revisión y corrige los documentos mínimos indicados.",
			ctaLabel: "Corregir documentos",
			ctaHref: correctHref,
			consequenceLine: "Sin la cuenta lista no puedes publicar ni aceptar reservas con confianza.",
			anchorsKyc: Boolean(slot),
			eyebrow: TRUST_GLOSSARY.account.needsChanges,
			ctaKind: slot ? "upload" : "status",
			progressLabel,
			rejectCategoryLabel: accountRejectCategoryLabel,
		}
	}

	if (linkId === "business" && slot?.state === "pending") {
		if (!canUpload) {
			return {
				linkId: "business",
				title: `${slot.label}: enviado`,
				body: "Fastt está revisando este documento. Tu rol no puede reenviar; el estado queda abajo en solo lectura.",
				ctaLabel: "Ver estado",
				ctaHref: "#documents-access-status",
				consequenceLine: null,
				anchorsKyc: false,
				ctaKind: "status",
				progressLabel,
			}
		}
		return {
			linkId: "business",
			title: `${slot.label}: enviado`,
			body: "Fastt está revisando este documento. Mientras tanto puedes seguir el mapa o completar Fiscal cuando toque.",
			ctaLabel: "Ver estado del documento",
			ctaHref: `#kyc-slot-${slot.type}`,
			consequenceLine: null,
			anchorsKyc: true,
			ctaKind: "status",
			progressLabel,
		}
	}

	if (linkId === "business") {
		return {
			linkId: "business",
			title: "Documentos mínimos listos",
			body: "El eslabón Negocio está completo. Continúa con Fiscal o Pagos según el mapa.",
			ctaLabel: "Ir a fiscalidad",
			ctaHref: routes.providerSettingsVerificationFiscal(),
			consequenceLine: null,
			anchorsKyc: false,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	if (linkId === "identity") {
		const waiting = focusLink?.uiState === "in_review"
		return {
			linkId: "identity",
			title: waiting ? "Cuenta en revisión" : "Identidad de la cuenta",
			body: waiting
				? canUpload
					? "La revisión de cuenta sigue en curso. No sustituye los documentos: si falta alguno, envíalo abajo."
					: "La revisión de cuenta sigue en curso. Si faltan documentos, quien tenga permiso de Documentos debe enviarlos."
				: "Revisa el estado de la cuenta o continúa con el siguiente eslabón del mapa.",
			ctaLabel: waiting ? "Ver estado de cuenta" : "Ver identidad",
			ctaHref: "#verification-status-panel",
			consequenceLine: waiting
				? "Sin la cuenta lista no puedes publicar ni aceptar reservas con confianza."
				: null,
			anchorsKyc: false,
			ctaKind: "status",
			progressLabel,
		}
	}

	if (linkId === "fiscal") {
		return {
			linkId: "fiscal",
			title: "Completa tu registro fiscal",
			body: "Registra NIT/TIN, residencia fiscal y modo de facturación para que podamos revisar tu identidad tributaria.",
			ctaLabel: "Ir a registro fiscal",
			ctaHref: routes.providerSettingsVerificationFiscal(),
			consequenceLine: "Sin registro fiscal verificado las liquidaciones pueden retenerse.",
			anchorsKyc: false,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	if (linkId === "payments") {
		return {
			linkId: "payments",
			title: "Verifica tu cuenta de cobro",
			body: "Añade o confirma la cuenta bancaria para recibir liquidaciones.",
			ctaLabel: "Ir a pagos",
			ctaHref: routes.providerSettingsVerificationPayments(),
			consequenceLine: "Sin cuenta de cobro verificada no puedes liquidar.",
			anchorsKyc: false,
			ctaKind: "navigate",
			progressLabel,
		}
	}

	return {
		linkId: "identity",
		title: "Confianza del proveedor",
		body: TRUST_GLOSSARY.page.description,
		ctaLabel: "Ver mapa",
		ctaHref: "#trust-map-rail",
		consequenceLine: null,
		anchorsKyc: false,
		ctaKind: "navigate",
		progressLabel,
	}
}
