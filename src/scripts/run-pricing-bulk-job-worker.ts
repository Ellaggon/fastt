import { runPricingBulkJobWorker } from "@/lib/pricing/pricing-bulk-job-worker"

const result = await runPricingBulkJobWorker()
console.log(JSON.stringify(result, null, 2))
