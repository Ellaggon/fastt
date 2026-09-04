-- Deterministic Phase 2 policy seed for Bolivia accommodation intermediary/PSP.
-- Included in fresh installs via db:pg:generate-initial and in upgrades via the
-- Phase 2 additive migration. Keep both copies identical and idempotent.
INSERT INTO "CompliancePolicySet" ("id","key","label","country","vertical","collectionModel","status") VALUES
	('cps_bo_accommodation_intermediary_v1','bo-accommodation-intermediary','FASTT Bolivia · alojamientos · intermediario','BO','accommodation','intermediary','active')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "CompliancePolicyVersion" ("id","policySetId","version","status","effectiveFrom","approvedAt") VALUES
	('cpv_bo_accommodation_intermediary_v1','cps_bo_accommodation_intermediary_v1',1,'published','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
ON CONFLICT ("policySetId","version") DO NOTHING;

INSERT INTO "ComplianceRequirementRule" ("id","policyVersionId","domain","requirementKey","slaHours") VALUES
	('crr_v1_identity','cpv_bo_accommodation_intermediary_v1','verification','identity_and_business_review',24),
	('crr_v1_tax','cpv_bo_accommodation_intermediary_v1','fiscal','tax_identity_review',48),
	('crr_v1_document','cpv_bo_accommodation_intermediary_v1','documents','evidence_document_review',48),
	('crr_v1_payout','cpv_bo_accommodation_intermediary_v1','payments','payout_account_review',24)
ON CONFLICT ("policyVersionId","requirementKey") DO NOTHING;

INSERT INTO "ComplianceDecisionReason" ("id","policyVersionId","code","domain","decision","label","requiresComment") VALUES
	('cdr_v1_approved','cpv_bo_accommodation_intermediary_v1','requirements_satisfied',NULL,'approved','Requisitos satisfechos',false),
	('cdr_v1_missing','cpv_bo_accommodation_intermediary_v1','evidence_missing',NULL,'request_information','Evidencia faltante',true),
	('cdr_v1_mismatch','cpv_bo_accommodation_intermediary_v1','information_mismatch',NULL,'requires_attention','Información inconsistente',true),
	('cdr_v1_rejected','cpv_bo_accommodation_intermediary_v1','requirements_not_satisfied',NULL,'rejected','Requisitos no satisfechos',true)
ON CONFLICT ("policyVersionId","code") DO NOTHING;
