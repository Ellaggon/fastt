import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	createTaxFeeDefinitionUseCase,
	listTaxFeeDefinitionsByProviderUseCase,
	updateTaxFeeDefinitionUseCase,
} from "@/container/taxes-fees.container"
import {
	auditFiscalityConfiguration,
	buildTaxFeeWarnings,
	fiscalDefinitionLifecycleStatus,
	type TaxFeeAssignment as TaxFeeAssignmentDomain,
} from "@/modules/taxes-fees/public"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { getAggregateCache, setAggregateCache } from "@/lib/cache/ssrAggregateCache"
import {
	publishTaxFeeDefinition,
	saveTaxFeeDefinitionDraft,
	TaxFeeDefinitionPublicationConflictError,
	type TaxFeeDefinitionPublicationPatch,
} from "@/lib/taxes-fees/tax-fee-versioning"
import { taxFeeDefinitionFingerprint } from "@/lib/taxes-fees/tax-fee-simulation-certification"
import {
	and,
	db,
	desc,
	eq,
	inArray,
	ProviderAuditLog,
	FiscalActivityEvent,
	TaxFeeAssignment,
	TaxFeeDefinition,
	TaxFeeDefinitionDraft,
	TaxFeeDefinitionVersion,
} from "@/shared/infrastructure/db/compat"

const createSchema = z.object({
	id: z.string().optional().nullable(),
	code: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(["tax", "fee"]),
	calculationType: z.enum(["percentage", "fixed"]),
	value: z.coerce.number(),
	currency: z.string().optional().nullable(),
	inclusionType: z.enum(["included", "excluded"]),
	appliesPer: z.enum(["stay", "night", "guest", "guest_night"]),
	priority: z.coerce.number().optional().default(0),
	effectiveFrom: z.string().optional().nullable(),
	effectiveTo: z.string().optional().nullable(),
	status: z.enum(["active", "archived"]).optional().default("active"),
	jurisdictionJson: z.string().optional().nullable(),
	publicationMode: z.enum(["draft", "publish", "schedule"]).optional(),
	expectedCurrentVersionId: z.string().min(1).nullable().optional(),
	expectedRevision: z.coerce.number().int().min(0).optional(),
})

const jurisdictionSchema = z.object({
	country: z.string().trim().length(2).optional(),
	region: z.string().trim().max(80).optional(),
	city: z.string().trim().max(80).optional(),
	collectionResponsibility: z.enum(["provider", "platform", "marketplace"]).default("provider"),
	taxableBase: z.enum(["booking_base", "base_plus_included"]).default("booking_base"),
	exemptGuestResidenceCountries: z.array(z.string().trim().length(2)).default([]),
	maxAmount: z.number().positive().nullable().optional(),
	maxNights: z.number().int().positive().nullable().optional(),
	seasonalMode: z.enum(["restrict", "override"]).optional(),
	seasons: z
		.array(
			z.object({
				from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				value: z.number().positive().nullable().optional(),
			})
		)
		.default([]),
})

async function invalidateTaxFeeProviderCaches(providerId: string, source: string) {
	const results = await Promise.allSettled([
		invalidateProvider(providerId),
		invalidateProviderGovernance(providerId, source),
	])
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("tax_fee.cache_invalidation_failed", {
				providerId,
				source,
				error: result.reason instanceof Error ? result.reason.message : String(result.reason),
			})
		}
	}
}

function parseJurisdiction(value?: string | null) {
	if (!value?.trim()) return null
	const parsed = JSON.parse(value)
	const rule = jurisdictionSchema.parse(parsed)
	for (const season of rule.seasons) {
		if (season.from > season.to) throw new Error("Invalid tax season")
	}
	return rule
}

