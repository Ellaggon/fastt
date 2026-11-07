import { spawnSync } from "node:child_process"
import { prepareIsolatedTestDatabase } from "../shared/infrastructure/db/data-environment"

const database = prepareIsolatedTestDatabase()
if (!database.configured)
	throw new Error("Multinational certification requires an isolated test database")
// Do not let .env.test fill an unrelated direct URL in the child process.
process.env.FASTT_TEST_DIRECT_URL = database.directUrl ?? database.runtimeUrl

const suites = [
	"tests/unit/commercial-policy-evaluate.test.ts",
	"tests/unit/commercial-policy-contract-parser.test.ts",
	"tests/unit/commercial-policy-migration-audit.test.ts",
	"tests/unit/compliance-migration-integrity.test.ts",
	"tests/unit/policy-composition.test.ts",
	"tests/unit/policy-evidence-alternatives.test.ts",
	"tests/unit/policy-evidence-presentation.test.ts",
	"tests/unit/commercial-read-scope.test.ts",
	"tests/postgres/compliance-migration-integrity.test.ts",
	"tests/postgres/multinational-compliance.test.ts",
	"tests/postgres/operating-geography.test.ts",
	"tests/postgres/document-definition.test.ts",
	"tests/postgres/policy-composition.test.ts",
	"tests/ui/compliance-document-archive.test.ts",
]
const result = spawnSync(
	process.execPath,
	["node_modules/vitest/vitest.mjs", "run", "--reporter=json", ...suites],
	{
		env: process.env,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	}
)
if (result.error) throw result.error
if (result.status !== 0) {
	process.stderr.write(result.stdout + result.stderr)
	process.exitCode = 1
} else {
	const report = JSON.parse(result.stdout)
	if (report.numPendingTests || report.numTodoTests || !report.numPassedTests)
		throw new Error("Incomplete certification: skipped, todo or missing tests")
	console.log(
		JSON.stringify(
			{
				certification: "multinational-compliance-technical",
				fingerprint: database.fingerprint,
				passedTests: report.numPassedTests,
				suites,
				syntheticSecondCountry: true,
				legalApproval: false,
				productionActivation: false,
				browserCertification: false,
			},
			null,
			2
		)
	)
}
