import { parseReviewDate } from "@/lib/provider-review-date"
import { createHash } from "node:crypto"
import { withPostgresTransaction, afterPostgresCommit } from "@/shared/infrastructure/db/client"
import {
	first,
	and,
	db,
	desc,
	eq,
	inArray,
	ProviderFinancialProfile,
	ProviderPaymentAccount,
	ProviderTaxConfiguration,
	ProviderUser,
	Provider,
} from "@/shared/infrastructure/db/compat"

import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { completeComplianceAssignment } from "@/lib/provider-compliance-ops"
import {
	initiatePayoutRailMicroDeposit,
	confirmStripeConnectMicroDeposit,
	canVerifyBankAccountAutomatically,
} from "@/lib/payout-rail"
import {
	synchronizeComplianceCaseCompat,
	resolveComplianceCaseForSourceCompat,
	assertLegacyComplianceReviewAllowed,
} from "@/lib/casework/compliance-casework"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
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
	status: "none" | "initiating" | "initiated" | "confirmed" | "failed"
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
	reviewedAt: Date | null
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
	/** Always masked in read and mutation responses. Secrets use the case-bound reveal flow. */
	accountIdentifier: string | null
	reviewReason?: string | null
	verificationMethod?: "manual" | "bank" | "unverified"
	isPrimary?: boolean
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
		statusRaw === "initiating" ||
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

/** Status is authoritative; a historical challenge never overrides a later decision. */
export function buildPayoutVerificationTimeline(
	account: Pick<ProviderPaymentAccountRecord, "status" | "microDeposit" | "verifiedAt"> &
		Partial<Pick<ProviderPaymentAccountRecord, "verificationMethod" | "reviewReason">>,
	now = new Date()
): PayoutVerificationTimeline {
	const challenge = account.microDeposit
	const attemptsUsed = Math.max(0, Number(challenge.attempts) || 0)
	const deadline = challenge.expiresAt ? new Date(challenge.expiresAt).getTime() : NaN
	const expired =
		challenge.status === "initiated" && (!Number.isFinite(deadline) || deadline <= now.getTime())
	const ready = account.status === "verified"
	const replaced = account.status === "superseded"
	const blocked =
		account.status === "requires_attention" || (!ready && challenge.status === "failed")
	const bankFlow = challenge.status !== "none" && account.verificationMethod === "bank"
	const canConfirm =
		account.status === "pending" &&
		challenge.status === "initiated" &&
		!expired &&
		attemptsUsed < PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS &&
		account.verificationMethod === "bank"
	let phaseLabel = "En revisión"
	let helperText = "El equipo revisará los datos y te indicará si necesita un respaldo adicional."
	if (replaced) {
		phaseLabel = "Reemplazada"
		helperText = "Se conserva como antecedente de una presentación anterior."
	} else if (ready) {
		phaseLabel = "Verificada"
		helperText = "Datos de la cuenta verificados. Las liquidaciones aún no están habilitadas."
	} else if (blocked) {
		phaseLabel = "Requiere corrección"
		helperText =
			account.reviewReason ||
			(attemptsUsed >= PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS
				? "Se agotaron los intentos de confirmación. Contacta al equipo o envía los datos corregidos."
				: "El equipo necesita revisar esta cuenta antes de continuar.")
	} else if (bankFlow && expired) {
		phaseLabel = "Verificación vencida"
		helperText =
			"El plazo terminó. El equipo debe revisar la cuenta antes de iniciar una nueva verificación."
	} else if (canConfirm) {
		phaseLabel = "Confirmar montos"
		helperText =
			attemptsUsed > 0
				? `Los montos no coincidieron. Te quedan ${PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS - attemptsUsed} intentos.`
				: "Ingresa los dos créditos de verificación que aparecen en tu extracto, en centavos."
	} else if (challenge.status === "initiating") {
		phaseLabel = "Verificación en curso"
		helperText = "Se está confirmando el inicio de la verificación bancaria."
	} else if (account.status === "not_configured") {
		phaseLabel = "Sin cuenta registrada"
		helperText = "El proveedor aún no ha enviado una cuenta bancaria."
	}
	const currentStepId: PayoutTimelineStepId | null =
		ready || replaced ? null : canConfirm ? "confirm" : "awaiting_deposits"
	const steps: PayoutTimelineStep[] = [
		{ id: "submitted", label: "Enviada", description: "Datos recibidos.", state: "complete" },
		{
			id: "awaiting_deposits",
			label: bankFlow ? "Verificación bancaria" : "Revisión del equipo",
			description: bankFlow ? "Comprobación de la cuenta." : "Comprobación de datos y respaldos.",
			state: ready
				? "complete"
				: blocked || expired
					? "blocked"
					: canConfirm
						? "complete"
						: "current",
		},
		...(bankFlow
			? [
					{
						id: "confirm" as const,
						label: "Confirmar montos",
						description: "Confirmación del extracto.",
						state: ready
							? ("complete" as const)
							: blocked || expired
								? ("blocked" as const)
								: canConfirm
									? ("current" as const)
									: ("upcoming" as const),
					},
				]
			: []),
		{
			id: "ready",
			label: "Verificada",
			description: "Resultado de la revisión.",
			state: ready ? "complete" : blocked || expired ? "blocked" : "upcoming",
		},
	]
	return {
		steps: replaced ? [] : steps,
		currentStepId,
		phaseLabel,
		helperText,
		showConfirmForm: canConfirm,
		attemptsUsed,
		attemptsRemaining: canConfirm ? PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS - attemptsUsed : null,
		expiresAt: challenge.expiresAt,
	}
}

