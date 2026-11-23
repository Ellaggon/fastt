import { expect, it } from "vitest"
import { documentCertificationWorkspaceEnabled } from "@/lib/documents/certification-workspace"

const env = {
	FASTT_DOCUMENT_CERTIFICATION_WORKSPACE: "true",
	FASTT_DATA_ENV: "test",
	NODE_ENV: "development",
	LOCAL_QA_AUTH_ENABLED: "true",
	LOCAL_QA_PROVIDER_ID: "document-workspace-certification-synthetic",
	FASTT_TEST_DATABASE_URL: "postgresql://certifier@127.0.0.1:55439/fastt_document_certification",
}
const url = new URL("http://127.0.0.1:4333/provider/document-certification")
it("opens the fixture surface only on the named local test process", () =>
	expect(documentCertificationWorkspaceEnabled(env, url)).toBe(true))
it.each([
	{ FASTT_DOCUMENT_CERTIFICATION_WORKSPACE: "false" },
	{ FASTT_DATA_ENV: "development" },
	{ NODE_ENV: "production" },
	{ VERCEL: "1" },
	{ LOCAL_QA_AUTH_ENABLED: "false" },
	{ LOCAL_QA_PROVIDER_ID: "real-provider" },
	{ FASTT_TEST_DATABASE_URL: "postgresql://certifier@remote.example/fastt_document_certification" },
])("fails closed outside the isolated workspace: %j", (change) =>
	expect(documentCertificationWorkspaceEnabled({ ...env, ...change }, url)).toBe(false)
)
it.each(["http://127.0.0.1:4321/", "http://localhost:4333/", "https://example.com/"])(
	"does not expose the fixture page at %s",
	(target) => expect(documentCertificationWorkspaceEnabled(env, new URL(target))).toBe(false)
)
