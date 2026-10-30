import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { APIContext } from "astro"
import * as providerAuth from "@/lib/auth/requireProvider"
import * as internalAuth from "@/lib/auth/internal-authorization"
import * as stepUp from "@/lib/auth/internal-step-up"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { POST as collectionPOST } from "@/pages/api/provider/settings/commercial-line-collection-model"
import { POST as agreementPOST } from "@/pages/api/provider/settings/commercial-agreement"
import { POST as adminAgreementPOST } from "@/pages/api/admin/commercial-agreements"
import {
	db,
	eq,
	inArray,
	Provider,
	ProviderUser,
	User,
	ProviderHolderProfile,
	ProviderVerification,
	ProviderTaxConfiguration,
	ProviderCommercialLine,
	ComplianceCase,
	CaseTask,
} from "@/shared/infrastructure/db/compat"
import { ProviderCommercialAgreement } from "@/shared/infrastructure/db/schema/tables"
import {
	requestCommercialAgreement,
	offerCommercialAgreement,
	acceptCommercialAgreement,
	commercialAgreementStatus,
	requestCommercialAgreementCorrection,
} from "@/modules/financial/commercial-agreements"
import { declareProviderCommercialLineCollectionModel } from "@/lib/verification/commercial-lines"
import { proposeCaseDecision } from "@/modules/casework/application/commands/case-commands"
import {
	createCommercialPolicyDraft,
	addCommercialPolicyDraftRule,
} from "@/lib/commercial-policy/policy-drafts"
import { ratifyCommercialTourPolicy } from "@/lib/commercial-policy/ratification"
import { ensureOperatingGeographyFixtures } from "../test-support/operating-geography"
import {
	createDocumentDefinitionDraft,
	transitionDocumentDefinition,
} from "@/lib/documents/document-definitions"

