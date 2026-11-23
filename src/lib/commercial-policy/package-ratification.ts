import { z } from "zod"
import { AuditEvent, db, sql } from "@/shared/infrastructure/db/compat"
import { retireCommercialTourPolicy } from "./policy-drafts"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import {
	commandPayloadHash,
	reserveCommandIdempotency,
	completeCommandIdempotency,
} from "@/lib/commands/command-idempotency"
import { loadCommercialPolicyForRatification, ratifyCommercialTourPolicy } from "./ratification"
import { tourPolicyPublicationErrors } from "./evaluate"
import { commercialPolicyVersionLabel } from "./composition"

export const packageApprovalAreas = ["policy", "finance", "tour_operations"] as const
export const laPazGuideCleanup = {
	draft: "6f3282f4-f396-4942-9748-0f581f969ac8",
	base: "834e357f-0aba-4675-975f-62ea430a5538",
	retire: ["7f284825-fc18-48b0-96ae-e4c9caea297c", "7a801716-97de-4d02-881b-ded388ccc0b8"],
} as const
export const packageVersionIdsSchema = z
	.array(z.string().min(1).max(200))
	.min(1)
	.max(50)
	.refine((ids) => new Set(ids).size === ids.length, "duplicate_version")

export class PolicyPackageError extends Error {
	constructor(
		readonly code:
			| "policy_package_changed"
			| "policy_package_invalid"
			| "policy_package_in_progress"
	) {
		super(code)
	}
}

async function readPackage(versionIds: string[]) {
	const ids = packageVersionIdsSchema.parse(versionIds).sort()
	const versions = []
	for (const id of ids) {
		const version = await loadCommercialPolicyForRatification(id)
		if (!version || version.vertical !== "tour" || version.status !== "draft")
			throw new PolicyPackageError("policy_package_changed")
		versions.push(version)
	}
	return versions
}

function describePackage(versions: Awaited<ReturnType<typeof readPackage>>) {
	return {
		fingerprint: commandPayloadHash({
			version: 1,
			versions: versions.map((version) => ({
				...version,
				effectiveFrom: version.effectiveFrom.toISOString(),
				effectiveTo: version.effectiveTo?.toISOString() ?? null,
				approvedAt: version.approvedAt?.toISOString() ?? null,
				signatures: [...version.signatures]
					.sort((a, b) => a.approvalArea.localeCompare(b.approvalArea))
					.map((signature) => ({ ...signature, approvedAt: signature.approvedAt.toISOString() })),
				requirements: [...version.requirements]
					.sort((a, b) => a.key.localeCompare(b.key))
					.map((rule) => ({
						...rule,
						sourceCheckedAt: rule.sourceCheckedAt?.toISOString() ?? null,
					})),
			})),
		}),
		versions: versions.map((version) => ({
			id: version.id,
			label: commercialPolicyVersionLabel(version.label, version.context),
			version: version.versionNumber,
			holderType: version.holderType,
			country: version.country,
			context: version.context,
			effectiveFrom: version.effectiveFrom.toISOString(),
			effectiveTo: version.effectiveTo?.toISOString() ?? null,
			requirements: version.requirements,
			pendingAreas: packageApprovalAreas.filter(
				(area) => !version.signatures.some((signature) => signature.approvalArea === area)
			),
			errors: tourPolicyPublicationErrors(version).filter(
				(error) =>
					!["tour_policy_signatures_incomplete", "tour_policy_approval_metadata_missing"].includes(
						error
					)
			),
		})),
	}
}

async function describeCleanup(versions: Awaited<ReturnType<typeof readPackage>>) {
	const [draft] = versions
	const composition = draft?.context?.composition
	const now = new Date()
	if (
		versions.length !== 1 ||
		draft?.id !== laPazGuideCleanup.draft ||
		draft.effectiveFrom > now ||
		(draft.effectiveTo && draft.effectiveTo <= now) ||
		composition?.kind !== "admission" ||
		composition.replacesVersionIds.length !== 1 ||
		composition.replacesVersionIds[0] !== laPazGuideCleanup.base ||
		JSON.stringify([...composition.requiredFamilies].sort()) !==
			JSON.stringify(["operational_resources", "platform_standards", "regulated_place", "tourism"])
	)
		throw new PolicyPackageError("policy_package_invalid")
	const targets = await Promise.all(
		laPazGuideCleanup.retire.map(loadCommercialPolicyForRatification)
	)
	if (targets.some((target) => !target || target.status !== "published"))
		throw new PolicyPackageError("policy_package_changed")
	const preview = describePackage(versions)
	return {
		...preview,
		fingerprint: commandPayloadHash({ draft: preview.fingerprint, targets }),
		retirements: targets.map((target) => ({
			label: commercialPolicyVersionLabel(target!.label, target!.context),
			version: target!.versionNumber,
		})),
	}
}

