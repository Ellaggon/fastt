import { z } from "zod"
import { db, sql } from "@/shared/infrastructure/db/compat"
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

export async function previewCommercialPolicyPackage(versionIds: string[]) {
	return withPostgresTransaction(async () => describePackage(await readPackage(versionIds)))
}

export async function ratifyCommercialPolicyPackage(params: {
	versionIds: string[]
	fingerprint: string
	approvalReference: string
	approverUserId: string
	idempotencyKey: string
	reviewedAreas: string[]
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
		for (const id of versionIds)
			await db.execute(sql`SELECT id FROM "CompliancePolicyVersion" WHERE id=${id} FOR UPDATE`)
		const versions = await readPackage(versionIds)
		const preview = describePackage(versions)
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
		const response = { ok: true as const, publishedVersions: versions.length }
		await completeCommandIdempotency({ id: reservation.id, response })
		return response
	})
}
