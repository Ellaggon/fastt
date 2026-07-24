import { createHmac, randomInt } from "node:crypto"
import {
	first,
	and,
	db,
	desc,
	eq,
	ProviderFinancialProfile,
	ProviderPaymentAccount,
	ProviderTaxConfiguration,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"

import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { completeComplianceAssignment } from "@/lib/provider-compliance-ops"
import {
	buildPaymentAccountMetadata,
	readAccountIdentifierFromMetadata,
} from "@/lib/provider-payment-secrets"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

/**
 * Provider payout methods (bank accounts).
 *
 * Airbnb: Account > Payments > Payouts — host adds bank details (holder, country,
 * routing/IBAN, account number); platform verifies (often micro-deposit); host
 * cannot self-mark verified.
 * Expedia: Financials > Bank Details — bank name, IBAN, SWIFT/BIC; ownership
 * may require docs; holds if incomplete.
 *
 * Source of truth: ProviderPaymentAccount
 * Derived rollup: ProviderFinancialProfile (updated on admin verify)
 *
 * Status ownership:
 * - Provider submit → always pending
 * - verified | requires_attention → internal admin only
 */

export type ProviderPaymentAccountStatus =
	| "not_configured"
	| "pending"
	| "verified"
	| "requires_attention"
	| "superseded"

export type ProviderPayoutMethod = "bank_transfer" | "international_wire" | "other"

export type ProviderPayoutSchedule = "manual" | "weekly" | "biweekly" | "monthly"

export type ProviderMicroDepositChallenge = {
	status: "none" | "initiated" | "confirmed" | "failed"
	initiatedAt: string | null
	expiresAt: string | null
	attempts: number
	/** Present only immediately after admin initiate (ops logging / test harness). */
	amountsCents?: [number, number]
}

export const PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS = 3

export type PayoutTimelineStepId = "submitted" | "awaiting_deposits" | "confirm" | "ready"

export type PayoutTimelineStepState = "complete" | "current" | "upcoming" | "blocked"

export type PayoutTimelineStep = {
	id: PayoutTimelineStepId
	label: string
	description: string
	state: PayoutTimelineStepState
}

export type PayoutVerificationTimeline = {
	steps: PayoutTimelineStep[]
	currentStepId: PayoutTimelineStepId | null
	phaseLabel: string
	helperText: string | null
	showConfirmForm: boolean
	attemptsUsed: number
	attemptsRemaining: number | null
	expiresAt: string | null
}

export type ProviderPaymentAccountRecord = {
	id: string
	providerId: string
	status: ProviderPaymentAccountStatus
	statusLabel: string
	method: ProviderPayoutMethod
	methodLabel: string
	currency: string
	accountHolderName: string | null
	bankName: string | null
	country: string | null
	routingOrSwift: string | null
	accountNumberLast4: string | null
	accountReference: string | null
	/** Full account/IBAN — only populated for admin review payloads. */
	accountIdentifier: string | null
	payoutSchedule: ProviderPayoutSchedule
	payoutScheduleLabel: string
	microDeposit: ProviderMicroDepositChallenge
	verifiedAt: Date | null
	createdAt: Date | null
	updatedAt: Date | null
}

export const providerPaymentAccountStatuses: Array<{
	value: ProviderPaymentAccountStatus
	label: string
}> = [
	{ value: "not_configured", label: "No configurado" },
	{ value: "pending", label: "Pendiente de validación" },
	{ value: "verified", label: "Verificado" },
	{ value: "requires_attention", label: "Requiere atención" },
	{ value: "superseded", label: "Reemplazado" },
]

export const providerPayoutMethods: Array<{
	value: ProviderPayoutMethod
	label: string
	description: string
}> = [
	{
		value: "bank_transfer",
		label: "Transferencia bancaria local",
		description: "Cuenta en el mismo país (ACH / transferencia local).",
	},
	{
		value: "international_wire",
		label: "Transferencia internacional",
		description: "IBAN + SWIFT/BIC para liquidaciones cross-border.",
	},
	{
		value: "other",
		label: "Otro",
		description: "Método manual u otro canal de liquidación.",
	},
]

export const providerPayoutSchedules: Array<{
	value: ProviderPayoutSchedule
	label: string
}> = [
	{ value: "manual", label: "Manual / bajo demanda" },
	{ value: "weekly", label: "Semanal" },
	{ value: "biweekly", label: "Quincenal" },
	{ value: "monthly", label: "Mensual" },
]

const statusLabels = Object.fromEntries(
	providerPaymentAccountStatuses.map((item) => [item.value, item.label])
) as Record<ProviderPaymentAccountStatus, string>

const methodLabels = Object.fromEntries(
	providerPayoutMethods.map((item) => [item.value, item.label])
) as Record<ProviderPayoutMethod, string>

const scheduleLabels = Object.fromEntries(
	providerPayoutSchedules.map((item) => [item.value, item.label])
) as Record<ProviderPayoutSchedule, string>

function asStatus(value: unknown): ProviderPaymentAccountStatus {
	const raw = String(value ?? "not_configured").trim()
	if (
		raw === "pending" ||
		raw === "verified" ||
		raw === "requires_attention" ||
		raw === "superseded" ||
		raw === "not_configured"
	) {
		return raw
	}
	return "not_configured"
}

function asMethod(value: unknown): ProviderPayoutMethod {
	const raw = String(value ?? "bank_transfer").trim()
	if (raw === "international_wire" || raw === "other" || raw === "bank_transfer") return raw
	if (raw === "manual_bank" || raw === "manual_profile") return "bank_transfer"
	return "bank_transfer"
}

function asSchedule(value: unknown): ProviderPayoutSchedule {
	const raw = String(value ?? "manual").trim()
	if (raw === "weekly" || raw === "biweekly" || raw === "monthly" || raw === "manual") return raw
	return "manual"
}

function readMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function maskAccountIdentifier(raw: string): { last4: string; reference: string } {
	const cleaned = raw.replace(/\s+/g, "").toUpperCase()
	const last4 = cleaned.slice(-4) || "????"
	return { last4, reference: `••••${last4}` }
}

function microDepositPepper(): string {
	return String(process.env.PROVIDER_PAYOUT_SECRETS_KEY ?? "fastt-dev-payout-secrets-v1")
}

function hashMicroDepositAmount(accountId: string, cents: number): string {
	return createHmac("sha256", microDepositPepper()).update(`${accountId}:${cents}`).digest("hex")
}

function readMicroDepositChallenge(
	metadata: Record<string, unknown>
): ProviderMicroDepositChallenge {
	const raw = metadata.microDeposit
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return {
			status: "none",
			initiatedAt: null,
			expiresAt: null,
			attempts: 0,
		}
	}
	const challenge = raw as Record<string, unknown>
	const statusRaw = String(challenge.status ?? "none")
	const status =
		statusRaw === "initiated" ||
		statusRaw === "confirmed" ||
		statusRaw === "failed" ||
		statusRaw === "none"
			? statusRaw
			: "none"
	return {
		status,
		initiatedAt: typeof challenge.initiatedAt === "string" ? challenge.initiatedAt : null,
		expiresAt: typeof challenge.expiresAt === "string" ? challenge.expiresAt : null,
		attempts: Number(challenge.attempts) || 0,
	}
}