function mapRow(row: {
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
}): ProviderPaymentAccountRecord {
	let status = asStatus(row.status)
	const method = asMethod(row.provider)
	const payoutSchedule = asSchedule(row.payoutSchedule)
	const meta = readMetadata(row.metadataJson)
	const review = readMetadata(meta.lastReview)
	const rail = readMetadata(meta.payoutRail)
	const verificationMethod =
		review.path === "manual_verify"
			? "manual"
			: rail.mode === "live" && rail.provider === "stripe_connect"
				? "bank"
				: "unverified"
	if (
		status === "verified" &&
		verificationMethod === "unverified" &&
		(rail.provider === "simulated" || readMetadata(meta.microDeposit).verifyVia === "hash")
	)
		status = "pending"

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
		accountIdentifier: null,
		reviewReason: typeof review.reason === "string" ? review.reason : null,
		verificationMethod,
		payoutSchedule,
		payoutScheduleLabel: scheduleLabels[payoutSchedule],
		microDeposit: readMicroDepositChallenge(meta),
		verifiedAt: status === "verified" ? (row.verifiedAt ?? null) : null,
		reviewedAt: parseReviewDate(row.metadataJson) ?? row.verifiedAt ?? null,
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

	const profile = await db
		.select({ reference: ProviderFinancialProfile.payoutMethodReference })
		.from(ProviderFinancialProfile)
		.where(eq(ProviderFinancialProfile.providerId, providerId))
		.then(first)
	const matches = rows.filter(
		(row) =>
			row.status === "verified" &&
			(row.id === profile?.reference || row.accountReference === profile?.reference)
	)
	return rows.map((row) => ({
		...mapRow(row),
		isPrimary: matches.length === 1 && matches[0].id === row.id,
	}))
}

export async function listPendingProviderPaymentAccountsForAdmin(): Promise<
	ProviderPaymentAccountRecord[]
