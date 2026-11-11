BEGIN;
LOCK TABLE "CommercialPolicyApproval" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CommercialPolicyApproval"
    GROUP BY "policyVersionId", "approverUserId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'rollback_requires_policy_approval_review';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialPolicyApproval_version_approver_unique"
  ON "CommercialPolicyApproval" ("policyVersionId", "approverUserId");
COMMIT;