/**
 * Host-facing payout verification machine:
 * Enviada → Esperando depósitos → Confirmar montos → Lista
 */
export function buildPayoutVerificationTimeline(
	account: Pick<ProviderPaymentAccountRecord, "status" | "microDeposit" | "verifiedAt">
): PayoutVerificationTimeline {
	const challenge = account.microDeposit
	const attemptsUsed = Math.max(0, Number(challenge.attempts) || 0)
	const isReady =
		account.status === "verified" || challenge.status === "confirmed" || Boolean(account.verifiedAt)
	const isBlocked = account.status === "requires_attention" || challenge.status === "failed"
	const depositsStarted =
		challenge.status === "initiated" ||
		challenge.status === "confirmed" ||
		challenge.status === "failed" ||
		isReady
	const canConfirm = account.status === "pending" && challenge.status === "initiated"

	let currentStepId: PayoutTimelineStepId | null = null
	if (isReady) {
		currentStepId = null
	} else if (isBlocked) {
		currentStepId = depositsStarted && challenge.status !== "none" ? "confirm" : "awaiting_deposits"
	} else if (canConfirm) {
		currentStepId = "confirm"
	} else if (account.status === "pending" || account.status === "not_configured") {
		currentStepId = depositsStarted ? "confirm" : "awaiting_deposits"
	}

	const stepState = (id: PayoutTimelineStepId): PayoutTimelineStepState => {
		if (isReady) return "complete"
		if (id === "submitted") return "complete"
		if (id === "awaiting_deposits") {
			if (depositsStarted || canConfirm) return "complete"
			if (isBlocked) return "blocked"
			return currentStepId === "awaiting_deposits" ? "current" : "upcoming"
		}
		if (id === "confirm") {
			if (isReady) return "complete"
			if (isBlocked && depositsStarted) return "blocked"
			if (canConfirm || currentStepId === "confirm") return isBlocked ? "blocked" : "current"
			return "upcoming"
		}
		// ready
		if (isReady) return "complete"
		if (isBlocked) return "blocked"
		return "upcoming"
	}

	const attemptsRemaining = canConfirm
		? Math.max(0, PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS - attemptsUsed)
		: null

	const steps: PayoutTimelineStep[] = [
		{
			id: "submitted",
			label: "Enviada",
			description: "Datos de la cuenta recibidos.",
			state: stepState("submitted"),
		},
		{
			id: "awaiting_deposits",
			label: "Esperando depósitos",
			description: "Fastt envía dos montos pequeños de prueba a tu banco.",
			state: stepState("awaiting_deposits"),
		},
		{
			id: "confirm",
			label: "Confirmar montos",
			description: "Ingresas los dos montos en centavos para probar titularidad.",
			state: stepState("confirm"),
		},
		{
			id: "ready",
			label: "Lista",
			description: "Cuenta lista para liquidaciones.",
			state: stepState("ready"),
		},
	]

	let phaseLabel = "Enviada"
	let helperText: string | null = null

	if (isReady) {
		phaseLabel = "Lista"
		helperText = "Esta cuenta ya está verificada para recibir liquidaciones."
	} else if (isBlocked) {
		phaseLabel = "Requiere atención"
		helperText =
			attemptsUsed >= PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS
				? "Se agotaron los intentos de confirmación. Envía una cuenta nueva o contacta a soporte Fastt."
				: "Esta cuenta necesita corrección. Envía una nueva con datos actualizados."
	} else if (canConfirm) {
		phaseLabel = "Confirmar montos"
		helperText =
			attemptsUsed > 0
				? `Los montos no coincidieron. Te quedan ${attemptsRemaining} intento${attemptsRemaining === 1 ? "" : "s"}.`
				: "Revisa tu extracto bancario e ingresa los dos montos en centavos (entre 1 y 99)."
	} else if (account.status === "pending") {
		phaseLabel = "Esperando depósitos"
		helperText =
			"Cuenta enviada. Cuando Fastt inicie la verificación, verás aquí el paso para confirmar los montos."
	} else if (account.status === "superseded") {
		phaseLabel = "Reemplazada"
		helperText = "Esta cuenta fue reemplazada por un envío más reciente."
	} else {
		phaseLabel = "Sin configurar"
		helperText = "Agrega una cuenta bancaria para empezar."
	}

	return {
		steps,
		currentStepId,
		phaseLabel,
		helperText,
		showConfirmForm: canConfirm,
		attemptsUsed,
		attemptsRemaining,
		expiresAt: challenge.expiresAt,
	}
}

