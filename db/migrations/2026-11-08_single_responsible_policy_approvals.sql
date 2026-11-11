-- One responsible person may review all three areas; each area remains unique.
ALTER TABLE "CommercialPolicyApproval"
  DROP CONSTRAINT IF EXISTS "CommercialPolicyApproval_version_approver_unique";
DROP INDEX IF EXISTS "CommercialPolicyApproval_version_approver_unique";
