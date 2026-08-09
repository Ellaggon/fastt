import {
	and,
	db,
	eq,
	inArray,
	Provider,
	ProviderIntegrationCertification,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncRun,
	ProviderUser,
	desc,
} from "@/shared/infrastructure/db/compat"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { writeProviderAuditLog } from "@/lib/provider-audit"

export const providerAccountPurposes = [
	"commercial",
	"internal_qa",
	"integration_certification",
] as const

export type ProviderAccountPurpose = (typeof providerAccountPurposes)[number]

export const providerIntegrationCertificationActiveStatuses = [
	"prepared",
	"ready",
	"running",
	"requires_attention",
] as const

export type ProviderIntegrationCertificationStatus =
	| "draft"
	| (typeof providerIntegrationCertificationActiveStatuses)[number]
	| "completed"
	| "expired"
	| "revoked"

export const providerIntegrationCertificationScenarioKeys = [
	"access",
	"mapping",
	"full_sync",
	"single_rate",
	"multiple_rates",
	"range_rates",
	"min_stay",
	"stop_sell",
	"arrival_departure",
	"availability",
	"booking_crs",
] as const

export type ProviderIntegrationCertificationScenarioKey =
	(typeof providerIntegrationCertificationScenarioKeys)[number]

export type ProviderIntegrationCertificationScenarioEvidence = {
	taskId: string | null
	screenshotReference: string | null
	note: string | null
	recordedAt: string
	recordedBy: string
}

export type ProviderIntegrationPreflightContext =
	| { kind: "commercial" }
	| {
			kind: "certification"
			certificationId: string
			fixtureProductId: string
			expectedStructure: { roomTypes: number; ratePlans: number } | null
			suiteVersion: string | null
			fixtureVersion: string | null
	  }

export function normalizeProviderAccountPurpose(value: unknown): ProviderAccountPurpose {
	const raw = String(value ?? "commercial").trim()
	return (providerAccountPurposes as readonly string[]).includes(raw)
		? (raw as ProviderAccountPurpose)
		: "commercial"
}

/**
 * Production is never a valid remote target for a deliberately non-commercial
 * certification tenant. This is independent from NODE_ENV and UI state.
 */
export function assertProviderIntegrationEnvironmentAllowed(params: {
	accountPurpose: ProviderAccountPurpose
	mode: "sandbox" | "production"
}) {
	if (params.accountPurpose === "integration_certification" && params.mode === "production") {
		throw new Error("CERTIFICATION_PROVIDER_PRODUCTION_FORBIDDEN")
	}
}

export async function getProviderAccountPurpose(
	providerId: string
): Promise<ProviderAccountPurpose> {
	const provider = await db
		.select({ accountPurpose: Provider.accountPurpose })
		.from(Provider)
		.where(eq(Provider.id, providerId))
		.then((rows) => rows[0] ?? null)
	if (!provider) throw new Error("PROVIDER_NOT_FOUND")
	return normalizeProviderAccountPurpose(provider.accountPurpose)
}

export async function assertProviderIntegrationModeAllowed(params: {
	providerId: string
	mode: "sandbox" | "production"
}) {
	const accountPurpose = await getProviderAccountPurpose(params.providerId)
	assertProviderIntegrationEnvironmentAllowed({ accountPurpose, mode: params.mode })
	return { accountPurpose }
}

/**
 * Validates the immutable relationship recorded as certification evidence on a run.
 * Workers call this without a user context; the interactive entry point below adds
 * the explicit human permission check before it schedules any work.
 */
export async function assertProviderIntegrationCertificationRunLink(params: {
	providerId: string
	connectionId: string
	certificationId: string
}) {
	const accountPurpose = await getProviderAccountPurpose(params.providerId)
	if (accountPurpose !== "integration_certification") {
		throw new Error("CERTIFICATION_PROVIDER_REQUIRED")
	}

	const [connection, certification] = await Promise.all([
		db
			.select({
				id: ProviderIntegrationConnection.id,
				mode: ProviderIntegrationConnection.mode,
				vendorKey: ProviderIntegrationConnection.vendorKey,
				externalPropertyId: ProviderIntegrationConnection.externalPropertyId,
			})
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.id, params.connectionId),
					eq(ProviderIntegrationConnection.providerId, params.providerId)
				)
			)
			.then((rows) => rows[0] ?? null),
		db
			.select()
			.from(ProviderIntegrationCertification)
			.where(
				and(
					eq(ProviderIntegrationCertification.id, params.certificationId),
					eq(ProviderIntegrationCertification.providerId, params.providerId),
					eq(ProviderIntegrationCertification.connectionId, params.connectionId),
					inArray(
						ProviderIntegrationCertification.status,
						providerIntegrationCertificationActiveStatuses
					)
				)
			)
			.then((rows) => rows[0] ?? null),
	])

	if (!connection) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	if (String(connection.mode) !== "sandbox") {
		throw new Error("CERTIFICATION_SANDBOX_CONNECTION_REQUIRED")
	}
	if (!certification) throw new Error("INTEGRATION_CERTIFICATION_NOT_ACTIVE")
	if (String(connection.vendorKey ?? "") !== certification.vendorKey) {
		throw new Error("CERTIFICATION_VENDOR_MISMATCH")
	}
	if (certification.expiresAt && certification.expiresAt.getTime() <= Date.now()) {
		throw new Error("INTEGRATION_CERTIFICATION_EXPIRED")
	}

	return { accountPurpose, certification, connection }
}