export async function previewCommercialPolicyPackage(versionIds: string[], cleanup = false) {
	return withPostgresTransaction(async () => {
		const versions = await readPackage(versionIds)
		return cleanup ? describeCleanup(versions) : { ...describePackage(versions), retirements: [] }
	})
}

export async function ratifyCommercialPolicyPackage(params: {
	versionIds: string[]
	fingerprint: string
	approvalReference: string
	approverUserId: string
	idempotencyKey: string
	reviewedAreas: string[]
	cleanup?: boolean
}) {
	if (
		params.reviewedAreas.length !== 3 ||
		!packageApprovalAreas.every((area) => params.reviewedAreas.includes(area)) ||
		params.approvalReference.trim().length < 8 ||
		params.approvalReference.length > 500
	)
		throw new PolicyPackageError("policy_package_invalid")
	const versionIds = packageVersionIdsSchema.parse(params.versionIds).sort()
	return withPostgresTransaction(async () => {
		await db.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`policy-package:${params.approverUserId}:${params.idempotencyKey}`}, 0))`
		)
		const reservation = await reserveCommandIdempotency<{ ok: true; publishedVersions: number }>({
			scope: "commercial_policy.package",
			key: params.idempotencyKey,
			actorUserId: params.approverUserId,
			requestId: crypto.randomUUID(),
			payload: { ...params, versionIds, reviewedAreas: [...params.reviewedAreas].sort() },
		})
		if (reservation.kind === "replay") return reservation.response!
		if (reservation.kind === "in_progress")
			throw new PolicyPackageError("policy_package_in_progress")
		for (const id of [
			...new Set([...versionIds, ...(params.cleanup ? laPazGuideCleanup.retire : [])]),
		].sort())
			await db.execute(sql`SELECT id FROM "CompliancePolicyVersion" WHERE id=${id} FOR UPDATE`)
		const versions = await readPackage(versionIds)
		const preview = params.cleanup ? await describeCleanup(versions) : describePackage(versions)
		if (preview.fingerprint !== params.fingerprint)
			throw new PolicyPackageError("policy_package_changed")
		if (preview.versions.some((version) => version.errors.length))
			throw new PolicyPackageError("policy_package_invalid")
		for (const version of preview.versions) {
			if (!version.pendingAreas.length) {
				await ratifyCommercialTourPolicy({
					policyVersionId: version.id,
					approvalArea: "policy",
					approvalReference: params.approvalReference,
					approverUserId: params.approverUserId,
					resumePublication: true,
				})
			} else
				for (const approvalArea of version.pendingAreas)
					await ratifyCommercialTourPolicy({
						policyVersionId: version.id,
						approvalArea,
						approvalReference: params.approvalReference,
						approverUserId: params.approverUserId,
					})
		}
		if (params.cleanup) {
			const published = await loadCommercialPolicyForRatification(laPazGuideCleanup.draft)
			if (published?.status !== "published") throw new PolicyPackageError("policy_package_invalid")
			for (const id of laPazGuideCleanup.retire) {
				await retireCommercialTourPolicy(id)
				await db.insert(AuditEvent).values({
					id: crypto.randomUUID(),
					requestId: crypto.randomUUID(),
					actorUserId: params.approverUserId,
					action: "commercial_policy.retire",
					entityType: "CompliancePolicyVersion",
					entityId: id,
					riskLevel: "high",
					beforeJson: { status: "published" },
					afterJson: { status: "retired", packageVersionId: published.id },
				})
			}
		}
		const response = { ok: true as const, publishedVersions: versions.length }
		await completeCommandIdempotency({ id: reservation.id, response })
		return response
	})
}
