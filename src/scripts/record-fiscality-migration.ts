/** Records the accountable completion of the idempotent fiscality data migration. */
import { writeFiscalActivity } from "@/lib/taxes-fees/fiscal-activity"

const providerId = process.argv.find((value) => value.startsWith("--provider="))?.slice(11)
const actorUserId = process.argv.find((value) => value.startsWith("--actor="))?.slice(8)
if (!providerId || !actorUserId)
	throw new Error("Use --provider=provider_id --actor=user_id after applying fiscal migrations")
await writeFiscalActivity({
	providerId,
	actorUserId,
	eventType: "fiscality_migration_completed",
	result: "succeeded",
	riskLevel: "high",
	context: { migration: "20260811_fiscality_closure", snapshotsPreserved: true },
})
console.log(JSON.stringify({ recorded: true, providerId }))