function mapRow(
	row: {
		id: string
		providerId: string
		status: string
		provider: string
		currency: string
		accountHolderName: string | null
		bankName: string | null
		country: string | null
		routingOrSwift: string | null
		accountNumberLast4: string | null
		accountReference: string | null
		payoutSchedule: string
		metadataJson: unknown
		verifiedAt: Date | null
		createdAt: Date | null
		updatedAt: Date | null
	},
	opts?: { includeSecret?: boolean }
): ProviderPaymentAccountRecord {
	const status = asStatus(row.status)
	const method = asMethod(row.provider)
	const payoutSchedule = asSchedule(row.payoutSchedule)
	const meta = readMetadata(row.metadataJson)
	const accountIdentifier = opts?.includeSecret
		? readAccountIdentifierFromMetadata(row.metadataJson)
		: null

	return {
		id: row.id,
		providerId: row.providerId,
		status,
		statusLabel: statusLabels[status],
		method,
		methodLabel: methodLabels[method],
		currency: row.currency || "USD",
		accountHolderName: row.accountHolderName ?? null,
		bankName: row.bankName ?? null,
		country: row.country ?? null,
		routingOrSwift: row.routingOrSwift ?? null,
		accountNumberLast4: row.accountNumberLast4 ?? null,
		accountReference: row.accountReference ?? null,
		accountIdentifier,
		payoutSchedule,
		payoutScheduleLabel: scheduleLabels[payoutSchedule],
		microDeposit: readMicroDepositChallenge(meta),
		verifiedAt: row.verifiedAt ?? null,
		createdAt: row.createdAt ?? null,
		updatedAt: row.updatedAt ?? null,
	}
}

