import {
	reconcileComplianceCases,
	resolveComplianceCaseForSource,
	listCurrentComplianceCaseSources,
} from "@/lib/casework/compliance-casework"
import { afterAll, describe, expect, it } from "vitest"
import { hasIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { withPostgresTransaction, closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	db,
	eq,
	and,
	Provider,
	User,
	ProviderUser,
	ProviderVerification,
	ProviderDocument,
	ProviderTaxConfiguration,
	ProviderPaymentAccount,
	ComplianceCase,
	CaseDecision,
	CaseActivityEvent,
	CaseTask,
	AuditEvent,
	ComplianceDecisionReason,
} from "@/shared/infrastructure/db/compat"
import { executeSensitiveCommand } from "@/lib/commands/sensitive-command"
import {
	proposeCaseDecision,
	assignCase,
	applyCaseDecision,
	approveAndApplyCaseDecision,
	getProvider360,
	listCommandCenterCases,
	publishInformationRequest,
	respondToInformationRequest,
	listProviderInformationRequests,
} from "@/modules/casework/public"

const available = hasIsolatedTestDatabase()
const policyVersionId = "cpv_bo_accommodation_intermediary_v1"
// Each scenario rolls back its own classified fixtures, including all audit and outbox writes.
async function scenario(work: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
	const rollback = new Error("ROLLBACK_CERTIFICATION_SCENARIO")
	await expect(
		withPostgresTransaction(async () => {
			const f = await fixture()
			await work(f)
			throw rollback
		})
	).rejects.toBe(rollback)
}
async function fixture() {
	const id = crypto.randomUUID()
	const providerId = `cc_gap_${id}`
	const otherId = `cc_other_${id}`
	const maker = `cc_maker_${id}`
	const checker = `cc_checker_${id}`
	const owner = `cc_owner_${id}`
	await db
		.insert(User)
		.values([maker, checker, owner].map((id) => ({ id, email: `${id}@fastt.test` })))
	await db.insert(Provider).values(
		[providerId, otherId].map((id) => ({
			id,
			legalName: "Synthetic gap certification",
			displayName: id,
			status: "inactive",
			accountPurpose: "integration_certification",
			dataClassification: "fixture",
		}))
	)
	await db
		.insert(ProviderUser)
		.values({ id: crypto.randomUUID(), providerId, userId: owner, role: "owner" })
	await db.insert(ProviderTaxConfiguration).values({
		providerId,
		status: "pending",
		taxResidenceCountry: "BO",
		businessRegistrationNumber: "SYNTHETIC-ONLY",
		taxRegime: "fixture",
		invoicingMode: "platform_receipt",
	})
	const documentId = `doc_${id}`
	const paymentId = `pay_${id}`
	await db.insert(ProviderDocument).values({
		id: documentId,
		providerId,
		type: "business_registration",
		status: "pending",
		fileUrl: "local://certification/fixture.pdf",
	})
	await db.insert(ProviderPaymentAccount).values({
		id: paymentId,
		providerId,
		status: "pending",
		provider: "bank_transfer",
		currency: "BOB",
		country: "BO",
		accountHolderName: "Synthetic gap certification",
		accountNumberLast4: "0000",
		payoutSchedule: "manual",
	})
	async function createCase(
		domain = "verification",
		riskTier = "standard",
		target = providerId,
		openedAt = new Date()
	) {
		const caseId = crypto.randomUUID()
		await db.insert(ComplianceCase).values({
			id: caseId,
			caseNumber: `CC-GAP-${caseId}`,
			providerId: target,
			domain,
			status: "open",
			stage: "intake",
			sourceType: {
				verification: "ProviderVerification",
				fiscal: "ProviderTaxConfiguration",
				documents: "ProviderDocument",
				payments: "ProviderPaymentAccount",
			}[domain]!,
			sourceRef: domain === "documents" ? documentId : domain === "payments" ? paymentId : target,
			policyVersionId,
			riskTier,
			summary: "Synthetic certification only",
			openedAt,
		})
		return caseId
	}
	async function propose(
		caseId: string,
		decision = "rejected",
		expectedVersion = 1,
		actor = maker
	) {
		const [reason] = await db
			.select()
			.from(ComplianceDecisionReason)
			.where(
				and(
					eq(ComplianceDecisionReason.policyVersionId, policyVersionId),
					eq(ComplianceDecisionReason.decision, decision)
				)
			)
		expect(reason).toBeTruthy()
		return proposeCaseDecision({
			caseId,
			expectedVersion,
			decision,
			reasonCode: reason.code,
			actorUserId: actor,
			comment: "Synthetic certification: requirements not satisfied; no commercial effect.",
			evidenceSnapshot: { fixture: true },
		})
	}
	return { providerId, otherId, maker, checker, owner, createCase, propose, documentId, paymentId }
}

describe
	.skipIf(!available)
	.sequential("casework persistence and recovery in isolated PostgreSQL", () => {
		afterAll(closePostgresClients)
		it("preserves an old active case beyond 100 closed cases and excludes a second provider", () =>
			scenario(async (f) => {
				const oldest = await f.createCase(
					"fiscal",
					"standard",
					f.providerId,
					new Date("2020-01-01")
				)
				await db.insert(ComplianceCase).values(
					Array.from({ length: 101 }, () => {
						const id = crypto.randomUUID()
						return {
							id,
							caseNumber: `CC-GAP-${id}`,
							providerId: f.providerId,
							domain: "fiscal",
							status: "resolved",
							stage: "decision",
							sourceType: "ProviderTaxConfiguration",
							sourceRef: f.providerId,
							policyVersionId,
							summary: "Closed synthetic fixture",
							openedAt: new Date(),
							resolvedAt: new Date(),
						}
					})
				)
				await f.createCase("fiscal", "standard", f.otherId)
				const snapshot = await getProvider360(f.providerId)
				expect(snapshot?.caseCounts.total).toBe(102)
				expect(snapshot?.pendingCases.map((row) => row.id)).toContain(oldest)
				expect(snapshot?.cases).toHaveLength(100)
				const queue = await listCommandCenterCases({ providerId: f.providerId, domain: "fiscal" })
				expect(JSON.stringify(queue)).toContain(oldest)
				expect(JSON.stringify(queue)).not.toContain(f.otherId)
			}))
		for (const domain of ["verification", "fiscal", "documents", "payments"])
			it(`rolls back ${domain} source, case and activity on a failure after application`, () =>
				scenario(async (f) => {
					const caseId = await f.createCase(domain)
					const failed = new Error("SIMULATED_RESPONSE_PERSISTENCE_FAILURE")
					await expect(
						withPostgresTransaction(
							async () => {
								const proposal = await f.propose(caseId)
								await applyCaseDecision({
									decisionId: proposal.decisionId,
									expectedCaseVersion: proposal.caseVersion,
									actorUserId: f.maker,
								})
								throw failed
							},
							{ savepoint: true }
						)
					).rejects.toBe(failed)
					expect(
						await db.select().from(CaseDecision).where(eq(CaseDecision.caseId, caseId))
					).toHaveLength(0)
					expect(
						await db.select().from(CaseActivityEvent).where(eq(CaseActivityEvent.caseId, caseId))
					).toHaveLength(0)
					expect(
						(await db.select().from(ComplianceCase).where(eq(ComplianceCase.id, caseId)))[0]
					).toMatchObject({ status: "open", version: 1 })
					expect(
						await db
							.select()
							.from(ProviderVerification)
							.where(eq(ProviderVerification.providerId, f.providerId))
					).toHaveLength(0)
					expect(
						(
							await db.select().from(ProviderDocument).where(eq(ProviderDocument.id, f.documentId))
						)[0].status
					).toBe("pending")
					expect(
						(
							await db
								.select()
								.from(ProviderTaxConfiguration)
								.where(eq(ProviderTaxConfiguration.providerId, f.providerId))
						)[0].status
					).toBe("pending")
					expect(
						(
							await db
								.select()
								.from(ProviderPaymentAccount)
								.where(eq(ProviderPaymentAccount.id, f.paymentId))
						)[0].status
					).toBe("pending")
					const proposal = await f.propose(caseId)
					const result = await applyCaseDecision({
						decisionId: proposal.decisionId,
						expectedCaseVersion: proposal.caseVersion,
						actorUserId: f.maker,
					})
					expect(result.applied).toBe(true)
					const [decision] = await db
						.select()
						.from(CaseDecision)
						.where(eq(CaseDecision.id, proposal.decisionId))
					expect(decision.status).toBe("applied")
					const replay = await applyCaseDecision({
						decisionId: proposal.decisionId,
						expectedCaseVersion: result.caseVersion,
						actorUserId: f.maker,
					})
					expect(replay.replayed).toBe(true)
					const events = await db
						.select()
						.from(CaseActivityEvent)
						.where(
							and(
								eq(CaseActivityEvent.caseId, caseId),
								eq(CaseActivityEvent.eventType, "decision_applied")
							)
						)
					expect(events).toHaveLength(1)
				}))
		it("replays an uncertain successful response without creating another decision", () =>
			scenario(async (f) => {
				const caseId = await f.createCase("verification")
				const key = crypto.randomUUID()
				let executions = 0
				const run = () =>
					executeSensitiveCommand({
						atomic: true,
						audit: {
							requestId: crypto.randomUUID(),
							action: "case.decision.propose",
							entityType: "ComplianceCase",
							entityId: caseId,
							providerId: f.providerId,
							actorUserId: f.maker,
							riskLevel: "high",
						},
						idempotency: {
							scope: "case.decision.propose",
							key,
							payload: { caseId, decision: "rejected" },
						},
						execute: async () => {
							executions++
							const proposal = await f.propose(caseId)
							const application = await applyCaseDecision({
								decisionId: proposal.decisionId,
								expectedCaseVersion: proposal.caseVersion,
								actorUserId: f.maker,
							})
							return { response: { ...proposal, ...application } }
						},
					})
				const first = await run()
				const second = await run()
				expect(second.replayed).toBe(true)
				expect(second.response).toEqual(first.response)
				expect(executions).toBe(1)
				expect(
					await db.select().from(CaseDecision).where(eq(CaseDecision.caseId, caseId))
				).toHaveLength(1)
				expect(
					await db
						.select()
						.from(ProviderVerification)
						.where(eq(ProviderVerification.providerId, f.providerId))
				).toHaveLength(1)
				const audits = await db
					.select()
					.from(AuditEvent)
					.where(and(eq(AuditEvent.entityId, caseId), eq(AuditEvent.outcome, "succeeded")))
				expect(audits).toHaveLength(2)
			}))

		it("does not regenerate a fiscal review after a negative decision", () =>
			scenario(async (f) => {
				const caseId = await f.createCase("fiscal")
				const proposal = await f.propose(caseId)
				await applyCaseDecision({
					decisionId: proposal.decisionId,
					expectedCaseVersion: proposal.caseVersion,
					actorUserId: f.maker,
				})
				expect(
					(await listCurrentComplianceCaseSources()).filter(
						(row) => row.providerId === f.providerId && row.domain === "fiscal"
					)
				).toHaveLength(0)
				await reconcileComplianceCases({ providerId: f.providerId })
				expect(
					await db
						.select()
						.from(ComplianceCase)
						.where(
							and(eq(ComplianceCase.providerId, f.providerId), eq(ComplianceCase.domain, "fiscal"))
						)
				).toHaveLength(1)
			}))
		it("does not auto-close a pending proposal when the source stops being pending", () =>
			scenario(async (f) => {
				const caseId = await f.createCase("verification", "high")
				await f.propose(caseId)
				expect(
					await resolveComplianceCaseForSource({
						providerId: f.providerId,
						domain: "verification",
						sourceType: "ProviderVerification",
						sourceRef: f.providerId,
					})
				).toBe(0)
				expect(
					(await db.select().from(ComplianceCase).where(eq(ComplianceCase.id, caseId)))[0].status
				).toBe("in_review")
			}))

		it("requires a distinct checker and leaves the source untouched before approval", () =>
			scenario(async (f) => {
				const caseId = await f.createCase("verification", "high")
				const proposal = await f.propose(caseId)
				expect(proposal.requiresSecondControl).toBe(true)
				await expect(
					approveAndApplyCaseDecision({
						decisionId: proposal.decisionId,
						expectedCaseVersion: proposal.caseVersion,
						actorUserId: f.maker,
					})
				).rejects.toThrow("maker_checker_separation_required")
				expect(
					await db
						.select()
						.from(ProviderVerification)
						.where(eq(ProviderVerification.providerId, f.providerId))
				).toHaveLength(0)
				expect(
					(
						await approveAndApplyCaseDecision({
							decisionId: proposal.decisionId,
							expectedCaseVersion: proposal.caseVersion,
							actorUserId: f.checker,
						})
					).applied
				).toBe(true)
			}))
		it("publishes only public text, rejects another provider, correlates response and resumes review", () =>
			scenario(async (f) => {
				const caseId = await f.createCase("fiscal")
				const proposal = await f.propose(caseId, "request_information")
				const result = await applyCaseDecision({
					decisionId: proposal.decisionId,
					expectedCaseVersion: proposal.caseVersion,
					actorUserId: f.maker,
				})
				expect(result.caseStatus).toBe("waiting_information")
				await db
					.insert(CaseTask)
					.values({ id: crypto.randomUUID(), caseId, taskKey: "review", status: "open" })
				const assignment = await assignCase({
					caseId,
					expectedVersion: result.caseVersion,
					assigneeUserId: f.maker,
					assigneeEmail: `${f.maker}@fastt.test`,
					actorUserId: f.maker,
				})

				await expect(
					f.propose(caseId, "request_information", assignment.caseVersion)
				).rejects.toThrow("case_waiting_information")
				expect(await listProviderInformationRequests(f.providerId, f.checker)).toEqual([])
				expect(await listProviderInformationRequests(f.providerId, f.owner)).toEqual([])
				await publishInformationRequest({
					decisionId: proposal.decisionId,
					expectedVersion: assignment.caseVersion,
					actorUserId: f.maker,
					message: "Actualiza el documento fiscal en la sección segura e indica qué corregiste.",
				})
				const inbox = await listProviderInformationRequests(f.providerId, f.owner)
				expect(inbox).toHaveLength(1)
				expect(inbox[0].message).not.toContain("Synthetic certification")
				await expect(
					respondToInformationRequest({
						decisionId: proposal.decisionId,
						providerId: f.otherId,
						actorUserId: f.owner,
						message: "Intento de otro proveedor, debe rechazarse",
					})
				).rejects.toThrow("information_request_not_found")
				await respondToInformationRequest({
					decisionId: proposal.decisionId,
					providerId: f.providerId,
					actorUserId: f.owner,
					message: "He corregido los datos de prueba en la sección segura.",
				})
				const [row] = await db.select().from(ComplianceCase).where(eq(ComplianceCase.id, caseId))
				expect(row.status).toBe("in_review")
				expect(
					(await listProviderInformationRequests(f.providerId, f.owner))[0].response
				).toContain("He corregido")
				expect(
					(
						await db
							.select()
							.from(ProviderTaxConfiguration)
							.where(eq(ProviderTaxConfiguration.providerId, f.providerId))
					)[0].status
				).toBe("pending")
			}))
	})
