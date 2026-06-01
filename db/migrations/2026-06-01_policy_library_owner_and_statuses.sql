-- Fase 5: separate policy library ownership from policy assignment.
-- Draft/template policies may be unassigned, so ownership must live on PolicyGroup.

ALTER TABLE "PolicyGroup"
	ADD COLUMN IF NOT EXISTS "ownerProviderId" TEXT;

-- Existing rows keep backward-compatible ownership through PolicyAssignment scope ownership.
-- New CAPA 6 library rows should set ownerProviderId at group creation time.
