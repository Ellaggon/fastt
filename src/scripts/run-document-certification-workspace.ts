import { randomBytes, randomUUID } from "node:crypto"
import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import {
	databaseFingerprint,
	prepareIsolatedTestDatabase,
} from "@/shared/infrastructure/db/data-environment"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import { makeMixedPdf } from "../../services/document-analysis/fixtures/mixed-pdf.mjs"

if (
	!process.argv.includes("--development") ||
	process.env.VERCEL ||
	process.env.NODE_ENV === "production"
)
	throw new Error("local_certification_only")
const storage = documentStorageConfig()
if (!storage?.bucket.endsWith("-development"))
	throw new Error("development_document_bucket_required")
function container(name: string) {
	const [value] = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))
	if (!value?.State.Running) throw new Error("certification_container_not_running")
	return {
		...value,
		env: Object.fromEntries(
			value.Config.Env.map((entry: string) => {
				const i = entry.indexOf("=")
				return [entry.slice(0, i), entry.slice(i + 1)]
			})
		),
	}
}
const postgres = container("fastt-document-certification-postgres")
const gateway = container("fastt-r2-analysis-beta")
const binding = postgres.NetworkSettings.Ports["5432/tcp"]
if (
	postgres.env.POSTGRES_DB !== "fastt_document_certification" ||
	!binding?.some(
		(p: { HostIp: string; HostPort: string }) => p.HostIp === "127.0.0.1" && p.HostPort === "55439"
	)
)
	throw new Error("isolated_postgres_binding_required")
const database = new URL("postgresql://127.0.0.1:55439/fastt_document_certification")
database.username = postgres.env.POSTGRES_USER
database.password = postgres.env.POSTGRES_PASSWORD ?? ""
const runtimeUrl = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL
if (!runtimeUrl) throw new Error("operational_fingerprint_required")
const suffix = randomUUID(),
	providerId = `document-workspace-certification-${suffix}`,
	userId = `document-workspace-owner-${suffix}`,
	email = `${userId}@fastt.test`
