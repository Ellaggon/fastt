import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
	createPostgresSqlClient,
	closePostgresClients,
} from "../../src/shared/infrastructure/db/client"
import { resolveProductCommercialDiagnosis } from "../../src/lib/commercial-policy/enforcement"
import { withCommercialReadScope } from "../../src/lib/commercial-policy/read-scope"
import { readProviderHolderProfile } from "../../src/lib/provider-holder-profile"
import {
	readProviderCommercialLineState,
	collectionModelForCommercialLine,
	commercialLineForProductType,
} from "../../src/lib/verification/commercial-lines"

const productId = process.argv[2] ?? ""
if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new Error("Pass the selected test product UUID")
const sql = createPostgresSqlClient({ max: 1 })
const result: Record<string, unknown> = {
	measuredAt: new Date().toISOString(),
	environment: "local-diagnostic",
	samples: [],
	plans: [],
}

try {
	const products = await sql<
		{ providerId: string; productType: string; productCountry: string | null }[]
	>`select p."providerId", p."productType", g."countryCode" as "productCountry" from "Product" p left join "ProductGeoPlace" pg on pg."productId" = p.id and pg."isPrimary" = true left join "GeoPlace" g on g.id = pg."placeId" where p.id = ${productId} limit 1`
	const providerId = products[0]?.providerId
	if (!providerId) throw new Error("Selected product not found")
	const baseline = []
	for (let sample = 0; sample < 5; sample++) {
		const start = performance.now()
		await sql`select 1`
		baseline.push(Number((performance.now() - start).toFixed(1)))
	}
	result.warmRoundTripMs = baseline
	const samples = []
	for (let sample = 0; sample < 5; sample++) {
		const start = performance.now()
		const diagnosis = await withCommercialReadScope(() =>
			resolveProductCommercialDiagnosis({ productId, providerId })
		)
		samples.push({
			durationMs: Number((performance.now() - start).toFixed(1)),
			publishAllowed: diagnosis.diagnosis.capabilities.publish,
		})
	}
	result.samples = samples
	const queries = [
		{
			name: "productContext",
			values: [productId, providerId],
			text: `select p."productType", t."productId", t."experienceFormat", t."formatContractVersion", g."countryCode" from "Product" p left join "Tour" t on t."productId" = p.id left join "ProductGeoPlace" pg on pg."productId" = p.id and pg."isPrimary" = true left join "GeoPlace" g on g.id = pg."placeId" where p.id = $1 and p."providerId" = $2 limit 1`,
		},
		{
			name: "holder",
			values: [providerId],
			text: `select * from "ProviderHolderProfile" where "providerId" = $1`,
		},
		{
			name: "documents",
			values: [providerId],
			text: `select * from "ProviderDocument" where "providerId" = $1 order by "createdAt" desc, id desc`,
		},
		{
			name: "operationContext",
			values: [productId, providerId],
			text: `select * from "TourComplianceContext" where "productId" = $1 and "providerId" = $2`,
		},
		{
			name: "commercialLines",
			values: [providerId],
			text: `select * from "ProviderCommercialLine" where "providerId" = $1`,
		},
		{
			name: "historicalTerritories",
			values: ["fastt_legacy_jurisdiction"],
			text: `select "externalId", "placeId" from "GeoPlaceExternalId" where source = $1`,
		},
	]
	const holder = await readProviderHolderProfile(providerId)
	const lines = await readProviderCommercialLineState(providerId)
	if (holder) {
		const countries = [
			...new Set(
				[
					holder.holderCountry,
					holder.taxResidenceCountry,
					holder.payoutCountry,
					products[0].productCountry,
				].filter((value): value is string => Boolean(value))
			),
		]
		const countryParams = countries.map((_, index) => `$${index + 1}`).join(", ")
		if (countries.length)
			queries.push({
				name: "policyVersions",
				values: [
					...countries,
					products[0].productType,
					holder.holderType,
					collectionModelForCommercialLine(
						lines.lines,
						commercialLineForProductType(products[0].productType)
					),
				],
				text: `select v.*, s.country, s.vertical, s."holderType", s."collectionModel", s."jurisdictionRole" from "CompliancePolicyVersion" v inner join "CompliancePolicySet" s on v."policySetId" = s.id where s.country in (${countryParams}) and s."policyScope" = 'commercial' and s.status = 'active' and s.vertical = $${countries.length + 1} and s."holderType" = $${countries.length + 2} and s."collectionModel" = $${countries.length + 3}`,
			})
	}
	const documentRows = await sql<
		{ id: string }[]
	>`select id from "ProviderDocument" where "providerId" = ${providerId}`
	if (documentRows.length) {
		const values = documentRows.map((row) => row.id)
		const placeholders = values.map((_, index) => `$${index + 1}`).join(", ")
		queries.push(
			{
				name: "documentInspections",
				values,
				text: `select "documentId", "processingState", "structuralStatus", "malwareStatus", "tamperStatus" from "ProviderDocumentInspection" where "documentId" in (${placeholders})`,
			},
			{
				name: "documentScopes",
				values,
				text: `select s.*, g."canonicalName" from "ProviderDocumentScope" s left join "GeoPlace" g on g.id = s."territoryCode" where s."documentId" in (${placeholders})`,
			}
		)
	}
	const plans: Array<{
		name: string
		clientMs: number
		planningMs: number
		executionMs: number
		nodes: unknown[]
	}> = []
	await sql.begin(async (tx) => {
		await tx`set transaction read only`
		for (const query of queries) {
			const start = performance.now()
			const rows = await tx.unsafe(
				`explain (analyze, buffers, format json) ${query.text}`,
				query.values
			)
			const plan = rows[0]["QUERY PLAN"][0]
			const nodes: unknown[] = []
			const visit = (node: any) => {
				nodes.push({
					type: node["Node Type"],
					relation: node["Relation Name"],
					index: node["Index Name"],
					actualRows: node["Actual Rows"],
					loops: node["Actual Loops"],
					sharedHits: node["Shared Hit Blocks"],
					sharedReads: node["Shared Read Blocks"],
				})
				for (const child of node.Plans ?? []) visit(child)
			}
			visit(plan.Plan)
			plans.push({
				name: query.name,
				clientMs: Number((performance.now() - start).toFixed(1)),
				planningMs: plan["Planning Time"],
				executionMs: plan["Execution Time"],
				nodes,
			})
		}
	})
	result.plans = plans
	const directory = resolve("artifacts/performance")
	await mkdir(directory, { recursive: true })
	await writeFile(
		resolve(directory, "tour-policy-profile.json"),
		JSON.stringify(result, null, 2) + "\n",
		{ mode: 0o600 }
	)
	console.log(
		JSON.stringify({ measuredAt: result.measuredAt, warmRoundTripMs: baseline, samples, plans })
	)
} catch (error) {
	console.error(
		JSON.stringify({
			error: "policy_profile_failed",
			code: (error as { code?: string }).code ?? "unknown",
		})
	)
	process.exitCode = 1
} finally {
	await closePostgresClients()
}
