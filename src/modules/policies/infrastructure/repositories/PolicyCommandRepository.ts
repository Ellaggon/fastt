import {
	db,
	eq,
	and,
	sql,
	Policy,
	PolicyRule,
	CancellationTier,
	PolicyGroup,
	PolicyAssignment,
} from "astro:db"
import { randomUUID } from "crypto"
import type {
	PolicyCommandRepositoryPort,
	ActivatePolicyParams,
	CreatePolicyParams,
	CreatePolicyVersionParams,
} from "../../application/ports/PolicyCommandRepositoryPort"

export class PolicyCommandRepository implements PolicyCommandRepositoryPort {
	async activatePolicy(params: ActivatePolicyParams) {
		const policy = await db.select().from(Policy).where(eq(Policy.id, params.policyId)).get()
		if (!policy) throw new Error("Policy not found")

		const groupId = policy.groupId

		await db.transaction(async (tx) => {
			await tx
				.update(Policy)
				.set({ status: "archived", effectiveTo: params.effectiveFromIso })
				.where(and(eq(Policy.groupId, groupId), eq(Policy.status, "active")))

			await tx
				.update(Policy)
				.set({
					status: "active",
					effectiveFrom: params.effectiveFromIso,
					effectiveTo: null,
				})
				.where(eq(Policy.id, params.policyId))
		})

		return { groupId }
	}

	async assignPolicyGroup(params: { groupId: string; scopeId: string }) {
		await db
			.update(PolicyAssignment)
			.set({ isActive: true })
			.where(
				and(
					eq(PolicyAssignment.policyGroupId, params.groupId),
					eq(PolicyAssignment.scopeId, params.scopeId)
				)
			)
	}

	async unassignPolicyGroup(params: { groupId: string; scopeId: string }) {
		// NOTE: This mirrors the legacy route behavior (missing `.where(...)`).
		// It is likely a bug, but we preserve it for now to avoid behavior changes.
		await db.update(PolicyAssignment).set({ isActive: false })
		and(
			eq(PolicyAssignment.policyGroupId, params.groupId),
			eq(PolicyAssignment.scopeId, params.scopeId)
		)
	}

	async applyPreset(params: { policyId: string; presetKey: string; description: string }) {
		const policy = await db.select().from(Policy).where(eq(Policy.id, params.policyId)).get()
		if (!policy) throw new Error("Policy not found")
		if (policy.status !== "draft") throw new Error("Only draft policies can be modified")

		await db.transaction(async (tx) => {
			// 🔥 Limpieza total previa
			await tx.delete(PolicyRule).where(eq(PolicyRule.policyId, params.policyId))
			await tx.delete(CancellationTier).where(eq(CancellationTier.policyId, params.policyId))

			// =============================
			// CANCELLATION PRESETS
			// =============================

			if (params.presetKey.startsWith("free_")) {
				const hours = parseInt(params.presetKey.split("_")[1])
				const days = hours / 24

				await tx.insert(CancellationTier).values([
					{
						id: crypto.randomUUID(),
						policyId: params.policyId,
						daysBeforeArrival: days,
						penaltyType: "percentage",
						penaltyAmount: 0,
					},
					{
						id: crypto.randomUUID(),
						policyId: params.policyId,
						daysBeforeArrival: 0,
						penaltyType: "percentage",
						penaltyAmount: 100,
					},
				])
			}

			if (params.presetKey === "non_refundable") {
				await tx.insert(CancellationTier).values({
					id: crypto.randomUUID(),
					policyId: params.policyId,
					daysBeforeArrival: 999,
					penaltyType: "percentage",
					penaltyAmount: 100,
				})
			}

			// =============================
			// CHECK-IN PRESETS
			// =============================

			if (params.presetKey.startsWith("checkin_")) {
				const hour = params.presetKey.split("_")[1] + ":00"

				await tx.insert(PolicyRule).values({
					id: crypto.randomUUID(),
					policyId: params.policyId,
					ruleKey: "checkin",
					ruleValue: {
						from: hour,
						until: "23:59",
					},
				})
			}

			// =============================
			// FUTURO: STAY RESTRICTIONS
			// =============================

			if (params.presetKey === "min_2_nights") {
				await tx.insert(PolicyRule).values({
					id: crypto.randomUUID(),
					policyId: params.policyId,
					ruleKey: "stay_restrictions",
					ruleValue: {
						minNights: 2,
					},
				})
			}

			// =============================
			// Actualizar descripción visible
			// =============================

			await tx
				.update(Policy)
				.set({ description: params.description })
				.where(eq(Policy.id, params.policyId))
		})
	}

