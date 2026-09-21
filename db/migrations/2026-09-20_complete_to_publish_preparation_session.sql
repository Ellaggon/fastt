ALTER TABLE "ProviderPreparationSession" DROP CONSTRAINT IF EXISTS "ProviderPreparationSession_playbook_check";
ALTER TABLE "ProviderPreparationSession"
	ADD CONSTRAINT "ProviderPreparationSession_playbook_check"
	CHECK ("playbookId" IN ('launch', 'launch-tour', 'complete-to-publish'));