> {
	const rows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(inArray(ProviderPaymentAccount.status, ["pending", "verified"]))
		.orderBy(desc(ProviderPaymentAccount.createdAt), desc(ProviderPaymentAccount.id))

	// Queue/read surfaces stay masked. Full identifiers are available only through
	// the case-bound reveal endpoint (permission + MFA + reason + audit).
	return rows.map((row) => mapRow(row)).filter((row) => row.status === "pending")
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
	return withPostgresTransaction(async () => {
		await assertCanManagePayments(params.providerId, params.actorUserId)
		await db
			.select({ id: Provider.id })
			.from(Provider)
			.where(eq(Provider.id, params.providerId))
			.for("update")

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
			.select(selectColumns)
			.from(ProviderPaymentAccount)
			.where(
				and(
					eq(ProviderPaymentAccount.providerId, params.providerId),
					inArray(ProviderPaymentAccount.status, ["pending", "verified"])
				)
			)
		if (pendingSameProvider.some((row) => mapRow(row).status === "pending")) {
			const error = new Error("pending_account_in_progress")
			;(error as Error & { status?: number }).status = 409
			throw error
		}

		const attentionAccounts = await db
			.select({ id: ProviderPaymentAccount.id })
			.from(ProviderPaymentAccount)
			.where(
				and(
					eq(ProviderPaymentAccount.providerId, params.providerId),
					eq(ProviderPaymentAccount.status, "requires_attention")
				)
			)
		for (const row of attentionAccounts) {
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
			beforeJson: attentionAccounts.length
				? { supersededIds: attentionAccounts.map((row) => row.id) }
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
		await synchronizeComplianceCaseCompat(paymentAccountSource(params.providerId, id))
		return created.find((row) => row.id === id)!
	}).catch((error: unknown) => {
		const code =
			(error as { code?: string; cause?: { code?: string } })?.cause?.code ||
			(error as { code?: string })?.code
		if (code === "23505") paymentError("pending_account_in_progress")
		if (code === "40001") paymentError("account_changed_retry")
		throw error
	})
}

export async function assertHasVerifiedPaymentAccount(providerId: string): Promise<void> {
	if (
		!(await listProviderPaymentAccounts(providerId)).some(
			(account) => account.status === "verified"
		)
	) {
		const error = new Error("verified_payment_account_required")
		;(error as Error & { status?: number }).status = 409
		throw error
	}
}

function paymentAccountSource(providerId: string, accountId: string) {
	return {
		providerId,
		domain: "payments" as const,
		sourceType: "ProviderPaymentAccount",
		sourceRef: accountId,
		summary: "Revisión de cuenta bancaria",
	}
}

function paymentError(code: string, status = 409): never {
	throw Object.assign(new Error(code), { status })
}

async function lockedAccount(providerId: string, accountId: string) {
	// All account writes take the same provider lock, including creation and primary selection.
	await db
		.select({ id: Provider.id })
		.from(Provider)
		.where(eq(Provider.id, providerId))
		.for("update")
	const row = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.id, accountId),
				eq(ProviderPaymentAccount.providerId, providerId)
			)
		)
		.for("update")
		.then(first)
	if (!row) return paymentError("not_found", 404)
	if (row.status === "verified" && mapRow(row).status === "pending") {
		await db
			.update(ProviderPaymentAccount)
			.set({ status: "pending", verifiedAt: null })
			.where(eq(ProviderPaymentAccount.id, row.id))
		return { ...row, status: "pending", verifiedAt: null }
	}
	return row
}

/** Recompute the existing read model when fiscal review changes. */
export async function refreshProviderBankingReadiness(providerId: string) {
	return withPostgresTransaction(async () => {
		await db
			.select({ id: Provider.id })
			.from(Provider)
			.where(eq(Provider.id, providerId))
			.for("update")
		const accounts = (await listProviderPaymentAccounts(providerId)).filter(
			(account) => account.status === "verified"
		)
		const selected =
			accounts.find((account) => account.isPrimary) ?? (accounts.length === 1 ? accounts[0] : null)
		if (selected) await syncProviderFinancialProfile(selected)
		else
			await db
				.update(ProviderFinancialProfile)
				.set({ status: "incomplete", updatedAt: new Date() })
				.where(eq(ProviderFinancialProfile.providerId, providerId))
	})
}