const selectColumns = {
	id: ProviderPaymentAccount.id,
	providerId: ProviderPaymentAccount.providerId,
	status: ProviderPaymentAccount.status,
	provider: ProviderPaymentAccount.provider,
	currency: ProviderPaymentAccount.currency,
	accountHolderName: ProviderPaymentAccount.accountHolderName,
	bankName: ProviderPaymentAccount.bankName,
	country: ProviderPaymentAccount.country,
	routingOrSwift: ProviderPaymentAccount.routingOrSwift,
	accountNumberLast4: ProviderPaymentAccount.accountNumberLast4,
	accountReference: ProviderPaymentAccount.accountReference,
	payoutSchedule: ProviderPaymentAccount.payoutSchedule,
	metadataJson: ProviderPaymentAccount.metadataJson,
	verifiedAt: ProviderPaymentAccount.verifiedAt,
	createdAt: ProviderPaymentAccount.createdAt,
	updatedAt: ProviderPaymentAccount.updatedAt,
}

async function getProviderRole(providerId: string, userId: string) {
	return (
		(await db
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
			.then(first)) ?? null
	)
}

export async function assertCanManagePayments(providerId: string, userId: string) {
	const link = await getProviderRole(providerId, userId)
	const permissions = resolveProviderPermissions({
		role: link?.role,
		permissionsJson: link?.permissionsJson,
	})
	if (!permissions.canManagePayments) {
		const error = new Error("forbidden")
		;(error as Error & { status?: number }).status = 403
		throw error
	}
	return { link, permissions }
}

export async function listProviderPaymentAccounts(
	providerId: string
): Promise<ProviderPaymentAccountRecord[]> {
	const rows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.providerId, providerId))
		.orderBy(desc(ProviderPaymentAccount.createdAt), desc(ProviderPaymentAccount.id))

		.catch(() => [])

	return rows.map((row) => mapRow(row, { includeSecret: false }))
}

export async function listPendingProviderPaymentAccountsForAdmin(): Promise<
	ProviderPaymentAccountRecord[]
> {
	const rows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.status, "pending"))
		.orderBy(desc(ProviderPaymentAccount.createdAt), desc(ProviderPaymentAccount.id))

		.catch(() => [])

	return rows.map((row) => mapRow(row, { includeSecret: true }))
}

/**
 * Provider-facing create. Always pending — never self-verifies (Airbnb/Expedia pattern).
 */
