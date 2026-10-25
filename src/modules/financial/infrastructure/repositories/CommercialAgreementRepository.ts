import { createHash } from "node:crypto"
import {
	and,
	db,
	desc,
	eq,
	inArray,
	sql,
	Provider,
	ProviderHolderProfile,
	ProviderCommercialLine,
	ProviderTaxConfiguration,
	ProviderUser,
	ComplianceCase,
	CaseTask,
	ProviderAuditLog,
	ProviderVerification,
	ProviderProfile,
	CaseActivityEvent,
} from "@/shared/infrastructure/db/compat"
import { ProviderCommercialAgreement } from "@/shared/infrastructure/db/schema/tables"
import {
	agreementTermsSchema,
	agreementValidity,
	type AgreementTerms,
} from "../../domain/commercial-agreement"

export type AgreementRow = typeof ProviderCommercialAgreement.$inferSelect
export type OfferedTerms = AgreementTerms & {
	sellerName: string
	beneficiaryProviderId: string
	identityHash: string
	collectionModel: "property_collect"
	timeZone: string
}
export class AgreementError extends Error {
	constructor(
		public code: string,
		public status = 409
	) {
		super(code)
	}
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function identity(tx: Tx, providerId: string) {
	const [provider] = await tx.select().from(Provider).where(eq(Provider.id, providerId))
	const [profile] = await tx
		.select({ timezone: ProviderProfile.timezone })
		.from(ProviderProfile)
		.where(eq(ProviderProfile.providerId, providerId))
	const [holder] = await tx
		.select()
		.from(ProviderHolderProfile)
		.where(eq(ProviderHolderProfile.providerId, providerId))
	const [tax] = await tx
		.select()
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, providerId))
	if (!provider || !holder) throw new AgreementError("holder_required", 422)
	const [verification] = await tx
		.select({ status: ProviderVerification.status })
		.from(ProviderVerification)
		.where(eq(ProviderVerification.providerId, providerId))
		.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
		.limit(1)
	return {
		sellerName: provider.legalName ?? "",
		timeZone: profile?.timezone ?? "America/La_Paz",
		hash: digest({
			name: provider.legalName,
			type: holder.holderType,
			country: holder.holderCountry,
			taxCountry: holder.taxResidenceCountry,
			declaration: holder.declarationStatus,
			taxNumber: tax?.businessRegistrationNumber,
			taxStatus: tax?.status,
			verificationStatus: verification?.status,
		}),
		holder,
		tax,
		verification,
	}
}
async function lock(tx: Tx, providerId: string) {
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-agreement:${providerId}:tour`}, 0))`
	)
}
async function audit(
	tx: Tx,
	providerId: string,
	userId: string,
	action: string,
	before: unknown,
	after: unknown,
	id: string
) {
	await tx.insert(ProviderAuditLog).values({
		id: crypto.randomUUID(),
		providerId,
		actorUserId: userId,
		action: `commercial_agreement.${action}`,
		entityType: "ProviderCommercialAgreement",
		entityId: id,
		beforeJson: before,
		afterJson: after,
		riskLevel: "high",
		createdAt: new Date(),
	})
	const [agreement] = await tx
		.select({ caseId: ProviderCommercialAgreement.caseId })
		.from(ProviderCommercialAgreement)
		.where(eq(ProviderCommercialAgreement.id, id))
	if (agreement?.caseId)
		await tx.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId: agreement.caseId,
			actorUserId: userId,
			eventType: `commercial_agreement_${action}`,
			summary:
				(
					{
						requested: "Propuesta comercial solicitada",
						offered: "Propuesta enviada al representante",
						accepted: "Acuerdo aceptado por el representante",
						withdrawn: "Propuesta retirada",
						correction_requested: "Nueva versión solicitada",
					} as Record<string, string>
				)[action] ?? action,
			metadataJson: { agreementId: id },
		})
}
export async function listCommercialAgreements(providerId: string) {
	return db
		.select()
		.from(ProviderCommercialAgreement)
		.where(eq(ProviderCommercialAgreement.providerId, providerId))
		.orderBy(desc(ProviderCommercialAgreement.version))
}
export async function requestCommercialAgreement(providerId: string, userId: string) {
	return db.transaction(async (tx) => {
		await lock(tx, providerId)
		const [line] = await tx
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, providerId),
					eq(ProviderCommercialLine.line, "tour")
				)
			)
		if (line?.collectionModel !== "property_collect")
			throw new AgreementError("declare_collection_first", 422)
		const [pending] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.providerId, providerId),
					inArray(ProviderCommercialAgreement.status, ["requested", "offered"])
				)
			)
			.limit(1)
		if (pending) return pending
		const [last] = await tx
			.select({ version: ProviderCommercialAgreement.version })
			.from(ProviderCommercialAgreement)
			.where(eq(ProviderCommercialAgreement.providerId, providerId))
			.orderBy(desc(ProviderCommercialAgreement.version))
			.limit(1)
		const id = crypto.randomUUID(),
			caseId = crypto.randomUUID(),
			now = new Date()
		await tx.insert(ComplianceCase).values({
			id: caseId,
			caseNumber: `CC-${caseId.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
			providerId,
			domain: "verification",
			sourceType: "ProviderCommercialAgreement",
			sourceRef: id,
			summary: "Preparar acuerdo comercial de Tours",
			createdBy: userId,
		})
		await tx.insert(CaseTask).values({
			id: crypto.randomUUID(),
			caseId,
			taskKey: "commercial_agreement",
			taskType: "commercial_agreement",
			dueAt: new Date(now.getTime() + 48 * 3600000),
		})
		const [row] = await tx
			.insert(ProviderCommercialAgreement)
			.values({
				id,
				providerId,
				version: (last?.version ?? 0) + 1,
				requestedByUserId: userId,
				caseId,
			})
			.returning()
		await audit(tx, providerId, userId, "requested", null, { version: row.version, caseId }, id)
		return row
	})
}
export async function offerCommercialAgreement(input: {
	providerId: string
	agreementId: string
	actorUserId: string
	terms: unknown
	signerUserId: string
	representationReference: string
}) {
	const terms = agreementTermsSchema.parse(input.terms)
	if (input.representationReference.trim().length < 8)
		throw new AgreementError("representation_required", 422)
	return db.transaction(async (tx) => {
		await lock(tx, input.providerId)
		const [row] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.id, input.agreementId),
					eq(ProviderCommercialAgreement.providerId, input.providerId)
				)
			)
		if (!row || row.status !== "requested") throw new AgreementError("proposal_obsolete")
		const current = await identity(tx, input.providerId)
		const [line] = await tx
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, input.providerId),
					eq(ProviderCommercialLine.line, "tour")
				)
			)
		if (line?.collectionModel !== "property_collect")
			throw new AgreementError("declare_collection_first", 422)
		if (
			!current.sellerName ||
			current.verification?.status !== "approved" ||
			["in_review", "changes_requested"].includes(current.holder.declarationStatus) ||
			current.tax?.status !== "verified"
		)
			throw new AgreementError("verified_identity_and_tax_required", 422)
		const [signer] = await tx
			.select({ id: ProviderUser.id })
			.from(ProviderUser)
			.where(
				and(
					eq(ProviderUser.providerId, input.providerId),
					eq(ProviderUser.userId, input.signerUserId)
				)
			)
		if (!signer) throw new AgreementError("signer_not_member", 422)
		const offered: OfferedTerms = {
			...terms,
			sellerName: current.sellerName,
			beneficiaryProviderId: input.providerId,
			identityHash: current.hash,
			collectionModel: "property_collect",
			timeZone: current.timeZone,
		}
		const [updated] = await tx
			.update(ProviderCommercialAgreement)
			.set({
				status: "offered",
				termsJson: offered,
				termsHash: digest(offered),
				authorizedSignerUserId: input.signerUserId,
				representationReference: input.representationReference.trim(),
				offeredByUserId: input.actorUserId,
				offeredAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(ProviderCommercialAgreement.id, row.id))
			.returning()
		await tx
			.update(ComplianceCase)
			.set({
				status: "waiting_information",
				stage: "provider_acceptance",
				version: sql`${ComplianceCase.version}+1`,
				updatedAt: new Date(),
			})
			.where(eq(ComplianceCase.id, row.caseId!))
		await audit(
			tx,
			input.providerId,
			input.actorUserId,
			"offered",
			{ status: row.status },
			{ termsHash: updated.termsHash, signerUserId: input.signerUserId },
			row.id
		)
		return updated
	})
}
export async function acceptCommercialAgreement(input: {
	providerId: string
	userId: string
	agreementId: string
	termsHash: string
	consent: boolean
}) {
	if (!input.consent) throw new AgreementError("consent_required", 422)
	return db.transaction(async (tx) => {
		await lock(tx, input.providerId)
		const [row] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.id, input.agreementId),
					eq(ProviderCommercialAgreement.providerId, input.providerId)
				)
			)
		if (!row || row.termsHash !== input.termsHash) throw new AgreementError("proposal_obsolete")
		if (row.authorizedSignerUserId !== input.userId)
			throw new AgreementError("authorized_signer_required", 403)
		if (row.status === "accepted") return row
		if (row.status !== "offered") throw new AgreementError("proposal_obsolete")
		const current = await identity(tx, input.providerId)
		const terms = row.termsJson as OfferedTerms
		const [line] = await tx
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, input.providerId),
					eq(ProviderCommercialLine.line, "tour")
				)
			)
		if (terms.identityHash !== current.hash || line?.collectionModel !== "property_collect")
			throw new AgreementError("identity_changed")
		if (
			agreementValidity({
				status: "accepted",
				acceptedAt: new Date(),
				...terms,
				identityMatches: true,
			}) === "expired"
		)
			throw new AgreementError("proposal_expired")
		const [updated] = await tx
			.update(ProviderCommercialAgreement)
			.set({
				status: "accepted",
				acceptedByUserId: input.userId,
				acceptedAt: new Date(),
				acceptanceHash: row.termsHash,
				updatedAt: new Date(),
			})
			.where(eq(ProviderCommercialAgreement.id, row.id))
			.returning()
		if (row.caseId) {
			await tx
				.update(ComplianceCase)
				.set({
					status: "resolved",
					stage: "completed",
					resolutionCode: "agreement_accepted",
					version: sql`${ComplianceCase.version}+1`,
					resolvedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(ComplianceCase.id, row.caseId))
			await tx
				.update(CaseTask)
				.set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
				.where(eq(CaseTask.caseId, row.caseId))
		}
		await audit(
			tx,
			input.providerId,
			input.userId,
			"accepted",
			{ status: row.status },
			{ termsHash: row.termsHash, version: row.version },
			row.id
		)
		return updated
	})
}
export async function withdrawCommercialAgreement(
	providerId: string,
	agreementId: string,
	actorUserId: string
) {
	return db.transaction(async (tx) => {
		await lock(tx, providerId)
		const [row] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.id, agreementId),
					eq(ProviderCommercialAgreement.providerId, providerId)
				)
			)
		if (!row || !["requested", "offered"].includes(row.status))
			throw new AgreementError("proposal_obsolete")
		await tx
			.update(ProviderCommercialAgreement)
			.set({ status: "withdrawn", updatedAt: new Date() })
			.where(eq(ProviderCommercialAgreement.id, row.id))
		if (row.caseId) {
			await tx
				.update(ComplianceCase)
				.set({
					status: "canceled",
					closedAt: new Date(),
					version: sql`${ComplianceCase.version}+1`,
					updatedAt: new Date(),
				})
				.where(eq(ComplianceCase.id, row.caseId))
			await tx
				.update(CaseTask)
				.set({ status: "canceled", updatedAt: new Date() })
				.where(eq(CaseTask.caseId, row.caseId))
		}
		await audit(
			tx,
			providerId,
			actorUserId,
			"withdrawn",
			{ status: row.status },
			{ status: "withdrawn" },
			row.id
		)
	})
}
export async function commercialAgreementStatus(providerId: string) {
	return db.transaction(async (tx) => {
		const accepted = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.providerId, providerId),
					eq(ProviderCommercialAgreement.status, "accepted")
				)
			)
			.orderBy(desc(ProviderCommercialAgreement.version))
		const [pending] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.providerId, providerId),
					inArray(ProviderCommercialAgreement.status, ["requested", "offered"])
				)
			)
			.orderBy(desc(ProviderCommercialAgreement.version))
			.limit(1)
		const pendingState = pending
			? {
					state:
						pending.status === "requested"
							? ("proposal_requested" as const)
							: ("acceptance_required" as const),
					agreement: pending,
				}
			: null
		if (!accepted.length)
			return pendingState ?? { state: "acceptance_required" as const, agreement: null }
		const current = await identity(tx, providerId)
		const [line] = await tx
			.select()
			.from(ProviderCommercialLine)
			.where(
				and(
					eq(ProviderCommercialLine.providerId, providerId),
					eq(ProviderCommercialLine.line, "tour")
				)
			)
		const states = accepted.map((row) => ({
			agreement: row,
			state: agreementValidity({
				status: row.status,
				acceptedAt: row.acceptedAt,
				...(row.termsJson as OfferedTerms),
				identityMatches: (row.termsJson as OfferedTerms).identityHash === current.hash,
				collectionModel: line?.collectionModel ?? "undecided",
			}),
		}))
		return states.find((row) => row.state === "active") ?? pendingState ?? states[0]
	})
}

export async function requestCommercialAgreementCorrection(
	providerId: string,
	agreementId: string,
	actorUserId: string,
	reason: string
) {
	if (reason.trim().length < 12 || reason.length > 2000)
		throw new AgreementError("correction_reason_required", 422)
	return db.transaction(async (tx) => {
		await lock(tx, providerId)
		const [row] = await tx
			.select()
			.from(ProviderCommercialAgreement)
			.where(
				and(
					eq(ProviderCommercialAgreement.id, agreementId),
					eq(ProviderCommercialAgreement.providerId, providerId)
				)
			)
		if (!row || row.status !== "offered" || !row.caseId)
			throw new AgreementError("proposal_obsolete")
		await tx
			.update(ProviderCommercialAgreement)
			.set({ status: "withdrawn", updatedAt: new Date() })
			.where(eq(ProviderCommercialAgreement.id, row.id))
		await tx
			.update(ComplianceCase)
			.set({
				status: "canceled",
				resolutionCode: "proposal_correction_requested",
				version: sql`${ComplianceCase.version}+1`,
				closedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(ComplianceCase.id, row.caseId))
		await tx
			.update(CaseTask)
			.set({ status: "canceled", updatedAt: new Date() })
			.where(eq(CaseTask.caseId, row.caseId))
		const id = crypto.randomUUID(),
			caseId = crypto.randomUUID()
		await tx.insert(ComplianceCase).values({
			id: caseId,
			caseNumber: `CC-${caseId.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
			providerId,
			domain: "verification",
			sourceType: "ProviderCommercialAgreement",
			sourceRef: id,
			summary: "Corregir propuesta comercial de Tours",
			createdBy: actorUserId,
		})
		await tx.insert(CaseTask).values({
			id: crypto.randomUUID(),
			caseId,
			taskKey: "commercial_agreement",
			taskType: "commercial_agreement",
			dueAt: new Date(Date.now() + 48 * 3600000),
		})
		await tx.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId,
			eventType: "information_received",
			actorUserId,
			summary: reason.trim(),
			metadataJson: { previousAgreementId: row.id },
		})
		const [next] = await tx
			.insert(ProviderCommercialAgreement)
			.values({ id, providerId, version: row.version + 1, requestedByUserId: actorUserId, caseId })
			.returning()
		await audit(
			tx,
			providerId,
			actorUserId,
			"correction_requested",
			{ id: row.id, status: row.status },
			{ id: next.id, version: next.version },
			row.id
		)
		return next
	})
}