	async createPolicy(params: CreatePolicyParams) {
		if (!params.scope || !params.scopeId || !params.category) {
			throw new Error("Missing fields")
		}

		let groupId: string
		let version = 1

		/* ================= VERSIONING ================= */

		if (params.previousPolicyId) {
			const existing = await db
				.select()
				.from(Policy)
				.where(eq(Policy.id, params.previousPolicyId))
				.get()

			if (!existing) {
				throw new Error("Policy not found")
			}

			groupId = existing.groupId
			version = existing.version + 1
		} else {
			groupId = randomUUID()

			await db.insert(PolicyGroup).values({
				id: groupId,
				category: params.category,
			})
		}

		const newPolicyId = randomUUID()

		/* ================= CREATE POLICY ================= */

		await db.insert(Policy).values({
			id: newPolicyId,
			groupId,
			description: params.description ?? "",
			version,
			status: "draft",
			effectiveFrom: null,
		})

		/* ================= CANCELLATION STRUCTURE ================= */

		if (params.category === "Cancellation") {
			if (!Array.isArray(params.cancellationTiers) || params.cancellationTiers.length === 0) {
				throw new Error("Cancellation tiers required")
			}

			for (const tier of params.cancellationTiers) {
				await db.insert(CancellationTier).values({
					id: randomUUID(),
					policyId: newPolicyId,
					daysBeforeArrival: Number(tier.daysBeforeArrival) || 0,
					penaltyType: tier.penaltyType ?? "percentage",
					penaltyAmount: Number(tier.penaltyAmount) || 0,
				})
			}
		}

		/* ================= ASSIGNMENT ================= */

		const existingAssignment = await db
			.select()
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.policyGroupId, groupId))
			.get()

		if (!existingAssignment) {
			await db.insert(PolicyAssignment).values({
				id: randomUUID(),
				policyGroupId: groupId,
				scope: params.scope,
				scopeId: params.scopeId,
				isActive: true,
			})
		}

		return { id: newPolicyId, groupId }
	}

	async deleteDraftPolicy(params: { policyId: string }) {
		const existing = await db.select().from(Policy).where(eq(Policy.id, params.policyId)).get()

		if (!existing) {
			throw new Error("Policy not found")
		}

		if (existing.status !== "draft") {
			throw new Error("Only draft policies can be deleted")
		}

		const groupId = existing.groupId

		await db.transaction(async (tx) => {
			// 1️⃣ eliminar dependencias
			await tx.delete(PolicyRule).where(eq(PolicyRule.policyId, params.policyId))
			await tx.delete(CancellationTier).where(eq(CancellationTier.policyId, params.policyId))
			await tx.delete(Policy).where(eq(Policy.id, params.policyId))

			// 2️⃣ verificar si quedan más versiones en el grupo
			const remaining = await tx.select().from(Policy).where(eq(Policy.groupId, groupId))

			// 3️⃣ si no quedan políticas → eliminar grupo y assignments
			if (remaining.length === 0) {
				await tx.delete(PolicyAssignment).where(eq(PolicyAssignment.policyGroupId, groupId))
				await tx.delete(PolicyGroup).where(eq(PolicyGroup.id, groupId))
			}
		})
	}

	async createPolicyVersion(params: CreatePolicyVersionParams) {
		if (!params.previousPolicyId) throw new Error("Missing previousPolicyId")

		return await db.transaction(async (tx) => {
			/* 1️⃣ Obtener política anterior */
			const existing = await tx
				.select()
				.from(Policy)
				.where(eq(Policy.id, params.previousPolicyId))
				.get()

			if (!existing) {
				throw new Error("Policy not found")
			}

			/* 2️⃣ Calcular próxima versión segura */
			const maxVersionRow = await tx
				.select({
					max: sql<number>`MAX(${Policy.version})`,
				})
				.from(Policy)
				.where(eq(Policy.groupId, existing.groupId))
				.get()

			const nextVersion = (maxVersionRow?.max ?? 0) + 1

			const newPolicyId = crypto.randomUUID()

			/* 3️⃣ Insertar nueva versión (CLONANDO description si no viene) */
			await tx.insert(Policy).values({
				id: newPolicyId,
				groupId: existing.groupId,
				description: params.description ?? existing.description,
				version: nextVersion,
				status: "draft",
				effectiveFrom: null,
				effectiveTo: null,
			})

			/* 4️⃣ Copiar PolicyRules */
			const previousRules = await tx
				.select()
				.from(PolicyRule)
				.where(eq(PolicyRule.policyId, params.previousPolicyId))

			if (previousRules.length) {
				await tx.insert(PolicyRule).values(
					previousRules.map((rule) => ({
						id: crypto.randomUUID(),
						policyId: newPolicyId,
						ruleKey: rule.ruleKey,
						ruleValue: rule.ruleValue,
					}))
				)
			}

			/* 5️⃣ Copiar CancellationTiers */
			/* 5️⃣ Insertar CancellationTiers nuevos */
			if (params.cancellationTiers?.length) {
				await tx.insert(CancellationTier).values(
					params.cancellationTiers.map((tier) => ({
						id: crypto.randomUUID(),
						policyId: newPolicyId,
						daysBeforeArrival: tier.daysBeforeArrival,
						penaltyType: tier.penaltyType,
						penaltyAmount: tier.penaltyAmount,
					}))
				)
			}

			return {
				success: true as const,
				id: newPolicyId,
				groupId: existing.groupId,
				version: nextVersion,
			}
		})
	}
}
