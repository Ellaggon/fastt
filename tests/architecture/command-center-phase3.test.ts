import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("command center phase 3 operational UI", () => {
	it("persists decisions, approvals, activity and private saved views", () => {
		const migration = read("db/migrations/2026-11-03_command_center_phase3_ui_foundations.sql")
		for (const table of [
			"CaseDecision",
			"CaseDecisionApproval",
			"CaseActivityEvent",
			"SavedCaseView",
		])
			expect(migration).toContain(`\"${table}\"`)
		expect(migration).toContain("maker_checker_separation_required")
		expect(migration).toContain("CaseDecision_case_version_active_unique")
	})

	it("uses compare-and-swap for mutable casework commands", () => {
		const commands = read("src/modules/casework/application/commands/case-commands.ts")
		expect(commands).toContain("eq(ComplianceCase.version, input.expectedVersion)")
		expect(commands).toContain("case_version_conflict")
		expect(commands).toContain("CaseActivityEvent")
		expect(commands).toContain("DomainEventOutbox")
	})

	it("keeps command-center rollout flags env-only", () => {
		const flags = read("src/config/featureFlags.ts")
		for (const flag of [
			"COMMAND_CENTER_V2_READ_ENABLED",
			"COMMAND_CENTER_V2_COMMANDS_ENABLED",
			"COMMAND_CENTER_LEGACY_WRITE_ENABLED",
		]) {
			expect(flags).toContain(flag)
			expect(flags).toMatch(new RegExp(`ENV_ONLY_FEATURE_FLAGS[\\s\\S]*\"${flag}\"`))
		}
	})

	it("ships the case-first route map and read APIs", () => {
		for (const path of [
			"src/pages/admin/index.astro",
			"src/pages/admin/work/index.astro",
			"src/pages/admin/queues/[queueId].astro",
			"src/pages/admin/cases/index.astro",
			"src/pages/admin/cases/[caseId]/index.astro",
			"src/pages/admin/providers/[providerId]/index.astro",
			"src/pages/api/admin/v1/command-center/summary.ts",
			"src/pages/api/admin/v1/queues/[queueId].ts",
			"src/pages/api/admin/v1/cases/[caseId]/index.ts",
		])
			expect(read(path).length).toBeGreaterThan(50)
	})

	it("provides cursor pagination and parameterized safe search", () => {
		const queries = read("src/modules/casework/application/queries/command-center.ts")
		expect(queries).toContain("base64url")
		expect(queries).toContain("escapeLike")
		expect(queries).toContain("LIKE ${pattern}")
		expect(queries).toContain(".limit(limit + 1)")
	})

	it("implements exact second-control queues and reusable saved views", () => {
		const queries = read("src/modules/casework/application/queries/command-center.ts")
		const commands = read("src/modules/casework/application/commands/case-commands.ts")
		expect(queries).toContain("pendingSecondControlForUserId")
		expect(queries).toContain('decision."proposedByUserId" <>')
		expect(commands).toContain("rejectCaseDecisionApproval")
		expect(read("src/pages/api/admin/v1/views/index.ts")).toContain("listSavedCaseViews")
		expect(read("src/pages/api/admin/v1/decisions/[decisionId]/reject.ts")).toContain(
			"requireRecentInternalAuthentication"
		)
	})

	it("keeps legacy visible as an explicit rollback path", () => {
		const legacy = read("src/pages/admin/providers.astro")
		const shell = read("src/layouts/InternalAdminLayout.astro")
		expect(legacy).toContain("Página legacy")
		expect(legacy).toContain("/admin/queues/all")
		expect(shell).toContain(">Legacy<")
	})

	it("includes keyboard navigation and accessible command feedback", () => {
		const shell = read("src/layouts/InternalAdminLayout.astro")
		const workspace = read("src/pages/admin/cases/[caseId]/index.astro")
		const table = read("src/components/admin/cases/CaseTable.astro")
		expect(shell).toContain("Saltar al contenido")
		expect(shell).toContain('aria-current={isActive(link) ? "page" : undefined}')
		expect(workspace).toContain('aria-live="polite"')
		expect(workspace).toContain("reauthentication_required")
		expect(table).toContain('<caption class="sr-only">')
		expect(table).toContain('scope="col"')
	})

	it("extracts case evidence without server-rendering raw document or payout secrets", () => {
		const evidence = read("src/modules/casework/application/queries/case-evidence.ts")
		const panel = read("src/components/admin/cases/CaseEvidencePanel.astro")
		const reveal = read("src/pages/api/admin/v1/cases/[caseId]/evidence/reveal.ts")
		const workspace = read("src/pages/admin/cases/[caseId]/index.astro")
		const decisionCommand = read("src/pages/api/admin/v1/cases/[caseId]/propose-decision.ts")
		expect(evidence).toContain("listProviderPaymentAccounts")
		expect(evidence).not.toContain("listPendingProviderPaymentAccountsForAdmin")
		expect(read("src/lib/provider-payment-accounts.ts")).toContain("case-bound reveal endpoint")
		expect(evidence).toContain("factKeys")
		expect(panel).toContain("Investigación de evidencia")
		expect(panel).toContain("data-evidence-reveal")
		expect(panel).toContain("Preparar solicitud de evidencia")
		expect(evidence).toContain("inspectProviderDocumentPreview")
		expect(evidence).toContain("assessHolderNameMatch")
		expect(evidence).not.toContain("namesCorroborate")
		expect(evidence).toContain("Abrir documento de forma segura")
		expect(evidence).toContain("approvalBlockers")
		expect(reveal).toContain('requireInternalPermission(request, "sensitive_data.reveal"')
		expect(reveal).toContain("requireRecentInternalAuthentication")
		expect(reveal).toContain("writeSensitiveDataAccessEvent")
		expect(reveal).toContain('"Cache-Control": "no-store, private"')
		expect(workspace).toContain("evidenceRevision")
		expect(workspace).toContain("CaseEvidencePanel")
		expect(decisionCommand).toContain("approval_evidence_incomplete")
		expect(decisionCommand).toContain("approval_evidence_review_comment_required")
	})
})
