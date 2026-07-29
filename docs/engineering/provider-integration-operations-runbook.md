# Provider Integration Operations Runbook

Last updated: 2026-07-28

## Scope

This runbook owns operational retention, query performance and metrics for:

- `ProviderExternalCalendarEvent`
- `ProviderIntegrationSyncJob`
- `ProviderIntegrationSyncRun`
- `ProviderIntegrationIncident`

Configuration, credentials, mappings, calendars, conflicts and exports are not
purged by this process.

## Retention policy

| Data                      |           Default retention | Reason                                                            |
| ------------------------- | --------------------------: | ----------------------------------------------------------------- |
| Inactive calendar events  |  30 days after `lastSeenAt` | Short reconciliation window after a feed removes an event         |
| Ended calendar events     |    180 days after `endDate` | Keeps recent operational history without unbounded inventory data |
| Successful/cancelled runs |  90 days after `finishedAt` | Routine execution history                                         |
| Failed/partial runs       | 180 days after `finishedAt` | Longer investigation and incident-correlation window              |
| Successful jobs           |  14 days after `finishedAt` | Queue records are transport state, not the durable ledger         |
| Failed jobs               |  90 days after `finishedAt` | Retry and terminal-failure diagnosis                              |

The purge never deletes:

- active or future events inside the ended-event window;
- queued or running jobs;
- running runs;
- incidents, conflicts, connection configuration or credentials.

Each category deletes at most `PROVIDER_INTEGRATION_PURGE_BATCH_SIZE` rows per
execution using `FOR UPDATE SKIP LOCKED`. This bounds locks and allows the next
daily run to continue a backlog.

The cron entrypoint is `/api/cron/provider-integration-maintenance`, protected by
`CRON_SECRET`. Retention values can be overridden through the
`PROVIDER_INTEGRATION_*_RETENTION_DAYS` variables documented in `.env.example`.

## Query indexes

| Operation                          | Index                                                     |
| ---------------------------------- | --------------------------------------------------------- |
| Claim queued work                  | `ProviderIntegrationSyncJob_claim_due_idx`                |
| Find due calendars                 | `ProviderExternalCalendar_due_sync_idx`                   |
| Active events by variant           | `ProviderExternalCalendarEvent_variant_active_range_idx`  |
| Active events by physical resource | `ProviderExternalCalendarEvent_resource_active_range_idx` |
| Open incidents                     | `ProviderIntegrationIncident_open_last_seen_idx`          |
| Latest runs by connection          | `ProviderIntegrationSyncRun_connection_started_idx`       |
| Terminal retention                 | `*_terminal_retention_idx` and event retention indexes    |

The job, calendar and event indexes are partial where the query has a stable
state predicate. Do not add equivalent full indexes unless an observed query
needs the excluded rows.

Job claiming first builds a bounded, priority-ordered candidate set, then applies
the per-provider rank. `FOR UPDATE SKIP LOCKED` is applied only to the final
batch, not every candidate. It never runs the fairness window over the complete
due queue. The candidate set is capped at 4,000 rows even at maximum settings.

Under concurrent claims, a worker may see candidates that another worker locks
first. The claim service performs at most three short rounds to refresh that
snapshot and fill the remaining batch. Already claimed rows have `status =
running`, so they cannot be returned twice.

## EXPLAIN ANALYZE baseline

Measured against Supabase before the performance migration:

| Query                     | Rows in table | Execution | Observation                                   |
| ------------------------- | ------------: | --------: | --------------------------------------------- |
| Claim jobs                |             0 |  0.117 ms | Dataset too small to assess selectivity       |
| Due calendars             |             0 |  0.099 ms | Dataset too small to assess selectivity       |
| Active events             |             0 |  0.032 ms | Sequential scan is expected on an empty table |
| Open incidents            |             1 |  0.190 ms | Existing provider/status index used           |
| Latest runs by connection |             2 |  0.051 ms | Sequential scan is cheaper at this size       |

These values are a correctness baseline, not a capacity benchmark. PostgreSQL
will prefer sequential scans for tiny relations. Re-run the same query shapes
after material growth and inspect `actual rows`, buffers and sort spill before
adding another index.

The reproducible temporary-table benchmark
(`pnpm run db:explain:provider-integrations`) loaded 440,000 rows and produced:

| Query                                       |  Execution | Result                               |
| ------------------------------------------- | ---------: | ------------------------------------ |
| Claim 20 jobs from 100,000                  | 260.194 ms | Full batch; partial claim index + PK |
| Due calendars from 20,000                   |  13.296 ms | Partial due index                    |
| Active variant/resource events from 200,000 |  43.532 ms | Partial resource range index         |
| Open incidents from 20,000                  |  12.841 ms | Partial open-incident index          |
| Latest runs from 100,000                    |   7.702 ms | Connection/start index               |

The original unbounded job rank took 751.305 ms on the same dataset. Bounding
the fairness window reduced it by about 65% while still filling the 20-job
batch. The benchmark uses session-local temporary tables and leaves no data.

## Prometheus metrics

Database-backed gauges are refreshed whenever
`/api/internal/observability/prometheus` is scraped:

- `provider_integration_queue_depth{target_type}`
- `provider_integration_queue_oldest_age_seconds{target_type}`
- `provider_integration_queue_retry_jobs{target_type}`
- `provider_integration_queue_retry_attempts{target_type}`
- `provider_integration_consecutive_failures_max{entity_type}`
- `provider_integration_consecutive_failures_entities{entity_type}`
- `provider_external_calendar_events{provider_id,calendar_id,state}`
- `provider_integration_open_incidents{severity}`
- `provider_integration_run_duration_average_ms{connector_key}`
- `provider_integration_run_duration_p95_ms{connector_key}`

Process counters/timings supplement the database gauges:

- `provider_integration_jobs_claimed_total`
- `provider_integration_job_queue_latency_ms`
- `provider_integration_job_retries_total`
- `provider_integration_job_attempt_failures_total`
- `provider_integration_jobs_completed_total`
- `provider_integration_purged_rows_total`
- `provider_integration_purge_duration_ms`

Recommended initial alerts:

- queue oldest age greater than twice the scheduler interval;
- any queue depth growing for three consecutive scrapes;
- consecutive failures at or above 3;
- terminal job failures above 0 for 15 minutes;
- `provider_integration_operational_metrics_collection_error = 1`.

Calendar labels use immutable IDs rather than names or URLs. This avoids leaking
feed data, while still providing the requested per-calendar event volume.
