CREATE OR REPLACE FUNCTION fastt_guard_signed_policy_validity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."effectiveFrom", NEW."effectiveTo", NEW."policySetId") IS DISTINCT FROM (OLD."effectiveFrom", OLD."effectiveTo", OLD."policySetId")
    AND EXISTS (SELECT 1 FROM "CompliancePolicySet" s WHERE s.id = OLD."policySetId" AND s."policyScope" = 'commercial')
    AND (OLD.status IN ('published','retired') OR EXISTS (SELECT 1 FROM "CommercialPolicyApproval" a WHERE a."policyVersionId" = OLD.id)) THEN
    RAISE EXCEPTION 'signed_policy_validity_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_signed_policy_validity ON "CompliancePolicyVersion";
CREATE TRIGGER trg_signed_policy_validity BEFORE UPDATE OF "effectiveFrom", "effectiveTo", "policySetId" ON "CompliancePolicyVersion" FOR EACH ROW EXECUTE FUNCTION fastt_guard_signed_policy_validity();
