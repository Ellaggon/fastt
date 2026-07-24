-- S4-1: tokenized provider invitation accept
ALTER TABLE "ProviderInvitation" ADD COLUMN IF NOT EXISTS "token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderInvitation_token_unique" ON "ProviderInvitation" ("token");
