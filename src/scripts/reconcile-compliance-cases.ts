import {
	publishComplianceOutbox,
	reconcileComplianceCases,
} from "@/lib/casework/compliance-casework"

const reconciliation = await reconcileComplianceCases()
const outbox = await publishComplianceOutbox({ limit: 250, workerId: "manual-reconciliation" })
console.log(JSON.stringify({ reconciliation, outbox }, null, 2))
