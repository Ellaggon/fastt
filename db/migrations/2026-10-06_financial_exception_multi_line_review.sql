-- G10: financial exception codes are vertical-neutral. The lodging-specific
-- "multi_room_review" is retired in favour of "multi_line_review"; the application reads
-- the legacy value as an alias, this migration converges persisted rows.
UPDATE "FinancialExceptionRecord"
SET "code" = 'multi_line_review',
    "updatedAt" = now()
WHERE "code" = 'multi_room_review';