export async function createProviderPaymentAccount(params: {
	providerId: string
	actorUserId: string
	method?: unknown
	currency?: unknown
	accountHolderName?: unknown
	bankName?: unknown
	country?: unknown
	routingOrSwift?: unknown
	accountIdentifier?: unknown
	payoutSchedule?: unknown
	submissionNotes?: unknown
}) {
	await assertCanManagePayments(params.providerId, params.actorUserId)

	const method = asMethod(params.method)
	const currency =
		String(params.currency ?? "USD")
			.trim()
			.toUpperCase() || "USD"
	const accountHolderName = String(params.accountHolderName ?? "").trim()
	const bankName = String(params.bankName ?? "").trim()
	const country =
		String(params.country ?? "")
			.trim()
			.toUpperCase() || null
	const routingOrSwift = String(params.routingOrSwift ?? "").trim() || null
	const accountIdentifier = String(params.accountIdentifier ?? "")
		.replace(/\s+/g, "")
		.toUpperCase()
	const payoutSchedule = asSchedule(params.payoutSchedule)
	const submissionNotes = String(params.submissionNotes ?? "").trim() || null

	if (!accountHolderName) {
		const error = new Error("account_holder_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (!bankName) {
		const error = new Error("bank_name_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (!country || !/^[A-Z]{2}$/.test(country)) {
		const error = new Error("invalid_country")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (!/^[A-Z]{3}$/.test(currency)) {
		const error = new Error("invalid_currency")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (accountIdentifier.length < 4) {
		const error = new Error("account_identifier_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (method === "international_wire" && !routingOrSwift) {
		const error = new Error("swift_required_for_international_wire")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const { last4, reference } = maskAccountIdentifier(accountIdentifier)
	const now = new Date()
	const id = crypto.randomUUID()

	const pendingSameProvider = await db
		.select({ id: ProviderPaymentAccount.id })
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.providerId, params.providerId),
				eq(ProviderPaymentAccount.status, "pending")
			)
		)

		.catch(() => [])

	for (const row of pendingSameProvider) {
		await db
			.update(ProviderPaymentAccount)
			.set({ status: "superseded", updatedAt: now })
			.where(eq(ProviderPaymentAccount.id, row.id))
	}

	const metadataJson = buildPaymentAccountMetadata({
		accountIdentifier,
		submissionNotes,
	})

	await db.insert(ProviderPaymentAccount).values({
		id,
		providerId: params.providerId,
		status: "pending",
		provider: method,
		currency,
		accountHolderName,
		bankName,
		country,
		routingOrSwift: routingOrSwift ?? undefined,
		accountNumberLast4: last4,
		accountReference: reference,
		payoutSchedule,
		metadataJson,
		verifiedAt: undefined,
		createdAt: now,
		updatedAt: now,
	})

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.payment_account.create",
		entityType: "ProviderPaymentAccount",
		entityId: id,
		beforeJson: pendingSameProvider.length
			? { supersededIds: pendingSameProvider.map((row) => row.id) }
			: null,
		afterJson: {
			id,
			status: "pending",
			method,
			currency,
			country,
			accountReference: reference,
			bankName,
			accountHolderName,
		},
		riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
	})

	const created = await listProviderPaymentAccounts(params.providerId)
	return created.find((row) => row.id === id)!
}

export async function assertHasVerifiedPaymentAccount(providerId: string): Promise<void> {
	const row = await db
		.select({ id: ProviderPaymentAccount.id })
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.providerId, providerId),
				eq(ProviderPaymentAccount.status, "verified")
			)
		)
		.then(first)
		.catch(() => null)

	if (!row?.id) {
		const error = new Error("verified_payment_account_required")
		;(error as Error & { status?: number }).status = 409
		throw error
	}
}

async function syncProviderFinancialProfile(params: {
	providerId: string
	account: ProviderPaymentAccountRecord
}) {
	await assertHasVerifiedPaymentAccount(params.providerId)

	const tax = await db
		.select({ status: ProviderTaxConfiguration.status })
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, params.providerId))
		.then(first)
		.catch(() => null)

	const now = new Date()
	const taxStatus = String(tax?.status ?? "missing")
	const taxProfileStatus =
		taxStatus === "verified"
			? "verified"
			: taxStatus === "pending" || taxStatus === "requires_attention"
				? "pending_review"
				: "missing"

	const values = {
		providerId: params.providerId,
		payoutMethodReference: params.account.accountReference || params.account.id,
		payoutSchedule: params.account.payoutSchedule,
		currency: params.account.currency,
		taxProfileStatus,
		status: "ready" as const,
		updatedAt: now,
		createdAt: now,
	}

	await db
		.insert(ProviderFinancialProfile)
		.values(values)
		.onConflictDoUpdate({
			target: [ProviderFinancialProfile.providerId],
			set: {
				payoutMethodReference: values.payoutMethodReference,
				payoutSchedule: values.payoutSchedule,
				currency: values.currency,
				taxProfileStatus: values.taxProfileStatus,
				status: values.status,
				updatedAt: values.updatedAt,
			},
		})
}

/**
 * Internal-admin review. Caller must already have passed requireInternalAdmin.
 * On verified: rolls up ProviderFinancialProfile readiness.
 * Admin override remains available alongside the micro-deposit ownership path.
 */
