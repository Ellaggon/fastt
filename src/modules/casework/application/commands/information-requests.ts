import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import {
	and,
	db,
	eq,
	inArray,
	CaseActivityEvent,
	CaseDecision,
	ComplianceCase,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

const fail = (code: string, status = 409): never => {
	throw Object.assign(new Error(code), { status })
}
const permissionByDomain = {
	verification: "canEditProfile",
	fiscal: "canManageFiscality",
	documents: "canManageDocuments",
	payments: "canManagePayments",
} as const
export const reviewPermissionByDomain = {
	verification: "provider.verification.review",
	fiscal: "provider.fiscal.review",
	documents: "provider.document.review",
	payments: "provider.payment.review",
} as const

export async function assertInformationRecipient(
	providerId: string,
	userId: string,
	domain: string
) {
	const [link] = await db
		.select()
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
	const permission = permissionByDomain[domain as keyof typeof permissionByDomain]
	if (!link || !permission || !resolveProviderPermissions(link)[permission])
		fail("information_request_forbidden", 403)
}

export async function informationRequestContext(decisionId: string) {
	const [row] = await db
		.select({ decision: CaseDecision, case: ComplianceCase })
		.from(CaseDecision)
		.innerJoin(ComplianceCase, eq(ComplianceCase.id, CaseDecision.caseId))
		.where(eq(CaseDecision.id, decisionId))
	if (!row || row.decision.decision !== "request_information" || row.decision.status !== "applied")
		fail("information_request_not_found", 404)
	return row
}

/** Publication means durable availability in the authenticated inbox, never email delivery. */
export async function publishInformationRequest(input: {
	decisionId: string
	expectedVersion: number
	actorUserId: string
	message: string
}) {
	const message = input.message.trim()
	if (message.length < 12 || message.length > 4000) fail("information_request_message_invalid", 422)
	return withPostgresTransaction(async () => {
		const context = await informationRequestContext(input.decisionId)
		if (context.case.status !== "waiting_information") fail("information_request_not_waiting")
		const [claimed] = await db
			.update(ComplianceCase)
			.set({ version: input.expectedVersion + 1, updatedAt: new Date() })
			.where(
				and(
					eq(ComplianceCase.id, context.case.id),
					eq(ComplianceCase.version, input.expectedVersion)
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed) fail("case_version_conflict")
		const events = await requestEvents(context.case.id, input.decisionId)
		if (events.some((e) => e.eventType === "information_request_published"))
			fail("information_request_already_published")
		// A recipient is a current provider member with the domain permission, not a guessed email.
		const members = await db
			.select()
			.from(ProviderUser)
			.where(eq(ProviderUser.providerId, context.case.providerId))
		const permission = permissionByDomain[context.case.domain as keyof typeof permissionByDomain]
		if (!permission || !members.some((link) => resolveProviderPermissions(link)[permission]))
			fail("information_request_recipient_missing", 422)
		const publishedAt = new Date()
		await db.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId: context.case.id,
			eventType: "information_request_published",
			actorUserId: input.actorUserId,
			summary: "Solicitud publicada en el buzón seguro del proveedor; lectura no confirmada",
			metadataJson: { decisionId: input.decisionId, channel: "provider_inbox", message },
			createdAt: publishedAt,
		})
		return {
			published: true,
			channel: "provider_inbox",
			caseVersion: input.expectedVersion + 1,
			publishedAt: publishedAt.toISOString(),
		}
	})
}

async function requestEvents(caseId: string, decisionId: string) {
	const events = await db
		.select()
		.from(CaseActivityEvent)
		.where(
			and(
				eq(CaseActivityEvent.caseId, caseId),
				inArray(CaseActivityEvent.eventType, [
					"information_request_published",
					"information_request_responded",
				])
			)
		)
	return events.filter(
		(event) => (event.metadataJson as { decisionId?: string } | null)?.decisionId === decisionId
	)
}

export async function respondToInformationRequest(input: {
	decisionId: string
	providerId: string
	actorUserId: string
	message: string
}) {
	const message = input.message.trim()
	if (message.length < 12 || message.length > 4000) fail("information_response_invalid", 422)
	return withPostgresTransaction(async () => {
		const context = await informationRequestContext(input.decisionId)
		if (context.case.providerId !== input.providerId) fail("information_request_not_found", 404)
		await assertInformationRecipient(input.providerId, input.actorUserId, context.case.domain)
		const [claimed] = await db
			.update(ComplianceCase)
			.set({
				status: "in_review",
				stage: "evidence",
				version: context.case.version + 1,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(ComplianceCase.id, context.case.id),
					eq(ComplianceCase.version, context.case.version),
					eq(ComplianceCase.status, "waiting_information")
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed) fail("information_request_not_waiting")
		const events = await requestEvents(context.case.id, input.decisionId)
		if (!events.some((e) => e.eventType === "information_request_published"))
			fail("information_request_not_published")
		if (events.some((e) => e.eventType === "information_request_responded"))
			fail("information_request_already_responded")
		const respondedAt = new Date()
		await db.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId: context.case.id,
			eventType: "information_request_responded",
			actorUserId: input.actorUserId,
			summary: "Respuesta del proveedor recibida; pendiente de revisión",
			metadataJson: { decisionId: input.decisionId, channel: "provider_inbox", message },
			createdAt: respondedAt,
		})
		return {
			responded: true,
			caseVersion: context.case.version + 1,
			respondedAt: respondedAt.toISOString(),
		}
	})
}

export async function listProviderInformationRequests(providerId: string, userId: string) {
	const rows = await db
		.select({
			decisionId: CaseDecision.id,
			caseId: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
		})
		.from(CaseDecision)
		.innerJoin(ComplianceCase, eq(ComplianceCase.id, CaseDecision.caseId))
		.where(
			and(
				eq(ComplianceCase.providerId, providerId),
				eq(CaseDecision.decision, "request_information"),
				eq(CaseDecision.status, "applied")
			)
		)
	const result = []
	for (const row of rows) {
		try {
			await assertInformationRecipient(providerId, userId, row.domain)
		} catch (error) {
			if ((error as { status?: number }).status === 403) continue
			throw error
		}
		const events = await requestEvents(row.caseId, row.decisionId)
		const published = events.find((e) => e.eventType === "information_request_published")
		if (!published) continue
		const response = events.find((e) => e.eventType === "information_request_responded")
		result.push({
			...row,
			message: String((published.metadataJson as { message?: string })?.message ?? ""),
			publishedAt: published.createdAt,
			response: response
				? String((response.metadataJson as { message?: string })?.message ?? "")
				: null,
			respondedAt: response?.createdAt ?? null,
		})
	}
	return result
}