async function syncProviderFinancialProfile(
	account: ProviderPaymentAccountRecord,
	selectPrimary = false
) {
	const profile = await db
		.select()
		.from(ProviderFinancialProfile)
		.where(eq(ProviderFinancialProfile.providerId, account.providerId))
		.then(first)
	const accountRows = await db
		.select(selectColumns)
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.providerId, account.providerId),
				eq(ProviderPaymentAccount.status, "verified")
			)
		)
	const accounts = accountRows.filter((row) => mapRow(row).status === "verified")
	const existingPrimary = accounts.filter(
		(row) =>
			row.id === profile?.payoutMethodReference ||
			row.accountReference === profile?.payoutMethodReference
	)
	// Verification of an additional account never silently replaces the selected beneficiary.
	const selected =
		selectPrimary || !profile?.payoutMethodReference
			? account
			: existingPrimary.length === 1
				? mapRow(existingPrimary[0])
				: null
	const tax = await db
		.select({ status: ProviderTaxConfiguration.status })
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, account.providerId))
		.then(first)
	const taxProfileStatus =
		tax?.status === "verified"
			? ("verified" as const)
			: tax?.status === "pending" || tax?.status === "requires_attention"
				? ("pending_review" as const)
				: ("missing" as const)
	const now = new Date()
	const values = {
		providerId: account.providerId,
		payoutMethodReference: selected?.id ?? profile?.payoutMethodReference ?? null,
		payoutSchedule: selected?.payoutSchedule ?? "manual",
		currency: selected?.currency ?? profile?.currency ?? account.currency,
		taxProfileStatus,
		status:
			selected && taxProfileStatus === "verified" ? ("ready" as const) : ("incomplete" as const),
		updatedAt: now,
	}
	await db
		.insert(ProviderFinancialProfile)
		.values({ ...values, createdAt: now })
		.onConflictDoUpdate({ target: [ProviderFinancialProfile.providerId], set: values })
}

async function finishAccountReview(account: ProviderPaymentAccountRecord, manageCase = true) {
	if (account.status === "verified") await syncProviderFinancialProfile(account)
	else await refreshProviderBankingReadiness(account.providerId)
	await completeComplianceAssignment({
		providerId: account.providerId,
		domain: "payments",
		entityId: account.id,
	})
	if (manageCase)
		await resolveComplianceCaseForSourceCompat(
			paymentAccountSource(account.providerId, account.id),
			account.status === "verified" ? "requirements_satisfied" : "information_mismatch"
		)
	await afterPostgresCommit(async () => {
		await invalidateProvider(account.providerId)
		await invalidateProviderGovernance(account.providerId, "payment_account_reviewed")
	})
}

export async function selectPrimaryProviderPaymentAccount(params: {
	providerId: string
	actorUserId: string
	accountId: string
}) {
	await assertCanManagePayments(params.providerId, params.actorUserId)
	return withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		if (row.status !== "verified") paymentError("verified_payment_account_required")
		const account = mapRow(row)
		await syncProviderFinancialProfile(account, true)
		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "provider.payment_account.select_primary",
			entityType: "ProviderPaymentAccount",
			entityId: row.id,
			afterJson: { accountId: row.id },
			riskLevel: "high",
		})
		return { ...account, isPrimary: true }
	})
}

export function requirePaymentAccountReviewReason(status: string, value: unknown): string {
	const reason = String(value ?? "").trim()
	if (reason.length < 10)
		paymentError(
			status === "verified" ? "payment_review_evidence_required" : "reason_required",
			400
		)
	return reason
}

