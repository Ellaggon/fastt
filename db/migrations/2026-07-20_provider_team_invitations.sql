ALTER TABLE "ProviderUser" ADD COLUMN "permissionsJson" TEXT;

CREATE TABLE IF NOT EXISTS "ProviderInvitation" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"email" TEXT NOT NULL,
	"role" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"invitedBy" TEXT NOT NULL REFERENCES "User" ("id"),
	"acceptedAt" INTEGER,
	"expiresAt" INTEGER NOT NULL,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS "ProviderInvitation_providerId_status_idx" ON "ProviderInvitation" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderInvitation_providerId_email_idx" ON "ProviderInvitation" ("providerId", "email");