export async function reviewProviderPaymentAccount(params: {
	providerId: string
	actorUserId: string
	accountId: string
	status: unknown
	reason?: unknown
}) {
	const nextStatus = asStatus(params.status)
	if (nextStatus !== "verified" && nextStatus !== "requires_attention") {
		const error = new Error("invalid_review_status")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const reason = String(params.reason ?? "").trim()
	if (nextStatus === "requires_attention" && reason.length < 2) {
		const error = new Error("reason_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const existing = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.id, params.accountId),
				eq(ProviderPaymentAccount.providerId, params.providerId)
			)
		)
		.then(first)

	if (!existing?.id) {
		const error = new Error("not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}
	if (existing.status !== "pending") {
		const error = new Error("not_pending")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const now = new Date()
	const before = mapRow(existing, { includeSecret: false })
	const meta = readMetadata(existing.metadataJson)

	await db
		.update(ProviderPaymentAccount)
		.set({
			status: nextStatus,
			verifiedAt: nextStatus === "verified" ? now : null,
			metadataJson: {
				...meta,
				lastReview: {
					status: nextStatus,
					reason: reason || null,
					reviewedAt: now.toISOString(),
					reviewedBy: params.actorUserId,
					path: "admin_override",
				},
			},
			updatedAt: now,
		})
		.where(eq(ProviderPaymentAccount.id, existing.id))

	const afterRows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.id, existing.id))
		.then(first)
	const after = afterRows ? mapRow(afterRows, { includeSecret: true }) : before

	if (nextStatus === "verified") {
		await syncProviderFinancialProfile({
			providerId: params.providerId,
			account: after,
		})
	}

	await completeComplianceAssignment({
		providerId: params.providerId,
		domain: "payments",
		entityId: existing.id,
	})

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.payment_account.review",
		entityType: "ProviderPaymentAccount",
		entityId: existing.id,
		beforeJson: { status: before.status },
		afterJson: { status: nextStatus, reason: reason || null, path: "admin_override" },
		riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
	})

	return after
}

/**
 * Start micro-deposit ownership challenge (Airbnb-style). Amounts are hashed in
 * metadata; plaintext pair is returned only to the initiating admin (ops / harness).
 */
export async function initiatePaymentAccountMicroDeposit(params: {
	providerId: string
	actorUserId: string
	accountId: string
}) {
	const existing = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.id, params.accountId),
				eq(ProviderPaymentAccount.providerId, params.providerId)
			)
		)
		.then(first)

	if (!existing?.id) {
		const error = new Error("not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}
	if (existing.status !== "pending") {
		const error = new Error("not_pending")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const amount1 = randomInt(1, 99)
	let amount2 = randomInt(1, 99)
	if (amount2 === amount1) amount2 = amount1 === 99 ? 98 : amount1 + 1
	const now = new Date()
	const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
	const meta = readMetadata(existing.metadataJson)

	await db
		.update(ProviderPaymentAccount)
		.set({
			metadataJson: {
				...meta,
				microDeposit: {
					status: "initiated",
					amountHashes: [
						hashMicroDepositAmount(existing.id, amount1),
						hashMicroDepositAmount(existing.id, amount2),
					],
					initiatedAt: now.toISOString(),
					expiresAt: expiresAt.toISOString(),
					attempts: 0,
					initiatedBy: params.actorUserId,
				},
			},
			updatedAt: now,
		})
		.where(eq(ProviderPaymentAccount.id, existing.id))

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.payment_account.micro_deposit_initiate",
		entityType: "ProviderPaymentAccount",
		entityId: existing.id,
		beforeJson: { microDeposit: readMicroDepositChallenge(meta) },
		afterJson: { status: "initiated", expiresAt: expiresAt.toISOString() },
		riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
	})

	const afterRows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.id, existing.id))
		.then(first)
	const after = afterRows
		? mapRow(afterRows, { includeSecret: true })
		: mapRow(existing, { includeSecret: true })

	return {
		account: {
			...after,
			microDeposit: {
				...after.microDeposit,
				amountsCents: [amount1, amount2] as [number, number],
			},
		},
		/** Simulated deposit amounts (cents). In production these would be sent by the bank rail. */
		depositAmountsCents: [amount1, amount2] as [number, number],
	}
}

/**
 * Provider confirms the two micro-deposit amounts. On success → verified + FinancialProfile.
 */
