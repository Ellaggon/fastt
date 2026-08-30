# Pricing Bulk Jobs Operations

`/api/cron/pricing-bulk-jobs` is a protected recovery scheduler for durable pricing jobs.
On the current Vercel Hobby plan it is intentionally scheduled once per day, because sub-daily
Vercel Cron schedules fail deployment. Production installations that require near-real-time bulk
pricing must invoke this same endpoint from an authenticated external scheduler or upgrade the
Vercel plan; the worker lease makes duplicate invocations safe.
