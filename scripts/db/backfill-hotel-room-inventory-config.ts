import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import "dotenv/config"
import postgres from "postgres"

type Candidate = {
	variantId: string
	productId: string
	providerId: string
	dailyInventoryRows: number
	maxPositiveUnits: number | null
}

type AppliedRow = {
	variantId: string
	defaultTotalUnits: number
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function argValue(name: string): string | null {
	const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
	if (inline) return inline.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name)
}

function reportFileName() {
	return `hotel-room-inventory-config-backfill-${new Date().toISOString().replaceAll(":", "-")}.json`
}

async function main() {
	const apply = hasFlag("--apply")
	const reportPath = path.resolve(
		argValue("--report") ?? path.join("db", "reports", reportFileName())
	)
	const sql = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		// Legacy repair only: canonical configs remain untouched and non-room variants are excluded.
		const candidates = await sql<Candidate[]>`
			select
				v.id as "variantId",
				v."productId" as "productId",
				p."providerId" as "providerId",
				count(di.id)::int as "dailyInventoryRows",
				max(di."totalInventory") filter (where di."totalInventory" > 0)::int as "maxPositiveUnits"
			from "Variant" v
			join "Product" p on p.id = v."productId"
			left join "VariantInventoryConfig" config on config."variantId" = v.id
			left join "DailyInventory" di on di."variantId" = v.id
			where v.kind = 'hotel_room'
				and config."variantId" is null
			group by v.id, v."productId", p."providerId"
			order by v.id
		`

		const review = candidates
			.filter((candidate) => candidate.maxPositiveUnits == null)
			.map((candidate) => ({
				...candidate,
				proposedDefaultTotalUnits: 1,
				reason:
					candidate.dailyInventoryRows === 0 ? "no_daily_inventory" : "no_positive_daily_inventory",
			}))
		const proposed = candidates.map((candidate) => ({
			...candidate,
			proposedDefaultTotalUnits: Math.max(1, Number(candidate.maxPositiveUnits ?? 1)),
			source: candidate.maxPositiveUnits == null ? "fallback" : "max_positive_daily_inventory",
		}))

		const applied: Array<AppliedRow & { source: string }> = []
		const skippedDuringApply: string[] = []
		if (apply && proposed.length) {
			await sql.begin(async (transaction) => {
				for (const candidate of proposed) {
					const rows = await transaction<AppliedRow[]>`
						insert into "VariantInventoryConfig" (
							"variantId",
							"defaultTotalUnits",
							"horizonDays",
							"createdAt"
						)
						select ${candidate.variantId}, ${candidate.proposedDefaultTotalUnits}, 365, current_timestamp
						where not exists (
							select 1 from "VariantInventoryConfig" where "variantId" = ${candidate.variantId}
						)
						on conflict ("variantId") do nothing
						returning "variantId", "defaultTotalUnits"
					`
					if (rows[0]) {
						applied.push({ ...rows[0], source: candidate.source })
					} else {
						skippedDuringApply.push(candidate.variantId)
					}
				}
			})
		}

		const report = {
			script: "scripts/db/backfill-hotel-room-inventory-config.ts",
			generatedAt: new Date().toISOString(),
			mode: apply ? "apply" : "dry-run",
			policy: {
				variantKind: "hotel_room",
				onlyMissingConfiguration: true,
				unitsSource: "max(DailyInventory.totalInventory) where positive",
				fallbackUnits: 1,
				fallbackRequiresReview: true,
				overwriteExistingConfigurations: false,
			},
			summary: {
				candidates: proposed.length,
				applied: applied.length,
				skippedDuringApply: skippedDuringApply.length,
				requiresReview: review.length,
			},
			proposed,
			applied,
			skippedDuringApply,
			review,
		}

		await mkdir(path.dirname(reportPath), { recursive: true })
		await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
		console.log(JSON.stringify({ ...report.summary, reportPath, mode: report.mode }, null, 2))
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
