import { describe, expect, it } from "vitest"
import proposal from "../fixtures/commercial-policy/bo-la-paz-urban.draft.json"
import { evaluateDocumentAcceptance } from "@/shared/domain/document-acceptance"
import { allTerritoriesCovered, territoryIsCovered } from "@/shared/domain/territorial-coverage"
import { commercialPolicyDraftSchema } from "@/lib/commercial-policy/policy-drafts"
import {
	documentDefinitionDraftSchema,
	validateDocumentCapture,
} from "@/shared/domain/document-definition"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyVersion,
} from "@/lib/commercial-policy/evaluate"

describe("La Paz local proposal (not regulatory certification)", () => {
	it("keeps pathway applicability explicit without turning sources into approval", () => {
		const rules = proposal.pathwayRequirements
		expect(rules.status).toBe("proposed_not_ratified")
		expect(rules.databaseWritesAllowed).toBe(false)
		expect(rules.operatorTeam.guides).toBe("personal_credential_per_assigned_guide")
		expect(rules.independentGuide.tourism).toBe(
			"personal_guide_credential_not_operator_license_by_default"
		)
		expect(rules.independentGuide.insurance).toBe(
			"fastt_liability_accident_assistance_when_applicable_no_legal_exemption"
		)
		expect(rules.operatorTeam.sitePermission).toBe(rules.independentGuide.sitePermission)
		expect(rules.notCollectedByDefault).toContain("medical_record")
		expect(rules.notCollectedByDefault).toContain("police_background")
		expect(rules.commercialAgreementIsSeparate).toBe(true)
		expect(rules.excludedFromAdmission).toEqual(
			expect.arrayContaining(["transport", "food", "external_execution"])
		)
		expect(proposal.activationAuthorized).toBe(false)
	})
	it("concretizes synthetic category, insurance and route without inventing legal clearance", () => {
		const decision = proposal.applicabilityDecisions
		expect(decision.operatorCategory.authorityCategoryLabel).toBe("Operadora de Turismo")
		expect(decision.operatorCategory.realProviderMustMatchIssuedAuthorization).toBe(true)
		expect(decision.insurance.independentGuideSourceKind).toBe("fastt_policy")
		expect(decision.insurance.independentGuideLegalUniversalityConfirmed).toBe(false)
		expect(decision.insurance.activationAuthorized).toBe(false)
		expect(decision.insurance.liabilityStandardForBothPathways).toBe(true)
		expect(decision.insurance.accidentAssistanceRequiresDocumentedApplicability).toBe(true)
		expect(decision.insurance.sufficiencyReview.materialUncertainty).toBe("pending_blocks_new_sales")
		expect(decision.insurance.sufficiencyReview.riskOrCoverageChangeRequiresReview).toBe(true)
		expect(decision.route.permitReview.outcomes).toContain("not_applicable_with_verifiable_basis")
		expect(decision.route.permitReview.outcomes).toContain("pending_blocks_new_sales")
		expect(decision.route.permitReview.routeChangeRequiresReview).toBe(true)
		expect(decision.route.municipalPermitApplicability).toBe(
			"requires_confirmation_not_exempt_by_default"
		)
		expect(decision.route.departmentCoverageIsNotSitePermission).toBe(true)
		expect(decision.route.actualRouteVerified).toBe(false)
		expect(decision.remainingForRealAdmission).toHaveLength(3)
	})
	describe("separate company and independent guide proposals", () => {
		const datesAndTerritory = {
			effectiveFrom: "2026-11-08",
			effectiveTo: null,
			jurisdictionCodes: [proposal.territoryPlaceId],
		}
		it("validates both explicit classifications without activating either", () => {
			for (const admission of [proposal.admission, proposal.independentGuideAdmission])
				expect(
					commercialPolicyDraftSchema.safeParse({ ...admission, ...datesAndTerritory }).success
				).toBe(true)
			expect(proposal.activationAuthorized).toBe(false)
			expect(proposal.independentGuideReview.activationAuthorized).toBe(false)
			expect(proposal.admission.operatingRoles).toEqual(["operator"])
			expect(proposal.independentGuideAdmission.operatingRoles).toEqual(["guide"])
			expect(proposal.independentGuideAdmission.executionModes).toEqual(["self"])
		})
		it("rejects company legal forms for the independent person and vice versa", () => {
			for (const [admission, other] of [
				[proposal.admission, proposal.independentGuideAdmission],
				[proposal.independentGuideAdmission, proposal.admission],
			]) {
				expect(
					commercialPolicyDraftSchema.safeParse({
						...admission,
						...datesAndTerritory,
						legalFormCodes: other!.legalFormCodes,
					}).success
				).toBe(false)
			}
		})
		it("reuses the personal credential definition without granting a registration exemption", () => {
			expect(
				proposal.documentDefinitions.some(
					(definition) =>
						definition.key === proposal.independentGuideReview.personalCredentialDefinitionKey
				)
			).toBe(true)
			expect(proposal.independentGuideReview.operatorLicenseAutomaticallyRequired).toBe(false)
			expect(proposal.independentGuideReview.businessRegistrationExemptionGranted).toBe(false)
		})
	})
	describe("directional territorial coverage", () => {
		const city = "geo:bo:la-paz-city"
		const department = "geo:bo:la-paz-department"
		const country = "geo:bo"
		const elAlto = "geo:bo:el-alto"
		const ancestors = {
			[city]: [city, department, country],
			[elAlto]: [elAlto, department, country],
			[department]: [department, country],
		}
		it("never widens a city-scoped document to a department or sibling city", () => {
			expect(territoryIsCovered(city, [city], ancestors)).toBe(true)
			for (const excluded of [department, country, elAlto, "geo:bo:cochabamba", "geo:cl:santiago"])
				expect(territoryIsCovered(excluded, [city], ancestors)).toBe(false)
		})
		it("rejects a route with even one uncovered territory or no declared territory", () => {
			expect(allTerritoriesCovered([city, elAlto], [city], ancestors)).toBe(false)
			expect(allTerritoriesCovered([], [city], ancestors)).toBe(false)
		})
		it("recognizes explicit wider evidence without expanding the city admission", () => {
			expect(territoryIsCovered(city, [department], ancestors)).toBe(true)
			expect(allTerritoriesCovered([city, elAlto], [city], ancestors)).toBe(false)
		})
		it("covers the department and both cities for each explicitly proposed pathway", () => {
			expect(proposal.territoryResolution.scope).toBe("department_only")
			expect(proposal.territoryPlaceId).toBe(department)
			for (const admission of [proposal.admission, proposal.independentGuideAdmission]) {
				expect(admission.jurisdictionCodes).toEqual([department])
				expect(
					allTerritoriesCovered([department, city, elAlto], admission.jurisdictionCodes, ancestors)
				).toBe(true)
				for (const outside of [country, "geo:bo:cochabamba", "geo:cl:santiago", "unknown-place"])
					expect(territoryIsCovered(outside, admission.jurisdictionCodes, ancestors)).toBe(false)
			}
		})
		it("rejects mixed-department routes and does not infer unknown ancestry", () => {
			expect(allTerritoriesCovered([city, "geo:bo:cochabamba"], [department], ancestors)).toBe(
				false
			)
			expect(territoryIsCovered("unresolved-place", [department], ancestors)).toBe(false)
		})
	})
	describe("synthetic operator evidence, not commercial authorization", () => {
		const acceptance = {
			version: 1 as const,
			alternatives: [
				{ id: "operator-authorization", allOf: [{ definitionVersionId: "synthetic-operator-v1" }] },
			],
		}
		const operatorDocument = {
			id: "synthetic-document",
			definitionVersionId: "synthetic-operator-v1",
			subjectId: "synthetic-provider",
		}
		it("recognizes only the complete package for the named operator", () => {
			expect(
				evaluateDocumentAcceptance(acceptance, ["synthetic-provider"], [operatorDocument]).satisfied
			).toBe(true)
		})
		it("rejects missing evidence, another operator and a different definition", () => {
			for (const documents of [
				[],
				[{ ...operatorDocument, subjectId: "another-provider" }],
				[{ ...operatorDocument, definitionVersionId: "synthetic-guide-v1" }],
			]) {
				expect(
					evaluateDocumentAcceptance(acceptance, ["synthetic-provider"], documents).satisfied
				).toBe(false)
			}
		})
		it("does not reuse the operator license as a guide credential", () => {
			const guideAcceptance = {
				version: 1 as const,
				alternatives: [
					{ id: "guide-credential", allOf: [{ definitionVersionId: "synthetic-guide-v1" }] },
				],
			}
			expect(
				evaluateDocumentAcceptance(guideAcceptance, ["synthetic-guide"], [operatorDocument])
					.satisfied
			).toBe(false)
		})
		it("requires a personal credential for every declared guide", () => {
			const guideAcceptance = {
				version: 1 as const,
				alternatives: [
					{ id: "guide-credential", allOf: [{ definitionVersionId: "synthetic-guide-v1" }] },
				],
			}
			const documents = ["synthetic-guide-one", "synthetic-guide-two"].map((subjectId) => ({
				id: `${subjectId}-credential`,
				subjectId,
				definitionVersionId: "synthetic-guide-v1",
			}))
			const subjects = documents.map((document) => document.subjectId)
			expect(evaluateDocumentAcceptance(guideAcceptance, subjects, documents).satisfied).toBe(true)
			expect(
				evaluateDocumentAcceptance(guideAcceptance, subjects, documents.slice(0, 1)).satisfied
			).toBe(false)
		})
		it("requires issuer, dates and scope without inventing a universal expiry", () => {
			const definition = documentDefinitionDraftSchema.parse(proposal.documentDefinitions[0])
			const input = {
				issuer: "Synthetic authority",
				issuedAt: new Date("2026-01-01"),
				subjectType: "legal_entity",
				scopeTypes: ["territory", "activity"],
			}
			expect(() => validateDocumentCapture(definition.capture, input)).not.toThrow()
			expect(() => validateDocumentCapture(definition.capture, { ...input, issuer: null })).toThrow(
				"document_issuer_required"
			)
			expect(() =>
				validateDocumentCapture(definition.capture, { ...input, issuedAt: null })
			).toThrow("document_issuedAt_required")
			expect(() =>
				validateDocumentCapture(definition.capture, { ...input, scopeTypes: ["activity"] })
			).toThrow("document_scope_required")
			expect(() =>
				validateDocumentCapture(definition.capture, { ...input, expiresAt: new Date("2025-01-01") })
			).toThrow("document_invalid_dates")
		})
	})
	it("resolves the fictitious entity classification without claiming real registration", () => {
		expect(proposal.scenario).toMatchObject({
			providerIsFictitious: true,
			purpose: "synthetic_validation_only",
			classificationIsAssumed: true,
			realCommercialEligibility: false,
		})
		expect(proposal.admission.legalFormCodes).toEqual([proposal.scenario.legalFormCode])
	})
	it("keeps every proposed family under explicit review with no write or approval command", () => {
		expect(proposal.loadPlan.mode).toBe("review_only")
		expect(proposal.loadPlan.databaseWritesAllowed).toBe(false)
		expect(proposal.pendingDecisions.length).toBeGreaterThan(0)
		expect(proposal.requirementPlan.map((item) => item.family).sort()).toEqual(
			[...proposal.admission.composition.requiredFamilies].sort()
		)
		const definitions = new Set(proposal.documentDefinitions.map((item) => item.key))
		for (const item of proposal.requirementPlan) {
			expect(item.reviewNeeded.length).toBeGreaterThan(0)
			if (item.definitionKey) expect(definitions.has(item.definitionKey)).toBe(true)
		}
	})
	it("requires explicit dates even after resolving the territory", () => {
		expect(proposal.activationAuthorized).toBe(false)
		expect(commercialPolicyDraftSchema.safeParse(proposal.admission).success).toBe(false)
		// The date validates shape only; resolving geography is not approval.
		expect(
			commercialPolicyDraftSchema.safeParse({
				...proposal.admission,
				jurisdictionCodes: [proposal.territoryPlaceId],
				effectiveFrom: "2026-11-07",
				effectiveTo: null,
			}).success
		).toBe(true)
	})
	it("keeps guide identity separate from the operator", () => {
		for (const definition of proposal.documentDefinitions)
			expect(documentDefinitionDraftSchema.safeParse(definition).success).toBe(true)
		const guide = documentDefinitionDraftSchema.parse(proposal.documentDefinitions[1])
		expect(() =>
			validateDocumentCapture(guide.capture, {
				issuer: "Synthetic authority",
				issuedAt: new Date("2026-01-01"),
				subjectType: "provider",
				scopeTypes: ["territory", "activity"],
			})
		).toThrow("document_subject_not_allowed")
	})
	it("never grants capabilities from the unsigned draft", () => {
		const version: CommercialPolicyVersion = {
			id: "synthetic-local-draft",
			country: "BO",
			vertical: "tour",
			holderType: "entidad",
			collectionModel: "property_collect",
			jurisdictionRole: "product",
			status: "draft",
			effectiveFrom: new Date("2026-01-01"),
			effectiveTo: null,
			approvedBy: null,
			approvedAt: null,
			approvalReference: null,
			context: {
				...proposal.admission,
				contextVersion: 3,
				composition: {
					...proposal.admission.composition,
					kind: "admission",
					family: "platform_standards",
					requiredFamilies: [
						"identity",
						"fiscal",
						"tourism",
						"regulated_place",
						"operational_resources",
						"platform_standards",
					],
				},
				jurisdictionCodes: [proposal.territoryPlaceId],
				experienceFormats: ["guided_tour"],
			},
			signatures: [],
			requirements: [],
		}
		const result = evaluateCommercialPolicy({
			context: {
				holderType: "entidad",
				holderCountry: "BO",
				taxCountry: "BO",
				payoutCountry: null,
				productCountry: "BO",
				vertical: "tour",
				collectionModel: "property_collect",
				operatingRole: "operator",
				activityClasses: ["urban_cultural"],
				experienceFormat: "guided_tour",
				jurisdictionCodes: [proposal.territoryPlaceId],
			},
			versions: [version],
			now: new Date("2026-11-07"),
		})
		expect(result.capabilities.publish).toBe(false)
		expect(result.capabilities.booking).toBe(false)
	})
})
