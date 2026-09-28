import {
	CommercialPolicyApproval,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	ProviderDocument,
	TourComplianceContext,
	User,
	db,
} from "@/shared/infrastructure/db/compat"
type Db = typeof db

const tourApprovalAreas = ["policy", "finance", "tour_operations"] as const

/** One approver per `(policyVersionId, approverUserId)`; certification uses dedicated signers. */
const tourApproverUserIds: Record<(typeof tourApprovalAreas)[number], string> = {
	policy: "user_marketplace_cert_approver_policy",
	finance: "user_marketplace_cert_approver_finance",
	tour_operations: "user_marketplace_cert_approver_tour_ops",
}

const tourContextJson = {
	operatingRoles: ["guide"],
	activityClasses: ["urban_cultural"],
	jurisdictionCodes: ["BO-LP"],
}

async function ensureTourApproverUsers(db: Db) {
	for (const area of tourApprovalAreas) {
		const id = tourApproverUserIds[area]
		await db
			.insert(User)
			.values({
				id,
				email: `${id}@fastt.local`,
				firstName: "Certificación",
				lastName: area,
			})
			.onConflictDoNothing()
	}
}

async function seedVerticalPolicies(params: {
	db: Db
	userId: string
	vertical: "hotel" | "tour"
	now: Date
}) {
	const roles = ["holder", "product", "tax"] as const
	for (const role of roles) {
		const setId = `cps_marketplace_cert_${params.vertical}_${role}`
		const versionId = `cpv_marketplace_cert_${params.vertical}_${role}_v1`
		await params.db
			.insert(CompliancePolicySet)
			.values({
				id: setId,
				key: `marketplace-cert-${params.vertical}-${role}`,
				label: `Certificación marketplace · ${params.vertical} · ${role}`,
				country: "BO",
				vertical: params.vertical,
				collectionModel: "property_collect",
				policyScope: "commercial",
				holderType: "entidad",
				jurisdictionRole: role,
				status: "active",
				createdAt: params.now,
				updatedAt: params.now,
			})
			.onConflictDoNothing()
		await params.db
			.insert(CompliancePolicyVersion)
			.values({
				id: versionId,
				policySetId: setId,
				version: 1,
				status: "published",
				effectiveFrom: new Date("2026-01-01T00:00:00Z"),
				approvedBy: params.userId,
				approvedAt: new Date("2026-01-01T00:00:00Z"),
				approvalReference: "marketplace-certification-fixture",
				contextJson: params.vertical === "tour" ? tourContextJson : null,
				createdAt: params.now,
			})
			.onConflictDoNothing()
		await params.db
			.insert(ComplianceRequirementRule)
			.values({
				id: `crr_marketplace_cert_${params.vertical}_${role}`,
				policyVersionId: versionId,
				domain: "documents",
				requirementKey: "certification_ready",
				required: true,
				capabilitiesJson: ["publish", "booking", "collect_payment", "payout", "integrations"],
				acceptedEvidenceJson: ["government_id"],
				blockingAction: "Fixture de certificación.",
				reviewOwner: "policies",
				sourceKind: "fastt_policy",
				sourceReference: "MARKETPLACE-CERT-1",
				sourceCheckedAt: params.now,
				conditionJson: { evidenceScope: "provider" },
				createdAt: params.now,
			})
			.onConflictDoNothing()
		if (params.vertical === "tour") {
			for (const area of tourApprovalAreas) {
				await params.db
					.insert(CommercialPolicyApproval)
					.values({
						id: `cpa_marketplace_cert_${params.vertical}_${role}_${area}`,
						policyVersionId: versionId,
						approvalArea: area,
						approverUserId: tourApproverUserIds[area],
						approvalReference: `cert-${area}`,
						approvedAt: new Date("2026-01-01T00:00:00Z"),
						createdAt: params.now,
					})
					.onConflictDoUpdate({
						target: [
							CommercialPolicyApproval.policyVersionId,
							CommercialPolicyApproval.approvalArea,
						],
						set: {
							approverUserId: tourApproverUserIds[area],
							approvalReference: `cert-${area}`,
							approvedAt: new Date("2026-01-01T00:00:00Z"),
						},
					})
			}
		}
	}
}

/** Commercial authorization for the marketplace certification provider must be explicit, not inferred. */
export async function seedMarketplaceCertificationCommercialPolicy(params: {
	db: Db
	providerId: string
	userId: string
	tourProductId: string
	now: Date
}) {
	await ensureTourApproverUsers(params.db)
	await seedVerticalPolicies({
		db: params.db,
		userId: params.userId,
		vertical: "hotel",
		now: params.now,
	})
	await seedVerticalPolicies({
		db: params.db,
		userId: params.userId,
		vertical: "tour",
		now: params.now,
	})
	await params.db
		.insert(ProviderDocument)
		.values({
			id: "document_marketplace_certification_government_id",
			providerId: params.providerId,
			type: "government_id",
			status: "verified",
			subjectType: "provider",
			createdAt: params.now,
			updatedAt: params.now,
		})
		.onConflictDoUpdate({
			target: ProviderDocument.id,
			set: { status: "verified", updatedAt: params.now },
		})
	await params.db
		.insert(TourComplianceContext)
		.values({
			productId: params.tourProductId,
			providerId: params.providerId,
			operatingRole: "guide",
			jurisdictionCode: "BO-LP",
			activityClassesJson: ["urban_cultural"],
			updatedAt: params.now,
		})
		.onConflictDoUpdate({
			target: TourComplianceContext.productId,
			set: {
				operatingRole: "guide",
				jurisdictionCode: "BO-LP",
				activityClassesJson: ["urban_cultural"],
				updatedAt: params.now,
			},
		})
}