export async function reviewProviderPaymentAccount(params: {
	providerId: string
	actorUserId: string
	accountId: string
	status: unknown
	reason?: unknown
	/** Casework commands own their decision lifecycle. */
	manageCase?: boolean
}) {
	const nextStatus = asStatus(params.status)
	if (nextStatus !== "verified" && nextStatus !== "requires_attention")
		paymentError("invalid_review_status", 400)
	const reason = requirePaymentAccountReviewReason(nextStatus, params.reason)
	return withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		if (row.status !== "pending") paymentError("not_pending")
		const now = new Date()
		const metadata = readMetadata(row.metadataJson)
		const values = {
			status: nextStatus,
			verifiedAt: nextStatus === "verified" ? now : null,
			updatedAt: now,
			metadataJson: {
				...metadata,
				lastReview: {
					status: nextStatus,
					reason,
					reviewedAt: now.toISOString(),
					reviewedBy: params.actorUserId,
					path: "manual_verify",
				},
			},
		}
		await db.update(ProviderPaymentAccount).set(values).where(eq(ProviderPaymentAccount.id, row.id))
		const account = mapRow({ ...row, ...values })
		await finishAccountReview(account, params.manageCase !== false)
		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "provider.payment_account.review",
			entityType: "ProviderPaymentAccount",
			entityId: row.id,
			beforeJson: { status: row.status },
			afterJson: { status: nextStatus, reason, path: "manual_verify" },
			riskLevel: inferSettingsRiskLevel({ domain: "payments" }),
		})
		return account
	})
}

/** Reserves one challenge before contacting the bank; retries reuse its external idempotency key. */
export async function initiatePaymentAccountMicroDeposit(params: {
	providerId: string
	actorUserId: string
	accountId: string
}) {
	const reservation = await withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		await synchronizeComplianceCaseCompat(paymentAccountSource(params.providerId, params.accountId))
		await assertLegacyComplianceReviewAllowed(
			paymentAccountSource(params.providerId, params.accountId)
		)
		if (row.status !== "pending") paymentError("not_pending")
		const account = mapRow(row)
		if (!canVerifyBankAccountAutomatically(account))
			paymentError("bank_verification_unavailable", 422)
		const meta = readMetadata(row.metadataJson)
		const challenge = readMetadata(meta.microDeposit)
		if (challenge.status === "initiated" || challenge.status === "failed")
			paymentError("micro_deposit_review_required")
		const requestKey =
			typeof challenge.requestKey === "string" && challenge.status === "initiating"
				? challenge.requestKey
				: crypto.randomUUID()
		const now = new Date()
		await db
			.update(ProviderPaymentAccount)
			.set({
				metadataJson: {
					...meta,
					microDeposit: {
						...challenge,
						status: "initiating",
						requestKey,
						initiatedAt: challenge.initiatedAt || now.toISOString(),
						attempts: Number(challenge.attempts) || 0,
					},
				},
				updatedAt: now,
			})
			.where(eq(ProviderPaymentAccount.id, row.id))
		return {
			row,
			account,
			requestKey,
			initiatedAt: String(challenge.initiatedAt || now.toISOString()),
		}
	})
	const result = await initiatePayoutRailMicroDeposit({
		accountId: params.accountId,
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		currency: reservation.account.currency,
		country: reservation.account.country,
		accountNumberLast4: reservation.account.accountNumberLast4,
		accountIdentifier: readAccountIdentifierFromMetadata(reservation.row.metadataJson),
		routingOrSwift: reservation.row.routingOrSwift,
		accountHolderName: reservation.row.accountHolderName,
		idempotencyKey: `bank_verification:${reservation.requestKey}`,
		initiatedAt: reservation.initiatedAt,
	})
	if (
		!result.ok ||
		result.mode !== "live" ||
		!result.externalRef ||
		result.verificationMethod === "financial_connections"
	)
		paymentError("bank_verification_unavailable", 503)
	return withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		const meta = readMetadata(row.metadataJson)
		const challenge = readMetadata(meta.microDeposit)
		if (row.status !== "pending" || challenge.requestKey !== reservation.requestKey)
			paymentError("not_pending")
		await assertLegacyComplianceReviewAllowed(
			paymentAccountSource(params.providerId, params.accountId)
		)
		if (challenge.status === "initiated") return { account: mapRow(row), rail: { mode: "live" } }
		const now = new Date()
		const values = {
			status: result.alreadyVerified ? "verified" : "pending",
			verifiedAt: result.alreadyVerified ? now : null,
			updatedAt: now,
			metadataJson: {
				...meta,
				payoutRail: {
					provider: result.provider,
					mode: "live",
					externalRef: result.externalRef,
					verificationMethod: "microdeposits",
					initiatedAt: now.toISOString(),
				},
				microDeposit: {
					...challenge,
					status: result.alreadyVerified ? "confirmed" : "initiated",
					verifyVia: "stripe",
					expiresAt: new Date(
						new Date(reservation.initiatedAt).getTime() + 7 * 86400000
					).toISOString(),
				},
				...(result.alreadyVerified
					? {
							lastReview: {
								status: "verified",
								reason: "Verificación bancaria completada.",
								reviewedAt: now.toISOString(),
								reviewedBy: params.actorUserId,
								path: "micro_deposit",
							},
						}
					: {}),
			},
		}
		await db.update(ProviderPaymentAccount).set(values).where(eq(ProviderPaymentAccount.id, row.id))
		const account = mapRow({ ...row, ...values })
		if (account.status === "verified") await finishAccountReview(account)
		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "provider.payment_account.micro_deposit_initiate",
			entityType: "ProviderPaymentAccount",
			entityId: row.id,
			afterJson: { status: account.status, method: "bank", requestKey: reservation.requestKey },
			riskLevel: "high",
		})
		return { account, rail: { mode: "live" } }
	})
}

