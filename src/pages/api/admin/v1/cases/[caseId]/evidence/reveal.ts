import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { writeSensitiveDataAccessEvent } from "@/lib/audit/audit-events"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import { createProviderDocumentPreviewUrl } from "@/lib/provider-document-storage"
import { readAccountIdentifierFromMetadata } from "@/lib/provider-payment-secrets"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
import { getCaseWorkspace } from "@/modules/casework/public"
import {
	and,
	db,
	eq,
	first,
	ProviderDocument,
	ProviderPaymentAccount,
	ProviderTaxConfiguration,
} from "@/shared/infrastructure/db/compat"

const allowedKindByDomain: Record<string, string> = {
	documents: "document",
	fiscal: "tax_registration",
	payments: "payment_account",
}

function noStore(payload: unknown, status = 200) {
	return Response.json(payload, {
		status,
		headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" },
	})
}

export const POST: APIRoute = async ({ request, params }) => {
	const requestId = requestIdFromRequest(request)
	let requestedKind = ""
	let reason = ""
	try {
		const body = (await request.json()) as Record<string, unknown>
		const caseId = String(params.caseId ?? "")
		requestedKind = String(body.kind ?? "")
		reason = String(body.reason ?? "").trim()
		if (reason.length < 8)
			return withRequestId(noStore({ error: "access_reason_required" }, 422), requestId)
		const workspace = await getCaseWorkspace(caseId)
		if (!workspace) return withRequestId(noStore({ error: "case_not_found" }, 404), requestId)
		if (allowedKindByDomain[workspace.case.domain] !== requestedKind)
			return withRequestId(noStore({ error: "evidence_kind_not_allowed" }, 409), requestId)

		const audit: SensitiveCommandAudit = {
			requestId,
			action: `case.evidence.${requestedKind}.reveal`,
			entityType: "ComplianceCase",
			entityId: caseId,
			providerId: workspace.case.providerId,
			riskLevel: "high",
			contextJson: {
				reason,
				sourceType: workspace.case.sourceType,
				sourceRef: workspace.case.sourceRef,
			},
		}
		const command = await executeSensitiveCommand({
			audit,
			authorize: async () => {
				await requireInternalPermission(request, "provider.compliance.read", {
					type: "provider",
					id: workspace.case.providerId,
				})
				const principal = await requireInternalPermission(request, "sensitive_data.reveal", {
					type: "provider",
					id: workspace.case.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.actorRoleKeys = principal.roles
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				let response: Record<string, unknown>
				let resourceType: string
				let fields: string[]
				if (requestedKind === "document") {
					const row = await db
						.select({ id: ProviderDocument.id, fileUrl: ProviderDocument.fileUrl })
						.from(ProviderDocument)
						.where(
							and(
								eq(ProviderDocument.id, workspace.case.sourceRef),
								eq(ProviderDocument.providerId, workspace.case.providerId)
							)
						)
						.then(first)
					if (!row?.fileUrl) throw Object.assign(new Error("evidence_not_found"), { status: 404 })
					const url = await createProviderDocumentPreviewUrl({
						fileUrl: row.fileUrl,
						expiresInSeconds: 300,
					})
					if (!url) throw Object.assign(new Error("preview_unavailable"), { status: 404 })
					response = { kind: requestedKind, url, expiresInSeconds: 300 }
					resourceType = "ProviderDocument"
					fields = ["fileUrl"]
				} else if (requestedKind === "tax_registration") {
					const row = await db
						.select({
							providerId: ProviderTaxConfiguration.providerId,
							businessRegistrationNumber: ProviderTaxConfiguration.businessRegistrationNumber,
						})
						.from(ProviderTaxConfiguration)
						.where(eq(ProviderTaxConfiguration.providerId, workspace.case.providerId))
						.then(first)
					if (!row?.businessRegistrationNumber)
						throw Object.assign(new Error("evidence_not_found"), { status: 404 })
					response = {
						kind: requestedKind,
						businessRegistrationNumber: row.businessRegistrationNumber,
						hideAfterSeconds: 60,
					}
					resourceType = "ProviderTaxConfiguration"
					fields = ["businessRegistrationNumber"]
				} else {
					const row = await db
						.select({
							id: ProviderPaymentAccount.id,
							routingOrSwift: ProviderPaymentAccount.routingOrSwift,
							metadataJson: ProviderPaymentAccount.metadataJson,
						})
						.from(ProviderPaymentAccount)
						.where(
							and(
								eq(ProviderPaymentAccount.id, workspace.case.sourceRef),
								eq(ProviderPaymentAccount.providerId, workspace.case.providerId)
							)
						)
						.then(first)
					if (!row?.id) throw Object.assign(new Error("evidence_not_found"), { status: 404 })
					const accountIdentifier = readAccountIdentifierFromMetadata(row.metadataJson)
					if (!accountIdentifier)
						throw Object.assign(new Error("payment_identifier_unavailable"), { status: 404 })
					response = {
						kind: requestedKind,
						accountIdentifier,
						routingOrSwift: row.routingOrSwift,
						hideAfterSeconds: 60,
					}
					resourceType = "ProviderPaymentAccount"
					fields = ["accountIdentifier", "routingOrSwift"]
				}
				await writeSensitiveDataAccessEvent({
					requestId,
					actorUserId: audit.actorUserId,
					providerId: workspace.case.providerId,
					resourceType,
					resourceId: workspace.case.sourceRef,
					accessType: "reveal",
					reason,
					fields,
				})
				return { response, afterJson: { revealedFields: fields } }
			},
		})
		return withRequestId(noStore({ ok: true, ...command.response }), requestId)
	} catch (error) {
		if (error instanceof Response) return withRequestId(error, requestId)
		const status = Number((error as Error & { status?: number }).status ?? 500)
		const code =
			status >= 500
				? "evidence_reveal_failed"
				: error instanceof Error
					? error.message
					: "evidence_reveal_failed"
		return withRequestId(noStore({ error: code }, status), requestId)
	}
}