export async function confirmPaymentAccountMicroDeposit(params: {
	providerId: string
	actorUserId: string
	accountId: string
	amount1Cents: unknown
	amount2Cents: unknown
}) {
	await assertCanManagePayments(params.providerId, params.actorUserId)

	const amount1 = Number(params.amount1Cents)
	const amount2 = Number(params.amount2Cents)
	if (
		!Number.isInteger(amount1) ||
		!Number.isInteger(amount2) ||
		amount1 < 1 ||
		amount1 > 99 ||
		amount2 < 1 ||
		amount2 > 99
	) {
		const error = new Error("invalid_micro_deposit_amounts")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const existing = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.id, params.accountId),
				eq(ProviderPaymentAccount.providerId, params.providerId)
			)
		)
		.then(first)

	if (!existing?.id) {
		const error = new Error("not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}
	if (existing.status !== "pending") {
		const error = new Error("not_pending")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const meta = readMetadata(existing.metadataJson)
	const challenge = meta.microDeposit
	if (!challenge || typeof challenge !== "object" || Array.isArray(challenge)) {
		const error = new Error("micro_deposit_not_initiated")
		;(error as Error & { status?: number }).status = 409
		throw error
	}
	const challengeObj = challenge as Record<string, unknown>
	if (String(challengeObj.status) !== "initiated") {
		const error = new Error("micro_deposit_not_initiated")
		;(error as Error & { status?: number }).status = 409
		throw error
	}
	const expiresAt =
		typeof challengeObj.expiresAt === "string" ? new Date(challengeObj.expiresAt) : null
	if (expiresAt && expiresAt.getTime() < Date.now()) {
		const error = new Error("micro_deposit_expired")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const hashes = Array.isArray(challengeObj.amountHashes)
		? challengeObj.amountHashes.map((value) => String(value))
		: []
	const submitted = [
		hashMicroDepositAmount(existing.id, amount1),
		hashMicroDepositAmount(existing.id, amount2),
	].sort()
	const expected = [...hashes].sort()
	const attempts = (Number(challengeObj.attempts) || 0) + 1
	const matched =
		submitted.length === 2 &&
		expected.length === 2 &&
		submitted[0] === expected[0] &&
		submitted[1] === expected[1]

	const now = new Date()
	if (!matched) {
		const failed = attempts >= PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS
		await db
			.update(ProviderPaymentAccount)
			.set({
				status: failed ? "requires_attention" : "pending",
				metadataJson: {
					...meta,
					microDeposit: {
						...challengeObj,
						status: failed ? "failed" : "initiated",
						attempts,
						lastFailedAt: now.toISOString(),
					},
				},
				updatedAt: now,
			})
			.where(eq(ProviderPaymentAccount.id, existing.id))

		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "provider.payment_account.micro_deposit_confirm",
			entityType: "ProviderPaymentAccount",
			entityId: existing.id,
			beforeJson: { attempts: attempts - 1 },
			afterJson: { matched: false, attempts, failed },
			riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
		})

		const error = new Error(failed ? "micro_deposit_failed" : "micro_deposit_mismatch")
		;(error as Error & { status?: number }).status = failed ? 409 : 400
		throw error
	}

	await db
		.update(ProviderPaymentAccount)
		.set({
			status: "verified",
			verifiedAt: now,
			metadataJson: {
				...meta,
				microDeposit: {
					...challengeObj,
					status: "confirmed",
					attempts,
					confirmedAt: now.toISOString(),
					amountHashes: undefined,
				},
				lastReview: {
					status: "verified",
					reason: "micro_deposit_confirmed",
					reviewedAt: now.toISOString(),
					reviewedBy: params.actorUserId,
					path: "micro_deposit",
				},
			},
			updatedAt: now,
		})
		.where(eq(ProviderPaymentAccount.id, existing.id))

	const afterRows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.id, existing.id))
		.then(first)
	const after = afterRows
		? mapRow(afterRows, { includeSecret: false })
		: mapRow(existing, { includeSecret: false })

	await syncProviderFinancialProfile({
		providerId: params.providerId,
		account: after,
	})

	await completeComplianceAssignment({
		providerId: params.providerId,
		domain: "payments",
		entityId: existing.id,
	})

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.payment_account.micro_deposit_confirm",
		entityType: "ProviderPaymentAccount",
		entityId: existing.id,
		beforeJson: { status: "pending" },
		afterJson: { status: "verified", path: "micro_deposit", attempts },
		riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
	})

	return after
}