const origin = "http://127.0.0.1:4333"
await new Promise<void>((done, reject) => {
	const probe = createServer()
	probe.once("error", reject)
	probe.listen(4333, "127.0.0.1", () => probe.close((error) => (error ? reject(error) : done())))
})
const astroPackage = createRequire(import.meta.url).resolve("astro/package.json")
const astroCli = resolve(
	dirname(astroPackage),
	JSON.parse(await readFile(astroPackage, "utf8")).bin.astro
)
const workerToken = randomBytes(32).toString("hex")
Object.assign(process.env, {
	FASTT_DATA_ENV: "test",
	NODE_ENV: "development",
	FASTT_TEST_DATABASE_URL: database.href,
	FASTT_TEST_DIRECT_URL: database.href,
	FASTT_TEST_DATABASE_FINGERPRINT: databaseFingerprint(database.href),
	FASTT_PRODUCTION_DATABASE_FINGERPRINTS: databaseFingerprint(runtimeUrl),
	FASTT_DOCUMENT_CERTIFICATION_WORKSPACE: "true",
	FASTT_DOCUMENT_PIPELINE_ENABLED: "true",
	DOCUMENT_ANALYSIS_GATEWAY_URL: "http://127.0.0.1:4329/v1/documents/analyze",
	DOCUMENT_ANALYSIS_GATEWAY_TOKEN: gateway.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN,
	DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT: "true",
	FASTT_CERTIFY_LOCAL_GATEWAY: "1",
	DOCUMENT_PROCESSING_APP_ORIGIN: origin,
	DOCUMENT_PROCESSING_WORKER_TOKEN: workerToken,
	DOCUMENT_PROCESSING_LOCAL_CERTIFICATION: "true",
	LOCAL_QA_AUTH_ENABLED: "true",
	LOCAL_QA_AUTH_USER_ID: userId,
	LOCAL_QA_AUTH_EMAIL: email,
	LOCAL_QA_PROVIDER_ID: providerId,
	LOCAL_QA_PROVIDER_ROLE: "owner",
	REDIS_URL: "",
	REDIS_TOKEN: "",
	UPSTASH_REDIS_REST_URL: "",
	UPSTASH_REDIS_REST_TOKEN: "",
	SUPABASE_URL: "",
	SUPABASE_ANON_KEY: "",
	RESEND_API_KEY: "",
})
for (const key of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_DB_POOLER_URL", "SUPABASE_DB_URL"])
	delete process.env[key]
prepareIsolatedTestDatabase()
const readiness = await fetch("http://127.0.0.1:4329/readyz", { signal: AbortSignal.timeout(5000) })
if (!readiness.ok) throw new Error("certified_gateway_not_ready")
const { db, eq, Provider, User, ProviderUser, ProviderHolderProfile, ProviderDocument } =
	await import("@/shared/infrastructure/db/compat")
const { withPostgresTransaction, closePostgresClients } =
	await import("@/shared/infrastructure/db/client")
const { createDocumentDefinitionDraft, transitionDocumentDefinition } =
	await import("@/lib/documents/document-definitions")
const { territorialRedesignDefinitions } =
	await import("@/lib/commercial-policy/territorial-redesign")
const fixture = await withPostgresTransaction(async () => {
	await db.insert(User).values({ id: userId, email })
	await db.insert(Provider).values({
		id: providerId,
		legalName: "Proveedor sintético de certificación",
		displayName: "Proveedor sintético de certificación",
		status: "inactive",
		dataClassification: "fixture",
		accountPurpose: "integration_certification",
	})
	await db.insert(ProviderUser).values({ id: randomUUID(), providerId, userId, role: "owner" })
	await db.insert(ProviderHolderProfile).values({
		providerId,
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: "BO",
		collectionModel: "property_collect",
	})
	const definition = await createDocumentDefinitionDraft(
		territorialRedesignDefinitions().find((d) => d.key === "bo.holder.personal_identity")
	)
	await transitionDocumentDefinition(definition.id, "publish")
	return definition.id
})
process.env.LOCAL_QA_DOCUMENT_DEFINITION_ID = fixture
const directory = await mkdtemp(join(tmpdir(), "fastt-document-workspace-"))
const bytes = makeMixedPdf(),
	integrity = documentIntegrity(bytes, "application/pdf")
const pdf = join(directory, "synthetic-identity.pdf")
await writeFile(pdf, bytes, { mode: 0o600 })
let app: ChildProcess | undefined, worker: ChildProcess | undefined
let stopping = false
let stop!: () => void
const stopped = new Promise<void>((resolve) => {
	stop = resolve
})
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop)
async function terminate(child: ChildProcess | undefined) {
	if (!child || child.exitCode !== null) return
	child.kill("SIGTERM")
	await Promise.race([
		new Promise<void>((resolve) => child.once("exit", () => resolve())),
		delay(10000),
	])
	if (child.exitCode === null) child.kill("SIGKILL")
}
try {
	app = spawn(process.execPath, [astroCli, "dev", "--host", "127.0.0.1", "--port", "4333"], {
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	})
	app.stdout?.on("data", (chunk) => process.stdout.write(chunk))
	app.stderr?.on("data", (chunk) => process.stderr.write(chunk))
	app.once("exit", () => {
		if (!stopping) stop()
	})
	let ready = false
	for (let attempt = 0; attempt < 60 && !ready; attempt++) {
		if (app.exitCode !== null) throw new Error("isolated_app_stopped")
		try {
			ready =
				(
					await fetch(`${origin}/api/cron/document-processing`, {
						signal: AbortSignal.timeout(2000),
					})
				).status === 401
		} catch {}
		if (!ready) await delay(1000)
	}
	if (!ready) throw new Error("isolated_app_not_ready")
	worker = spawn(process.execPath, ["services/document-dispatcher/dispatcher.mjs"], {
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	})
	worker.stdout?.on("data", (chunk) => process.stdout.write(chunk))
	worker.stderr?.on("data", (chunk) => process.stderr.write(chunk))
	worker.once("exit", () => {
		if (!stopping) stop()
	})
	console.log(
		JSON.stringify({
			event: "document_certification_workspace_ready",
			url: `${origin}/provider/document-certification`,
			syntheticPdf: pdf,
			fixtureProvider: providerId,
			definitionId: fixture,
			qaSession: true,
			isolatedDatabase: true,
			sharedPortalChanged: false,
		})
	)
	await stopped
} finally {
	stopping = true
	await terminate(worker)
	await terminate(app)
	const { getDocumentR2Client } = await import("@/container/shared.container")
	const { HeadObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3")
	const { parseProviderDocumentObjectKey } = await import("@/lib/provider-document-storage")
	const documents = await db
		.select()
		.from(ProviderDocument)
		.where(eq(ProviderDocument.providerId, providerId))
	let removed = 0
	for (const doc of documents) {
		const key = parseProviderDocumentObjectKey(doc.fileUrl)
		const recorded = doc.metadataJson as { integrity?: { sha256?: string } } | null
		if (
			!key?.startsWith(`provider-documents/${providerId}/`) ||
			recorded?.integrity?.sha256 !== integrity.sha256
		)
			continue
		const head = await getDocumentR2Client()
			.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }))
			.catch((error) => {
				if (error.$metadata?.httpStatusCode === 404) return null
				throw error
			})
		if (head?.Metadata?.sha256 === integrity.sha256) {
			await getDocumentR2Client().send(
				new DeleteObjectCommand({ Bucket: storage.bucket, Key: key })
			)
			removed++
		}
	}
	await db.update(Provider).set({ status: "archived" }).where(eq(Provider.id, providerId))
	await rm(directory, { recursive: true, force: true })
	await closePostgresClients()
	console.log(
		JSON.stringify({
			event: "document_certification_workspace_stopped",
			syntheticObjectsRemoved: removed,
			fixtureArchived: true,
			sharedPortalChanged: false,
		})
	)
}
