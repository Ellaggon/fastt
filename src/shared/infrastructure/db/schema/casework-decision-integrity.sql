-- Phase 3: prevent self-approval at the persistence boundary for CaseDecisionApproval.
CREATE OR REPLACE FUNCTION fastt_prevent_case_decision_self_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CaseDecision" decision
    WHERE decision."id" = NEW."decisionId"
      AND decision."proposedByUserId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION 'maker_checker_separation_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CaseDecisionApproval_prevent_self_approval" ON "CaseDecisionApproval";
CREATE TRIGGER "CaseDecisionApproval_prevent_self_approval"
BEFORE INSERT OR UPDATE ON "CaseDecisionApproval"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_case_decision_self_approval();
