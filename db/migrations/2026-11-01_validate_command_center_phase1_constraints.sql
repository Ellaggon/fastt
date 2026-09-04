-- Phase 1 integrity gate: the production audit found no incompatible
-- ProviderComplianceAssignment rows, so make the existing checks fully trusted.
ALTER TABLE "ProviderComplianceAssignment"
	VALIDATE CONSTRAINT "ProviderComplianceAssignment_domain_check";

ALTER TABLE "ProviderComplianceAssignment"
	VALIDATE CONSTRAINT "ProviderComplianceAssignment_status_check";

ALTER TABLE "ProviderComplianceAssignment"
	VALIDATE CONSTRAINT "ProviderComplianceAssignment_sla_hours_check";