function expectedCertificationStructure(value: unknown): {
	roomTypes: number
	ratePlans: number
} | null {
	if (!value || typeof value !== "object") return null
	const data = (value as Record<string, unknown>).data
	if (!data || typeof data !== "object") return null
	const roomTypes = Number((data as Record<string, unknown>).rooms)
	const ratePlans = Number((data as Record<string, unknown>).ratePlans)
	if (!Number.isInteger(roomTypes) || roomTypes < 1) return null
	if (!Number.isInteger(ratePlans) || ratePlans < 1) return null
	return { roomTypes, ratePlans }
}

function certificationFixtureVersion(value: unknown): string | null {
	if (!value || typeof value !== "object") return null
	const raw = String((value as Record<string, unknown>).fixtureVersion ?? "").trim()
	return raw || null
}

/**
 * Resolves preflight scope from persisted governance, never from a URL mode or
 * client-provided product id. A certification provider has exactly the fixture
 * bound to its active certification session in scope.
 */
export async function resolveProviderIntegrationPreflightContext(params: {
	providerId: string
	connectionId: string
	certificationId?: string | null
}): Promise<ProviderIntegrationPreflightContext> {
	const accountPurpose = await getProviderAccountPurpose(params.providerId)
	if (accountPurpose !== "integration_certification") return { kind: "commercial" }

	const requestedId = String(params.certificationId ?? "").trim()
	const certificationId = requestedId
		? requestedId
		: await db
				.select({ id: ProviderIntegrationCertification.id })
				.from(ProviderIntegrationCertification)
				.where(
					and(
						eq(ProviderIntegrationCertification.providerId, params.providerId),
						eq(ProviderIntegrationCertification.connectionId, params.connectionId),
						inArray(
							ProviderIntegrationCertification.status,
							providerIntegrationCertificationActiveStatuses
						)
					)
				)
				.orderBy(ProviderIntegrationCertification.updatedAt)
				.then((rows) => {
					if (rows.length !== 1) throw new Error("INTEGRATION_CERTIFICATION_ID_REQUIRED")
					return String(rows[0].id)
				})
	const { certification } = await assertProviderIntegrationCertificationRunLink({
		providerId: params.providerId,
		connectionId: params.connectionId,
		certificationId,
	})
	const fixtureProductId = String(certification.fixtureProductId ?? "").trim()
	if (!fixtureProductId) throw new Error("CERTIFICATION_FIXTURE_PRODUCT_REQUIRED")
	return {
		kind: "certification",
		certificationId,
		fixtureProductId,
		expectedStructure: expectedCertificationStructure(certification.evidenceManifestJson),
		suiteVersion: String(certification.suiteVersion ?? "").trim() || null,
		fixtureVersion: certificationFixtureVersion(certification.evidenceManifestJson),
	}
}

/**
 * Resolves the narrow authorization boundary for a real PMS certification run.
 * Callers must invoke this when Phase 2 starts creating sessions and jobs.
 */
export async function assertProviderIntegrationCertificationExecution(params: {
	providerId: string
	connectionId: string
	certificationId: string
	userId: string
}) {
	const [link, membership] = await Promise.all([
		assertProviderIntegrationCertificationRunLink(params),
		db
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(
				and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, params.userId))
			)
			.then((rows) => rows[0] ?? null),
	])

	const permissions = resolveProviderPermissions({
		role: membership?.role,
		permissionsJson: membership?.permissionsJson,
	})
	if (!permissions.canManageIntegrations || !permissions.canRunIntegrationCertification) {
		throw new Error("INTEGRATION_CERTIFICATION_PERMISSION_DENIED")
	}
	return { ...link, permissions }
}

function certificationManifest(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? { ...(value as Record<string, unknown>) }
		: {}
}

