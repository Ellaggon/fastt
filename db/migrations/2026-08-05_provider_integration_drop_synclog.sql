-- Phase 2: drop ProviderIntegrationSyncLog.
-- Canonical execution history is ProviderIntegrationSyncRun.
-- Config connect/update/revoke/refresh activity is ProviderAuditLog.
-- Simple-mode "Actividad reciente" now reads SyncRun + config Audit.

DROP TABLE IF EXISTS "ProviderIntegrationSyncLog";
