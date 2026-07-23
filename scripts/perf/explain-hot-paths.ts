import "dotenv/config"

import postgres from "postgres"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

type ExplainResult = {
	name: string
	sql: string
	lines: string[]
}

const sql = postgres(getPostgresConnectionUrl("direct"), {
	max: 1,
	prepare: false,
	idle_timeout: 5,
	connect_timeout: 15,
})

function text(value: unknown) {
	return String(value ?? "").trim()
}

async function one<T extends Record<string, unknown>>(
	query: postgres.PendingQuery<T[]>
): Promise<T | null> {
	const rows = await query
	return rows[0] ?? null
}

async function explain(name: string, query: string, params: any[] = []): Promise<ExplainResult> {
	const rows = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${query}`, params)
	return {
		name,
		sql: query,
		lines: rows.map((row: any) => String(row["QUERY PLAN"] ?? "")),
	}
}

function summarizePlan(lines: string[]) {
	const joined = lines.join("\n")
	const execution = joined.match(/Execution Time: ([0-9.]+) ms/)
	const planning = joined.match(/Planning Time: ([0-9.]+) ms/)
	const seqScans = [...joined.matchAll(/Seq Scan on ([^ ]+)/g)].map((m) => m[1])
	const indexScans = [
		...joined.matchAll(/Index Scan using ([^ ]+)/g),
		...joined.matchAll(/Index Only Scan using ([^ ]+)/g),
		...joined.matchAll(/Bitmap Index Scan on ([^ ]+)/g),
	].map((m) => m[1])
	const sorts = [...joined.matchAll(/\bSort\b/g)].length
	return {
		executionMs: execution ? Number(execution[1]) : null,
		planningMs: planning ? Number(planning[1]) : null,
		seqScans: [...new Set(seqScans)],
		indexScans: [...new Set(indexScans)],
		sorts,
	}
}

async function main() {
	const sample = await one(sql`
		select
			p.id as "productId",
			p."providerId" as "providerId",
			v.id as "variantId",
			rp.id as "ratePlanId"
		from "Product" p
		left join "Variant" v on v."productId" = p.id
		left join "RatePlan" rp on rp."variantId" = v.id
		where p."providerId" is not null
		order by p."lastUpdated" desc nulls last, p."creationDate" desc nulls last
		limit 1
	`)

	const providerOnly = sample?.providerId
		? null
		: await one(
				sql`select id as "providerId" from "Provider" order by "createdAt" desc nulls last limit 1`
			)

	const providerId = text(sample?.providerId ?? providerOnly?.providerId)
	const productId = text(sample?.productId)
	const ratePlanId = text(sample?.ratePlanId)

	if (!providerId) {
		console.log("No provider/product sample found. Seed staging before running hot-path EXPLAIN.")
		return
	}

	const policyScope = await one(sql`
		select "scope", "scopeId"
		from "PolicyAssignment"
		where "isActive" = true
		order by "createdAt" desc
		limit 1
	`)
	const policyGroup = await one(sql`
		select "policyGroupId"
		from "PolicyAssignment"
		where "policyGroupId" is not null
		order by "createdAt" desc
		limit 1
	`)

	const jobs: Array<Promise<ExplainResult>> = []

	if (productId) {
		jobs.push(
			explain(
				"product ownership + full aggregate joins",
				`
				select p.id, p.name, p."productType", ps.state, pc.description, pl.address,
					h.stars, t.duration, pkg.days, l."passengerCapacity"
				from "Product" p
				left join "ProductStatus" ps on ps."productId" = p.id
				left join "ProductContent" pc on pc."productId" = p.id
				left join "ProductLocation" pl on pl."productId" = p.id
				left join "Hotel" h on h."productId" = p.id
				left join "Tour" t on t."productId" = p.id
				left join "Package" pkg on pkg."productId" = p.id
				left join "Limousine" l on l."productId" = p.id
				where p.id = $1 and p."providerId" = $2
				limit 1
				`,
				[productId, providerId]
			),
			explain(
				"product variants aggregate",
				`
				select p.id, p.name, ps.state, v.id, v.name, v.kind, v.status, rp.id as "defaultRatePlanId",
					vc."minOccupancy", vc."maxOccupancy", vrp."roomTypeId", rt.name as "roomTypeName"
				from "Product" p
				left join "ProductStatus" ps on ps."productId" = p.id
				left join "Variant" v on v."productId" = p.id
				left join "VariantCapacity" vc on vc."variantId" = v.id
				left join "VariantRoomProfile" vrp on vrp."variantId" = v.id
				left join "RoomType" rt on rt.id = vrp."roomTypeId"
				left join "RatePlan" rp on rp."variantId" = v.id and rp."isDefault" = true and rp."isActive" = true
				where p.id = $1 and p."providerId" = $2
				`,
				[productId, providerId]
			)
		)
	}

	if (ratePlanId) {
		jobs.push(
			explain(
				"rate plan occupancy policy current",
				`
				select "ratePlanId", "baseCurrency", "baseAmount", "effectiveFrom", id
				from "RatePlanOccupancyPolicy"
				where "ratePlanId" = $1 and "effectiveFrom" <= now() and "effectiveTo" > now()
				order by "effectiveFrom" desc, id desc
				limit 1
				`,
				[ratePlanId]
			),
			explain(
				"effective pricing latest canonical occupancy",
				`
				select "ratePlanId", currency, "baseComponent", date
				from "EffectivePricingV2"
				where "ratePlanId" = $1 and "occupancyKey" = $2
				order by date desc, "computedAt" desc
				limit 1
				`,
				[ratePlanId, "adults:2|children:0|infants:0"]
			),
			explain(
				"effective pricing coverage count",
				`
				select "ratePlanId", count(*) as value
				from "EffectivePricingV2"
				where "ratePlanId" = $1 and "occupancyKey" = $2
				group by "ratePlanId"
				`,
				[ratePlanId, "adults:2|children:0|infants:0"]
			)
		)
	}

	jobs.push(
		explain(
			"provider governance base",
			`
			select p.id, p."displayName", p."legalName", p.status, pp.timezone, pp."defaultCurrency"
			from "Provider" p
			left join "ProviderProfile" pp on pp."providerId" = p.id
			where p.id = $1
			limit 1
			`,
			[providerId]
		),
		explain(
			"provider latest verification",
			`
			select status, reason, "createdAt"
			from "ProviderVerification"
			where "providerId" = $1
			order by "createdAt" desc, id desc
			limit 1
			`,
			[providerId]
		),
		explain(
			"provider audit latest",
			`
			select pal.id, pal.action, pal."entityType", pal."entityId", pal."riskLevel", pal."createdAt", u.email
			from "ProviderAuditLog" pal
			left join "User" u on u.id = pal."actorUserId"
			where pal."providerId" = $1
			order by pal."createdAt" desc
			limit 8
			`,
			[providerId]
		),
		explain(
			"provider team",
			`
			select u.id, u.email, pu.role, pu."permissionsJson", pu."createdAt"
			from "ProviderUser" pu
			left join "User" u on u.id = pu."userId"
			where pu."providerId" = $1
			`,
			[providerId]
		),
		explain(
			"provider invitations latest",
			`
			select id, email, role, status, "invitedBy", "acceptedAt", "expiresAt", "createdAt"
			from "ProviderInvitation"
			where "providerId" = $1
			order by "createdAt" desc
			`,
			[providerId]
		),
		explain(
			"provider documents",
			`
			select id, status, type, "createdAt", "updatedAt"
			from "ProviderDocument"
			where "providerId" = $1
			`,
			[providerId]
		),
		explain(
			"provider tax definitions",
			`
			select id, status, priority, "effectiveFrom", "effectiveTo"
			from "TaxFeeDefinition"
			where "providerId" = $1
			`,
			[providerId]
		)
	)

	if (policyScope?.scope && policyScope?.scopeId) {
		jobs.push(
			explain(
				"pricing policies active assignments",
				`
				select pa.id, pa."policyGroupId", pa.scope, pa."scopeId", pa.channel, pg.category
				from "PolicyAssignment" pa
				inner join "PolicyGroup" pg on pa."policyGroupId" = pg.id
				where pa."isActive" = true
					and pa.scope = $1
					and pa."scopeId" = $2
					and (pa.channel = 'web' or pa.channel is null)
					and (pa."effectiveFrom" is null or pa."effectiveFrom" <= current_date)
					and (pa."effectiveTo" is null or pa."effectiveTo" >= current_date)
				`,
				[text(policyScope.scope), text(policyScope.scopeId)]
			)
		)
	}

	if (policyGroup?.policyGroupId) {
		jobs.push(
			explain(
				"pricing policies active by group",
				`
				select id, "groupId", description, version, status, "effectiveFrom", "effectiveTo"
				from "Policy"
				where "groupId" = $1
					and status = 'active'
					and ("effectiveFrom" is null or "effectiveFrom" <= current_date)
					and ("effectiveTo" is null or "effectiveTo" >= current_date)
				`,
				[text(policyGroup.policyGroupId)]
			)
		)
	}

	const results = await Promise.all(jobs)
	for (const result of results) {
		const summary = summarizePlan(result.lines)
		console.log(`\n## ${result.name}`)
		console.log(
			JSON.stringify(
				{
					executionMs: summary.executionMs,
					planningMs: summary.planningMs,
					seqScans: summary.seqScans,
					indexScans: summary.indexScans,
					sorts: summary.sorts,
				},
				null,
				2
			)
		)
		console.log(result.lines.join("\n"))
	}
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
	.finally(async () => {
		await sql.end({ timeout: 5 })
	})