let providerId: string, signer: string, manager: string, reviewer: string
beforeAll(ensureOperatingGeographyFixtures)
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})
const terms = {
	commissionPercent: 12,
	commissionBase: "Precio del servicio cobrado y no devuelto, excluyendo impuestos separados.",
	currency: "USD",
	effectiveFrom: "2026-01-01",
	effectiveTo: "2030-12-31",
	paymentTiming: "El proveedor cobra antes de prestar la experiencia.",
	cancellationTerms: "Las devoluciones siguen las condiciones contratadas al reservar.",
	settlementTerms: "Conciliación mensual con evidencia del cobro efectivo del proveedor.",
	fiscalResponsibilities: "El vendedor documenta el servicio y Fastt documenta su propia comisión.",
	fullTerms:
		"Acuerdo ficticio de prueba que permite verificar la aceptación versionada, representación y trazabilidad del contrato comercial de tours con cobro directo.",
	documentReference: "fixture-contract-2026",
}
beforeEach(async () => {
	const suffix = crypto.randomUUID()
	providerId = `agreement-${suffix}`
	vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "enforce")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_PROVIDER_IDS", providerId)
	vi.stubEnv("FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE", "isolated-test-review")
	signer = `signer-${suffix}`
	manager = `manager-${suffix}`
	reviewer = `reviewer-${suffix}`
	await db.insert(User).values(
		[signer, manager, reviewer].map((id) => ({
			id,
			email: `${id}@fastt.test`,
			username: id,
			registrationDate: new Date(),
		}))
	)
	await db.insert(Provider).values({
		id: providerId,
		legalName: "Fixture Tours",
		displayName: "Fixture Tours",
		dataClassification: "fixture",
		accountPurpose: "integration_certification",
	})
	await db.insert(ProviderUser).values(
		[signer, manager].map((userId) => ({
			id: crypto.randomUUID(),
			providerId,
			userId,
			role: "owner",
		}))
	)
	await db.insert(ProviderHolderProfile).values({
		providerId,
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: "BO",
		declarationStatus: "verified",
	})
	await db.insert(ProviderVerification).values({
		id: crypto.randomUUID(),
		providerId,
		status: "approved",
		reviewedBy: reviewer,
		reviewedAt: new Date(),
	})
	await db
		.insert(ProviderTaxConfiguration)
		.values({ providerId, status: "verified", businessRegistrationNumber: "fixture-tax" })
	await db
		.insert(ProviderCommercialLine)
		.values({ id: crypto.randomUUID(), providerId, line: "tour", source: "onboarding" })
})
async function requested() {
	await declareProviderCommercialLineCollectionModel({
		providerId,
		line: "tour",
		collectionModel: "property_collect",
		declaredByUserId: signer,
	})
	return requestCommercialAgreement(providerId, signer)
}
async function offered() {
	const row = await requested()
	return offerCommercialAgreement({
		providerId,
		agreementId: row.id,
		actorUserId: reviewer,
		signerUserId: signer,
		representationReference: "fixture-mandate-reviewed",
		terms,
	})
}
describe("provider commercial agreement lifecycle", () => {
	it("completes declaration, request, offer and acceptance through the HTTP handlers", async () => {
		vi.spyOn(providerAuth, "requireProviderSessionSurface").mockImplementation(async () => ({
			user: { id: signer, email: `${signer}@fastt.test` },
			provider: {
				providerId,
				userId: signer,
				role: "owner",
				permissions: resolveProviderPermissions({ role: "owner" }),
			},
		}))
		const post = (handler: typeof agreementPOST, path: string, values: Record<string, string>) => {
			const form = new FormData()
			for (const [key, value] of Object.entries(values)) form.set(key, value)
			return handler({
				request: new Request(`http://fastt.test${path}`, {
					method: "POST",
					headers: { Accept: "application/json", Origin: "http://fastt.test" },
					body: form,
				}),
			} as APIContext)
		}
		expect(
			(
				await post(collectionPOST, "/api/provider/settings/commercial-line-collection-model", {
					line: "tour",
					collectionModel: "property_collect",
				})
			).status
		).toBe(200)
		expect(
			(
				await post(agreementPOST, "/api/provider/settings/commercial-agreement", {
					action: "request",
				})
			).status
		).toBe(200)
		const [request] = await db
			.select()
			.from(ProviderCommercialAgreement)
			.where(eq(ProviderCommercialAgreement.providerId, providerId))
		const permission = vi.spyOn(internalAuth, "requireInternalPermission").mockResolvedValue({
			user: { id: reviewer, email: `${reviewer}@fastt.test` },
			mode: "iam",
			roles: [],
			grants: [],
		})
		vi.spyOn(stepUp, "requireRecentInternalAuthentication").mockResolvedValue(undefined)
		const response = await post(adminAgreementPOST, "/api/admin/commercial-agreements", {
			action: "offer",
			providerId,
			agreementId: request.id,
			signerUserId: signer,
			representationReference: "fixture-reviewed-mandate",
			...Object.fromEntries(Object.entries(terms).map(([key, value]) => [key, String(value)])),
		})
		expect(response.status).toBe(200)
		expect(permission).toHaveBeenCalledWith(
			expect.any(Request),
			"commercial_policy.finance.approve",
			{ type: "provider", id: providerId }
		)
		const [offer] = await db
			.select()
			.from(ProviderCommercialAgreement)
			.where(eq(ProviderCommercialAgreement.id, request.id))
		expect(
			(
				await post(agreementPOST, "/api/provider/settings/commercial-agreement", {
					action: "accept",
					agreementId: offer.id,
					termsHash: offer.termsHash!,
					consent: "on",
				})
			).status
		).toBe(200)
		expect((await commercialAgreementStatus(providerId)).state).toBe("active")
	})
	it("prepares a general policy and requires three separate ratifications", async () => {
		const draft = new FormData()
		for (const [key, value] of Object.entries({
			country: "BO",
			jurisdictionRole: "product",
			holderType: "persona_natural",
			effectiveFrom: "2026-01-01",
			effectiveTo: "2030-12-31",
			operatingRoles: "guide",
			activityClasses: "urban_cultural",
			experienceFormats: "guided_tour",
			jurisdictionCodes: "geo:bo:la-paz-department",
		}))
			draft.append(key, value)
		const row = await createCommercialPolicyDraft(draft)
		const rule = new FormData()
		for (const [key, value] of Object.entries({
			versionId: row.id,
			requirementKey: "fixture.guide",
			domain: "documents",
			evidence: "operating_license",
			evidenceScope: "product",
			reviewOwner: "Fixture operations",
			blockingAction: "Adjunta la credencial aplicable a esta experiencia.",
			sourceKind: "contract",
			sourceReference: "https://fixture.fastt.test/approved-terms",
			sourceCheckedAt: "2026-01-01",
			capabilities: "publish",
		}))
			rule.append(key, value)
		await addCommercialPolicyDraftRule(rule)
		await ratifyCommercialTourPolicy({
			policyVersionId: row.id,
			approvalArea: "policy",
			approverUserId: reviewer,
			approvalReference: "fixture-policy-review",
		})
		await expect(addCommercialPolicyDraftRule(rule)).rejects.toThrow("signed_policy_immutable")
		await expect(
			ratifyCommercialTourPolicy({
				policyVersionId: row.id,
				approvalArea: "finance",
				approverUserId: reviewer,
				approvalReference: "fixture-finance-review",
			})
		).rejects.toThrow("commercial_policy_approval_exists")
		await ratifyCommercialTourPolicy({
			policyVersionId: row.id,
			approvalArea: "finance",
			approverUserId: manager,
			approvalReference: "fixture-finance-review",
		})
		const result = await ratifyCommercialTourPolicy({
			policyVersionId: row.id,
			approvalArea: "tour_operations",
			approverUserId: signer,
			approvalReference: "fixture-operations-review",
		})
		expect(result.status).toBe("published")
	})
	it("ratifies a composable family without losing its versioned evidence contract", async () => {
		const definition = await createDocumentDefinitionDraft({
			key: `fixture.${crypto.randomUUID().replaceAll("-", "")}`,
			label: "Credencial de prueba",
			description: "Documento sintético para probar la firma, sin valor legal.",
			family: "operating_license",
			capture: {
				version: 1,
				issuer: "optional",
				issuedAt: "optional",
				expiresAt: "optional",
				allowedSubjectTypes: ["person"],
				issuerCountries: [],
				requiredScopes: ["product"],
			},
		})
		await transitionDocumentDefinition(definition.id, "publish")
		const form = new FormData()
		for (const [key, value] of Object.entries({
			country: "BO",
			jurisdictionRole: "product",
			holderType: "persona_natural",
			effectiveFrom: "2026-01-01",
			effectiveTo: "2030-12-31",
			operatingRoles: "guide",
			activityClasses: "urban_cultural",
			experienceFormats: "guided_tour",
			jurisdictionCodes: "geo:bo:la-paz-department",
			contractMode: "composable",
			policyKind: "requirements",
			policyFamily: "tourism",
			policyCode: `test-${crypto.randomUUID()}`,
		}))
			form.append(key, value)
		const draft = await createCommercialPolicyDraft(form)
		const rule = new FormData()
		for (const [key, value] of Object.entries({
			"versionId": draft.id,
			"requirementKey": "fixture.versioned.guide",
			"domain": "documents",
			"evidenceMode": "versioned",
			"alternative.0": definition.id,
			"evidenceSubjectSelector": "guides",
			"evidenceScope": "product",
			"reviewOwner": "Fixture operations",
			"blockingAction": "Presenta la credencial sintética del guía.",
			"sourceKind": "fastt_policy",
			"sourceReference": "https://fixture.fastt.test/versioned-policy",
			"sourceCheckedAt": "2026-01-01",
			"capabilities": "publish",
		}))
			rule.append(key, value)
		await addCommercialPolicyDraftRule(rule)
		const hashes: string[] = []
		for (const [approvalArea, approverUserId] of [
			["policy", reviewer],
			["finance", manager],
			["tour_operations", signer],
		] as const) {
			const result = await ratifyCommercialTourPolicy({
				policyVersionId: draft.id,
				approvalArea,
				approverUserId,
				approvalReference: `fixture-${approvalArea}`,
			})
			hashes.push(result.contractHash)
			if (approvalArea === "tour_operations") expect(result.status).toBe("published")
		}
		expect(new Set(hashes).size).toBe(1)
		await expect(transitionDocumentDefinition(definition.id, "retire")).rejects.toThrow(
			"document_definition_used_by_policy"
		)
	})
	it("declaration is independent of approval and concurrent requests create one case", async () => {
		await expect(requestCommercialAgreement(providerId, signer)).rejects.toThrow(
			"declare_collection_first"
		)
		await declareProviderCommercialLineCollectionModel({
			providerId,
			line: "tour",
			collectionModel: "property_collect",
			declaredByUserId: signer,
		})
		const [a, b] = await Promise.all([
			requestCommercialAgreement(providerId, signer),
			requestCommercialAgreement(providerId, signer),
		])
		expect(a.id).toBe(b.id)
		expect((await commercialAgreementStatus(providerId)).state).toBe("proposal_requested")
		const tasks = await db.select().from(CaseTask).where(eq(CaseTask.caseId, a.caseId!))
		expect(tasks).toHaveLength(1)
	})
	it("a manager role cannot replace the specifically reviewed signer", async () => {
		const row = await offered()
		await expect(
			acceptCommercialAgreement({
				providerId,
				userId: manager,
				agreementId: row.id,
				termsHash: row.termsHash!,
				consent: true,
			})
		).rejects.toThrow("authorized_signer_required")
		vi.stubEnv("FASTT_TOUR_AGREEMENT_PROVIDER_IDS", `${providerId},other-${providerId}`)
		await expect(
			acceptCommercialAgreement({
				providerId: `other-${providerId}`,
				userId: signer,
				agreementId: row.id,
				termsHash: row.termsHash!,
				consent: true,
			})
		).rejects.toThrow("proposal_obsolete")
	})
	it("accepts the precise version, closes the case and preserves immutable terms", async () => {
		const row = await offered()
		await expect(
			acceptCommercialAgreement({
				providerId,
				userId: signer,
				agreementId: row.id,
				termsHash: "stale",
				consent: true,
			})
		).rejects.toThrow("proposal_obsolete")
		await expect(
			acceptCommercialAgreement({
				providerId,
				userId: signer,
				agreementId: row.id,
				termsHash: row.termsHash!,
				consent: false,
			})
		).rejects.toThrow("consent_required")
		await acceptCommercialAgreement({
			providerId,
			userId: signer,
			agreementId: row.id,
			termsHash: row.termsHash!,
			consent: true,
		})
		await acceptCommercialAgreement({
			providerId,
			userId: signer,
			agreementId: row.id,
			termsHash: row.termsHash!,
			consent: true,
		})
		expect((await commercialAgreementStatus(providerId)).state).toBe("active")
		const [caseRow] = await db
			.select()
			.from(ComplianceCase)
			.where(eq(ComplianceCase.id, row.caseId!))
		expect(caseRow.status).toBe("resolved")
		await expect(
			db
				.update(ProviderCommercialAgreement)
				.set({ termsJson: { bad: true } })
				.where(eq(ProviderCommercialAgreement.id, row.id))
		).rejects.toThrow()
	})
	it("changing identity invalidates use of an accepted version without rewriting it", async () => {
		const row = await offered()
		await acceptCommercialAgreement({
			providerId,
			userId: signer,
			agreementId: row.id,
			termsHash: row.termsHash!,
			consent: true,
		})
		await db
			.update(Provider)
			.set({ legalName: "Different seller" })
			.where(eq(Provider.id, providerId))
		expect((await commercialAgreementStatus(providerId)).state).toBe("review_required")
	})
	it("a correction withdraws the old proposal and opens a new version", async () => {
		const row = await offered()
		const next = await requestCommercialAgreementCorrection(
			providerId,
			row.id,
			manager,
			"Debe corregirse el representante autorizado."
		)
		expect(next.version).toBe(row.version + 1)
		expect(next.status).toBe("requested")
		await expect(
			acceptCommercialAgreement({
				providerId,
				userId: signer,
				agreementId: row.id,
				termsHash: row.termsHash!,
				consent: true,
			})
		).rejects.toThrow("proposal_obsolete")
		const cases = await db
			.select()
			.from(ComplianceCase)
			.where(inArray(ComplianceCase.id, [row.caseId!, next.caseId!]))
		expect(cases.find((c) => c.id === row.caseId)?.status).toBe("canceled")
	})
	it("agreement cases cannot approve the provider identity through generic case decisions", async () => {
		const row = await requested()
		await expect(
			proposeCaseDecision({
				caseId: row.caseId!,
				expectedVersion: 1,
				decision: "approved",
				reasonCode: "verified",
				actorUserId: reviewer,
				evidenceSnapshot: {},
			})
		).rejects.toThrow("use_commercial_agreement_workspace")
	})
})
