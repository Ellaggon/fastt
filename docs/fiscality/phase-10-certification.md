# Fiscality closure certification

## Data migration

1. Run the Phase 0 audit for every provider and retain the JSON output.
2. Remediate duplicate active assignments before applying the unique index.
3. Apply migrations in order. `20260811_fiscality_closure.sql` creates only missing v1 records and never rewrites snapshots.
4. Record the migration operator and timestamp with `pnpm exec tsx src/scripts/record-fiscality-migration.ts --provider=... --actor=...`.

## Functional certification

- Draft -> simulate -> publish -> assign.
- Inheritance, direct override, future start and expiry.
- Search -> hold -> booking -> receipt; refund -> fiscal reversal -> document.
- Channel preflight -> send -> confirmation / idempotent retry.
- CSV/JSON export and reconciliation resolution.
- Read, manage, publish, approve and export permissions.

## UX certification

- Keyboard navigation and visible focus at 390, 768, 1280 and 1440 px.
- Responsive tables, long labels, loading/error/empty states, contrast and large datasets.
- Verify no legacy assistant, nominal route or disconnected reports surface remains.