export async function confirmPaymentAccountMicroDeposit(params: {
	providerId: string
	actorUserId: string
	accountId: string
	amount1Cents: unknown
	amount2Cents: unknown
	descriptorCode?: unknown
}) {
	await assertCanManagePayments(params.providerId, params.actorUserId)
	const descriptorCode = String(params.descriptorCode ?? "")
		.trim()
		.toUpperCase()
	const useDescriptor = /^SM[A-Z0-9]{4}$/.test(descriptorCode)
	const [amount1, amount2] = [Number(params.amount1Cents), Number(params.amount2Cents)].sort(
		(a, b) => a - b
	)
	const fingerprint = createHash("sha256")
		.update(useDescriptor ? descriptorCode : [amount1, amount2].sort().join(":"))
		.digest("hex")
	if (!useDescriptor && ![amount1, amount2].every((n) => Number.isInteger(n) && n >= 1 && n <= 99))
		paymentError("invalid_micro_deposit_amounts", 400)
	// Reserve an attempt under lock; external failures restore it and never count as wrong amounts.
	const attempt = await withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		await assertLegacyComplianceReviewAllowed(
			paymentAccountSource(params.providerId, params.accountId)
		)
		if (!canVerifyBankAccountAutomatically(mapRow(row)))
			paymentError("bank_verification_unavailable", 422)
		if (row.status !== "pending") paymentError("not_pending")
		const meta = readMetadata(row.metadataJson),
			challenge = readMetadata(meta.microDeposit),
			rail = readMetadata(meta.payoutRail)
		if (
			rail.mode !== "live" ||
			rail.provider !== "stripe_connect" ||
			challenge.verifyVia !== "stripe"
		)
			paymentError("bank_verification_unavailable", 422)
		if (challenge.status !== "initiated") paymentError("micro_deposit_not_initiated")
		const deadline = new Date(String(challenge.expiresAt ?? "")).getTime()
		if (!Number.isFinite(deadline) || deadline <= Date.now()) paymentError("micro_deposit_expired")
		if (
			challenge.confirmingAt &&
			Date.now() - new Date(String(challenge.confirmingAt)).getTime() < 60_000
		)
			paymentError("micro_deposit_confirmation_in_progress")
		if (challenge.confirmingAt && challenge.confirmationFingerprint !== fingerprint)
			paymentError("micro_deposit_confirmation_uncertain")
		const attempts = Number(challenge.attempts) || 0
		if (attempts >= PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS) paymentError("micro_deposit_failed")
		const token =
			challenge.confirmingAt && typeof challenge.confirmationToken === "string"
				? challenge.confirmationToken
				: crypto.randomUUID()
		await db
			.update(ProviderPaymentAccount)
			.set({
				metadataJson: {
					...meta,
					microDeposit: {
						...challenge,
						confirmingAt: new Date().toISOString(),
						confirmationToken: token,
						confirmationFingerprint: fingerprint,
					},
				},
			})
			.where(eq(ProviderPaymentAccount.id, row.id))
		return { token, externalRef: String(rail.externalRef ?? "") }
	})
	let result: Awaited<ReturnType<typeof confirmStripeConnectMicroDeposit>>
	try {
		result = await confirmStripeConnectMicroDeposit({
			externalRef: attempt.externalRef,
			amount1Cents: amount1,
			amount2Cents: amount2,
			descriptorCode: useDescriptor ? descriptorCode : null,
			idempotencyKey: `bank_confirmation:${attempt.token}`,
		})
	} catch {
		result = { ok: false, error: "bank_verification_unavailable" }
	}
	const outcome = await withPostgresTransaction(async () => {
		const row = await lockedAccount(params.providerId, params.accountId)
		const meta = readMetadata(row.metadataJson),
			challenge = readMetadata(meta.microDeposit)
		if (row.status !== "pending" || challenge.confirmationToken !== attempt.token)
			paymentError("not_pending")
		await assertLegacyComplianceReviewAllowed(
			paymentAccountSource(params.providerId, params.accountId)
		)
		const mismatch = !result.ok && /mismatch/.test(result.error ?? "")
		const attempts = (Number(challenge.attempts) || 0) + (mismatch || result.ok ? 1 : 0)
		const failed = mismatch && attempts >= PAYOUT_MICRO_DEPOSIT_MAX_ATTEMPTS
		const now = new Date()
		const values = {
			status: result.ok ? "verified" : failed ? "requires_attention" : "pending",
			verifiedAt: result.ok ? now : null,
			updatedAt: now,
			metadataJson: {
				...meta,
				microDeposit: {
					...challenge,
					status: result.ok ? "confirmed" : failed ? "failed" : "initiated",
					attempts,
					confirmingAt: result.ok || mismatch ? null : challenge.confirmingAt,
					confirmationToken: result.ok || mismatch ? null : challenge.confirmationToken,
				},
				...(result.ok || failed
					? {
							lastReview: {
								status: result.ok ? "verified" : "requires_attention",
								reason: result.ok
									? "Titularidad confirmada por verificación bancaria."
									: "Se agotaron los intentos de verificación bancaria.",
								reviewedAt: now.toISOString(),
								reviewedBy: params.actorUserId,
								path: "micro_deposit",
							},
						}
					: {}),
			},
		}
		await db.update(ProviderPaymentAccount).set(values).where(eq(ProviderPaymentAccount.id, row.id))
		const account = mapRow({ ...row, ...values })
		if (result.ok || failed) await finishAccountReview(account)
		await writeProviderAuditLog({
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: "provider.payment_account.micro_deposit_confirm",
			entityType: "ProviderPaymentAccount",
			entityId: row.id,
			afterJson: { status: account.status, attempts, matched: result.ok },
			riskLevel: "high",
		})
		return {
			account,
			error: result.ok
				? null
				: mismatch
					? failed
						? "micro_deposit_failed"
						: "micro_deposit_mismatch"
					: "bank_verification_unavailable",
		}
	})
	// Throw after commit so wrong attempts are persisted.
	if (outcome.error)
		paymentError(outcome.error, outcome.error === "micro_deposit_mismatch" ? 400 : 409)
	return outcome.account
}
