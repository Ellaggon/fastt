-- CAPA 6 governance: immutable audit trail for policy writes.
CREATE TABLE IF NOT EXISTS PolicyAuditLog (
  id TEXT PRIMARY KEY,
  eventType TEXT NOT NULL,
  actorUserId TEXT,
  policyId TEXT,
  policyGroupId TEXT,
  assignmentId TEXT,
  scope TEXT,
  scopeId TEXT,
  channel TEXT,
  beforeJson TEXT,
  afterJson TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policy_audit_event_createdAt
  ON PolicyAuditLog(eventType, createdAt);

CREATE INDEX IF NOT EXISTS idx_policy_audit_group
  ON PolicyAuditLog(policyGroupId);

CREATE INDEX IF NOT EXISTS idx_policy_audit_scope
  ON PolicyAuditLog(scope, scopeId);