function parseDate(value?: string | null) {
	if (!value) return null
	const d = new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

function publicationPatch(
	parsed: z.infer<typeof createSchema>,
	jurisdictionJson: unknown | null
): TaxFeeDefinitionPublicationPatch {
	return {
		code: parsed.code,
		name: parsed.name,
		kind: parsed.kind,
		calculationType: parsed.calculationType,
		value: parsed.value,
		currency: parsed.currency ?? null,
		inclusionType: parsed.inclusionType,
		appliesPer: parsed.appliesPer,
		priority: parsed.priority ?? 0,
		jurisdictionJson,
		effectiveFrom: parseDate(parsed.effectiveFrom),
		effectiveTo: parseDate(parsed.effectiveTo),
	}
}

function buildWarningDefinition(
	providerId: string,
	parsed: z.infer<typeof createSchema>,
	id: string,
	jurisdictionJson: unknown | null
) {
	const now = new Date()
	return {
		id,
		providerId,
		code: parsed.code,
		name: parsed.name,
		kind: parsed.kind,
		calculationType: parsed.calculationType,
		value: parsed.value,
		currency: parsed.currency ?? null,
		inclusionType: parsed.inclusionType,
		appliesPer: parsed.appliesPer,
		priority: parsed.priority ?? 0,
		jurisdictionJson,
		effectiveFrom: parseDate(parsed.effectiveFrom),
		effectiveTo: parseDate(parsed.effectiveTo),
		status: parsed.status,
		createdAt: now,
		updatedAt: now,
	}
}

async function requireCurrentSimulation(input: {
	providerId: string
	definitionId: string
	definition: z.infer<typeof createSchema>
	jurisdictionJson: unknown | null
}) {
	const fingerprint = taxFeeDefinitionFingerprint({
		id: input.definitionId,
		code: input.definition.code,
		name: input.definition.name,
		kind: input.definition.kind,
		calculationType: input.definition.calculationType,
		value: input.definition.value,
		currency: input.definition.currency ?? null,
		inclusionType: input.definition.inclusionType,
		appliesPer: input.definition.appliesPer,
		effectiveFrom: input.definition.effectiveFrom ?? null,
		effectiveTo: input.definition.effectiveTo ?? null,
		jurisdictionJson: input.jurisdictionJson,
	})
	const simulations = await db
		.select({ context: FiscalActivityEvent.contextJson })
		.from(FiscalActivityEvent)
		.where(
			and(
				eq(FiscalActivityEvent.providerId, input.providerId),
				eq(FiscalActivityEvent.definitionId, input.definitionId),
				eq(FiscalActivityEvent.eventType, "simulation_executed"),
				eq(FiscalActivityEvent.result, "succeeded")
			)
		)
	const isCertified = simulations.some(
		(item) =>
			(item.context as { definitionFingerprint?: string } | null)?.definitionFingerprint ===
			fingerprint
	)
	if (!isCertified) {
		throw new Error("Debes ejecutar una simulación vigente antes de publicar esta versión.")
	}
}

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}
	const cacheKey = `fiscal:definitions:${providerId}`
	const cached = getAggregateCache<Record<string, unknown>>(cacheKey)
	if (cached) return Response.json(cached)

	const { definitions } = await listTaxFeeDefinitionsByProviderUseCase({ providerId })
	const warnings = buildTaxFeeWarnings(definitions)
	const definitionIds = definitions.map((definition) => definition.id)
	const [assignments, auditEvents, versions, drafts] = await Promise.all([
		definitionIds.length
			? db
					.select({
						id: TaxFeeAssignment.id,
						taxFeeDefinitionId: TaxFeeAssignment.taxFeeDefinitionId,
						scope: TaxFeeAssignment.scope,
						scopeId: TaxFeeAssignment.scopeId,
						channel: TaxFeeAssignment.channel,
						status: TaxFeeAssignment.status,
						createdAt: TaxFeeAssignment.createdAt,
					})
					.from(TaxFeeAssignment)
					.where(inArray(TaxFeeAssignment.taxFeeDefinitionId, definitionIds))
			: Promise.resolve([]),
		db
			.select({
				entityId: ProviderAuditLog.entityId,
				action: ProviderAuditLog.action,
				createdAt: ProviderAuditLog.createdAt,
			})
			.from(ProviderAuditLog)
			.where(eq(ProviderAuditLog.providerId, providerId))
			.orderBy(desc(ProviderAuditLog.createdAt)),
		definitionIds.length
			? db
					.select({
						id: TaxFeeDefinitionVersion.id,
						taxFeeDefinitionId: TaxFeeDefinitionVersion.taxFeeDefinitionId,
						version: TaxFeeDefinitionVersion.version,
						publicationState: TaxFeeDefinitionVersion.publicationState,
						createdAt: TaxFeeDefinitionVersion.createdAt,
						createdByUserId: TaxFeeDefinitionVersion.createdByUserId,
					})
					.from(TaxFeeDefinitionVersion)
					.where(inArray(TaxFeeDefinitionVersion.taxFeeDefinitionId, definitionIds))
					.orderBy(desc(TaxFeeDefinitionVersion.version))
			: Promise.resolve([]),
		definitionIds.length
			? db
					.select()
					.from(TaxFeeDefinitionDraft)
					.where(inArray(TaxFeeDefinitionDraft.definitionId, definitionIds))
			: Promise.resolve([]),
	])
	const draftsByDefinition = new Map(drafts.map((draft) => [draft.definitionId, draft]))
	const currentVersions = new Map<string, (typeof versions)[number]>()
	for (const version of versions) {
		const id = String(version.taxFeeDefinitionId)
		if (!currentVersions.has(id)) currentVersions.set(id, version)
	}
	const assignmentsByDefinition = new Map<string, typeof assignments>()
	for (const assignment of assignments) {
		const key = String(assignment.taxFeeDefinitionId)
		assignmentsByDefinition.set(key, [...(assignmentsByDefinition.get(key) ?? []), assignment])
	}
	const auditAssignments: TaxFeeAssignmentDomain[] = assignments.map((assignment) => ({
		id: String(assignment.id),
		taxFeeDefinitionId: String(assignment.taxFeeDefinitionId),
		scope: assignment.scope as TaxFeeAssignmentDomain["scope"],
		scopeId: assignment.scopeId == null ? null : String(assignment.scopeId),
		channel: assignment.channel == null ? null : String(assignment.channel),
		status: assignment.status as TaxFeeAssignmentDomain["status"],
		createdAt: assignment.createdAt,
	}))
	const auditAssignmentsByDefinition = new Map<string, TaxFeeAssignmentDomain[]>()
	for (const assignment of auditAssignments) {
		auditAssignmentsByDefinition.set(assignment.taxFeeDefinitionId, [
			...(auditAssignmentsByDefinition.get(assignment.taxFeeDefinitionId) ?? []),
			assignment,
		])
	}
	const fiscalityAudit = auditFiscalityConfiguration({ definitions, assignments: auditAssignments })
	const conflictingDefinitionIds = new Set(
		fiscalityAudit.findings
			.filter((finding) => finding.code === "duplicate_active_assignment")
			.flatMap((finding) => finding.definitionIds)
	)
	const auditByDefinition = new Map<string, typeof auditEvents>()
	for (const event of auditEvents) {
		const key = String(event.entityId ?? "")
		if (!definitionIds.includes(key)) continue
		auditByDefinition.set(key, [...(auditByDefinition.get(key) ?? []), event])
	}
	const now = new Date()
	const payload = definitions.map((d) => ({
		...(draftsByDefinition.get(d.id)
			? {
					draft: (() => {
						const draft = draftsByDefinition.get(d.id)!
						return {
							code: draft.code,
							name: draft.name,
							kind: draft.kind,
							calculationType: draft.calculationType,
							value: Number(draft.value),
							currency: draft.currency,
							inclusionType: draft.inclusionType,
							appliesPer: draft.appliesPer,
							priority: Number(draft.priority),
							jurisdictionJson: draft.jurisdictionJson,
							effectiveFrom: draft.effectiveFrom,
							effectiveTo: draft.effectiveTo,
						}
					})(),
				}
			: {}),
		id: d.id,
		code: d.code,
		name: d.name,
		kind: d.kind,
		calculationType: d.calculationType,
		value: d.value,
		currency: d.currency,
		inclusionType: d.inclusionType,
		appliesPer: d.appliesPer,
		priority: d.priority,
		jurisdictionJson: d.jurisdictionJson,
		effectiveFrom: d.effectiveFrom,
		effectiveTo: d.effectiveTo,
		status: d.status,
		operationalStatus:
			d.editingState === "draft"
				? "draft"
				: fiscalDefinitionLifecycleStatus({
						definition: d,
						assignments: auditAssignmentsByDefinition.get(d.id) ?? [],
						hasConflict: conflictingDefinitionIds.has(d.id),
						now,
					}),
		revision: currentVersions.get(d.id)?.version ?? 0,
		currentVersion: currentVersions.get(d.id)
			? {
					id: currentVersions.get(d.id)!.id,
					version: Number(currentVersions.get(d.id)!.version),
					publicationState: currentVersions.get(d.id)!.publicationState,
					createdAt: currentVersions.get(d.id)!.createdAt.toISOString(),
					createdByUserId: currentVersions.get(d.id)!.createdByUserId,
				}
			: null,
		lastChangedAt: (auditByDefinition.get(d.id)?.[0]?.createdAt ?? d.updatedAt).toISOString(),
		assignments: (assignmentsByDefinition.get(d.id) ?? []).map((assignment) => ({
			id: assignment.id,
			scope: assignment.scope,
			scopeId: assignment.scopeId,
			channel: assignment.channel,
			status: assignment.status,
			createdAt: assignment.createdAt.toISOString(),
		})),
		auditTrail: (auditByDefinition.get(d.id) ?? []).slice(0, 4).map((event) => ({
			action: event.action,
			createdAt: event.createdAt.toISOString(),
		})),
	}))

	const auditWarnings = fiscalityAudit.findings.map((finding) => ({
		code: finding.code,
		message: finding.message,
		meta: { definitionIds: finding.definitionIds, assignmentIds: finding.assignmentIds },
	}))

	const responseBody = {
		definitions: payload,
		warnings: [...warnings, ...auditWarnings],
		audit: fiscalityAudit,
	}
	setAggregateCache(cacheKey, responseBody, { ttlMs: 5_000, tags: [`provider:${providerId}`] })
	return Response.json(responseBody)
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)

		const form = await request.formData()
		const parsed = createSchema.parse({
			code: form.get("code"),
			name: form.get("name"),
			kind: form.get("kind"),
			calculationType: form.get("calculationType"),
			value: form.get("value"),
			currency: form.get("currency"),
			inclusionType: form.get("inclusionType"),
			appliesPer: form.get("appliesPer"),
			priority: form.get("priority"),
			effectiveFrom: form.get("effectiveFrom"),
			effectiveTo: form.get("effectiveTo"),
			status: form.get("status") ?? undefined,
			jurisdictionJson: form.get("jurisdictionJson")?.toString() ?? null,
			publicationMode: form.get("publicationMode") || undefined,
		})
		const jurisdictionJson = parseJurisdiction(parsed.jurisdictionJson)
		const isDraft = parsed.publicationMode === "draft"
		const isScheduled = parsed.publicationMode === "schedule"
		if (isScheduled && !parsed.effectiveFrom)
			throw new Error("Una publicación programada requiere fecha de inicio.")

		const result = await createTaxFeeDefinitionUseCase({
			providerId,
			code: parsed.code,
			name: parsed.name,
			kind: parsed.kind,
			calculationType: parsed.calculationType,
			value: parsed.value,
			currency: parsed.currency ?? null,
			inclusionType: parsed.inclusionType,
			appliesPer: parsed.appliesPer,
			priority: parsed.priority ?? 0,
			effectiveFrom: parseDate(parsed.effectiveFrom),
			effectiveTo: parseDate(parsed.effectiveTo),
			// A release only becomes published in publishTaxFeeDefinition(),
			// where its immutable snapshot and currentVersionId are committed together.
			status: "archived",
			editingState: "draft",
			jurisdictionJson,
		})
		const publication = isDraft
			? null
			: await publishTaxFeeDefinition({
					definitionId: result.id,
					actorUserId: user.id,
					providerId,
					publicationState: isScheduled ? "scheduled" : "published",
					operationalStatus: parsed.status,
					expectedCurrentVersionId: null,
					expectedRevision: 0,
				})

		const warnings = buildTaxFeeWarnings([
			buildWarningDefinition(providerId, parsed, result.id, jurisdictionJson),
		])
		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action: "tax_fee_definition_created",
			entityType: "TaxFeeDefinition",
			entityId: result.id,
			beforeJson: null,
			afterJson: buildWarningDefinition(providerId, parsed, result.id, jurisdictionJson),
			riskLevel: "high",
		})
		await invalidateTaxFeeProviderCaches(providerId, "provider_tax_fee_definition_created")

		return new Response(JSON.stringify({ id: result.id, warnings, publication }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status =
			err instanceof TaxFeeDefinitionPublicationConflictError || msg.includes("Duplicate")
				? 409
				: 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const PUT: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)

		const form = await request.formData()
		const parsed = createSchema.parse({
			id: form.get("id"),
			code: form.get("code"),
			name: form.get("name"),
			kind: form.get("kind"),
			calculationType: form.get("calculationType"),
			value: form.get("value"),
			currency: form.get("currency"),
			inclusionType: form.get("inclusionType"),
			appliesPer: form.get("appliesPer"),
			priority: form.get("priority"),
			effectiveFrom: form.get("effectiveFrom"),
			effectiveTo: form.get("effectiveTo"),
			status: form.get("status") ?? undefined,
			jurisdictionJson: form.get("jurisdictionJson")?.toString() ?? null,
			publicationMode: form.get("publicationMode") || undefined,
			expectedCurrentVersionId: form.get("expectedCurrentVersionId")?.toString() || null,
			expectedRevision: form.get("expectedRevision") || undefined,
		})
		const jurisdictionJson = parseJurisdiction(parsed.jurisdictionJson)
		const isDraft = parsed.publicationMode === "draft"
		const isScheduled = parsed.publicationMode === "schedule"
		if (isScheduled && !parsed.effectiveFrom)
			throw new Error("Una publicación programada requiere fecha de inicio.")

		if (!parsed.id) {
			return new Response(JSON.stringify({ error: "validation_error", message: "Missing id" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (parsed.publicationMode === "publish" || parsed.publicationMode === "schedule") {
			await requireCurrentSimulation({
				providerId,
				definitionId: parsed.id,
				definition: parsed,
				jurisdictionJson,
			})
		}
		const before = await db
			.select()
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.id, parsed.id))
			.then((rows) => rows[0] ?? null)

		const shouldPublish = !isDraft && parsed.status !== "archived"
		const publication = shouldPublish
			? await publishTaxFeeDefinition({
					definitionId: parsed.id,
					actorUserId: user.id,
					providerId,
					publicationState: isScheduled ? "scheduled" : "published",
					operationalStatus: parsed.status,
					expectedCurrentVersionId: parsed.expectedCurrentVersionId ?? null,
					expectedRevision: parsed.expectedRevision ?? 0,
					definitionPatch: publicationPatch(parsed, jurisdictionJson),
				})
			: null
		const result = shouldPublish
			? { id: parsed.id }
			: before?.currentVersionId
				? await saveTaxFeeDefinitionDraft({
						definitionId: parsed.id,
						providerId,
						actorUserId: user.id,
						patch: publicationPatch(parsed, jurisdictionJson),
					})
				: await updateTaxFeeDefinitionUseCase({
						id: parsed.id,
						providerId,
						...publicationPatch(parsed, jurisdictionJson),
						status: "archived",
						editingState: "draft",
					})

		const warnings = buildTaxFeeWarnings([
			buildWarningDefinition(providerId, parsed, result.id, jurisdictionJson),
		])
		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action:
				parsed.status === "archived" ? "tax_fee_definition_archived" : "tax_fee_definition_updated",
			entityType: "TaxFeeDefinition",
			entityId: result.id,
			beforeJson: before,
			afterJson: buildWarningDefinition(providerId, parsed, result.id, jurisdictionJson),
			riskLevel: "high",
		})
		await invalidateTaxFeeProviderCaches(providerId, "provider_tax_fee_definition_updated")

		return new Response(JSON.stringify({ id: result.id, warnings, publication }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status =
			err instanceof TaxFeeDefinitionPublicationConflictError
				? 409
				: msg.includes("Duplicate")
					? 409
					: msg === "Not found"
						? 404
						: 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)
		const id = new URL(request.url).searchParams.get("id")?.trim()
		if (!id)
			return Response.json({ error: "validation_error", message: "Missing id" }, { status: 400 })

		const definition = await db
			.select()
			.from(TaxFeeDefinition)
			.where(and(eq(TaxFeeDefinition.id, id), eq(TaxFeeDefinition.providerId, providerId)))
			.then((rows) => rows[0] ?? null)
		if (!definition) return Response.json({ error: "not_found" }, { status: 404 })
		if (definition.editingState !== "draft" || definition.currentVersionId) {
			return Response.json(
				{ error: "validation_error", message: "Solo se pueden eliminar borradores sin publicar." },
				{ status: 409 }
			)
		}

		const [assignments, versions, simulations] = await Promise.all([
			db
				.select({ id: TaxFeeAssignment.id })
				.from(TaxFeeAssignment)
				.where(eq(TaxFeeAssignment.taxFeeDefinitionId, id))
				.limit(1),
			db
				.select({ id: TaxFeeDefinitionVersion.id })
				.from(TaxFeeDefinitionVersion)
				.where(eq(TaxFeeDefinitionVersion.taxFeeDefinitionId, id))
				.limit(1),
			db
				.select({ id: FiscalActivityEvent.id })
				.from(FiscalActivityEvent)
				.where(eq(FiscalActivityEvent.definitionId, id))
				.limit(1),
		])
		if (assignments.length || versions.length || simulations.length) {
			return Response.json(
				{
					error: "validation_error",
					message:
						"Este borrador tiene actividad o dependencias y debe archivarse para conservar su trazabilidad.",
				},
				{ status: 409 }
			)
		}

		await db.delete(TaxFeeDefinition).where(eq(TaxFeeDefinition.id, id))
		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action: "tax_fee_definition_draft_deleted",
			entityType: "TaxFeeDefinition",
			entityId: id,
			beforeJson: definition,
			afterJson: null,
			riskLevel: "medium",
		})
		await invalidateTaxFeeProviderCaches(providerId, "provider_tax_fee_definition_draft_deleted")
		return new Response(null, { status: 204 })
	} catch (err: any) {
		if (err instanceof Response) return err
		return Response.json(
			{
				error: "validation_error",
				message: String(err?.message || "No se pudo eliminar el borrador."),
			},
			{ status: 400 }
		)
	}
}