export function readProviderIntegrationCertificationEvidence(
	value: unknown
): Partial<
	Record<
		ProviderIntegrationCertificationScenarioKey,
		ProviderIntegrationCertificationScenarioEvidence
	>
> {
	const raw = certificationManifest(value).scenarioEvidence
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
	const result: Partial<
		Record<
			ProviderIntegrationCertificationScenarioKey,
			ProviderIntegrationCertificationScenarioEvidence
		>
	> = {}
	for (const key of providerIntegrationCertificationScenarioKeys) {
		const row = (raw as Record<string, unknown>)[key]
		if (!row || typeof row !== "object" || Array.isArray(row)) continue
		const record = row as Record<string, unknown>
		const recordedAt = String(record.recordedAt ?? "").trim()
		const recordedBy = String(record.recordedBy ?? "").trim()
		if (!recordedAt || !recordedBy) continue
		result[key] = {
			taskId: String(record.taskId ?? "").trim() || null,
			screenshotReference: String(record.screenshotReference ?? "").trim() || null,
			note: String(record.note ?? "").trim() || null,
			recordedAt,
			recordedBy,
		}
	}
	return result
}

export async function getProviderIntegrationCertificationEvidencePackage(params: {
	providerId: string
	connectionId: string
	certificationId: string
}) {
	const { certification, connection } = await assertProviderIntegrationCertificationRunLink(params)
	const runs = await db
		.select({
			id: ProviderIntegrationSyncRun.id,
			operation: ProviderIntegrationSyncRun.operation,
			status: ProviderIntegrationSyncRun.status,
			summaryJson: ProviderIntegrationSyncRun.summaryJson,
			errorMessage: ProviderIntegrationSyncRun.errorMessage,
			startedAt: ProviderIntegrationSyncRun.startedAt,
			finishedAt: ProviderIntegrationSyncRun.finishedAt,
		})
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.providerId, params.providerId),
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
				eq(ProviderIntegrationSyncRun.certificationId, params.certificationId)
			)
		)
		.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
		.limit(50)
	return {
		generatedAt: new Date().toISOString(),
		certification: {
			id: certification.id,
			vendorKey: certification.vendorKey,
			status: certification.status,
			suiteVersion: certification.suiteVersion,
			fixtureProductId: certification.fixtureProductId,
			expiresAt: certification.expiresAt?.toISOString() ?? null,
		},
		connection: {
			id: connection.id,
			vendorKey: connection.vendorKey,
			mode: connection.mode,
			externalPropertyId: connection.externalPropertyId,
		},
		scenarioEvidence: readProviderIntegrationCertificationEvidence(
			certification.evidenceManifestJson
		),
		runs,
	}
}

export async function recordProviderIntegrationCertificationScenarioEvidence(params: {
	providerId: string
	connectionId: string
	certificationId: string
	userId: string
	scenario: ProviderIntegrationCertificationScenarioKey
	taskId?: string | null
	screenshotReference?: string | null
	note?: string | null
}) {
	if (
		!(providerIntegrationCertificationScenarioKeys as readonly string[]).includes(params.scenario)
	) {
		throw new Error("INTEGRATION_CERTIFICATION_SCENARIO_INVALID")
	}
	const authorization = await assertProviderIntegrationCertificationExecution(params)
	const taskId =
		String(params.taskId ?? "")
			.trim()
			.slice(0, 200) || null
	const screenshotReference =
		String(params.screenshotReference ?? "")
			.trim()
			.slice(0, 500) || null
	const note =
		String(params.note ?? "")
			.trim()
			.slice(0, 1_000) || null
	if (!taskId && !screenshotReference && !note) {
		throw new Error("INTEGRATION_CERTIFICATION_EVIDENCE_REQUIRED")
	}
	const now = new Date().toISOString()
	const before = certificationManifest(authorization.certification.evidenceManifestJson)
	const existing = readProviderIntegrationCertificationEvidence(before)
	const evidence = {
		...existing,
		[params.scenario]: {
			taskId,
			screenshotReference,
			note,
			recordedAt: now,
			recordedBy: params.userId,
		},
	}
	const after = { ...before, scenarioEvidence: evidence }
	await db
		.update(ProviderIntegrationCertification)
		.set({ evidenceManifestJson: after, updatedAt: new Date() })
		.where(eq(ProviderIntegrationCertification.id, params.certificationId))
	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.userId,
		action: "provider.integration.certification.evidence_recorded",
		entityType: "ProviderIntegrationCertification",
		entityId: params.certificationId,
		beforeJson: { scenario: params.scenario, evidence: existing[params.scenario] ?? null },
		afterJson: { scenario: params.scenario, evidence: evidence[params.scenario] },
		riskLevel: "medium",
	})
	return { scenarioEvidence: evidence }
}
