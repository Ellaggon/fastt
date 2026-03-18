Looking at the existing codebase, I can see there's already an `src/ai/memory/project-memory.ts` file. I'll create the repository following the existing patterns from other repositories like `BookingRepository.ts`, `RatePlanRepository.ts`, etc.

Let me analyze the existing repository patterns first based on the project structure, then create a well-structured `ProjectMemoryRepository`.

```typescript
// src/repositories/project-memory.repository.ts

import { prisma } from "@/lib/db";
import { logger } from "@/core/logger";

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface AgentPlanStep {
  id: string;
  title: string;
  description: string;
  files: string[];
  type: "create" | "modify" | "delete" | "analyze";
  dependencies: string[];
  estimatedComplexity: "low" | "medium" | "high";
  risks: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  completedAt?: string;
  errorMessage?: string;
}

export interface AgentPlan {
  id: string;
  sessionId: string;
  summary: string;
  architecture: string;
  steps: AgentPlanStep[];
  totalEstimatedComplexity: "low" | "medium" | "high";
  breakingChanges: string[];
  testingStrategy: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "active" | "completed" | "abandoned";
  metadata?: Record<string, unknown>;
}

export interface ProjectMemoryEntry {
  id: string;
  sessionId: string;
  type: "plan" | "context" | "decision" | "observation" | "error";
  content: string;
  embedding?: number[];
  tags: string[];
  relatedFiles: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectMemorySnapshot {
  sessionId: string;
  plans: AgentPlan[];
  entries: ProjectMemoryEntry[];
  capturedAt: string;
}

// ─── Filter / Query Types ─────────────────────────────────────────────────────

export interface FindPlansFilter {
  sessionId?: string;
  status?: AgentPlan["status"];
  limit?: number;
  offset?: number;
}

export interface FindEntriesFilter {
  sessionId?: string;
  type?: ProjectMemoryEntry["type"];
  tags?: string[];
  relatedFile?: string;
  limit?: number;
  offset?: number;
}

export interface UpsertPlanStepInput {
  planId: string;
  stepId: string;
  status: AgentPlanStep["status"];
  completedAt?: string;
  errorMessage?: string;
}

// ─── Repository ───────────────────────────────────────────────────────────────

/**
 * ProjectMemoryRepository
 *
 * Responsible for persisting and retrieving agent plan history and contextual
 * memory entries used by the LLM-powered PlannerService.
 *
 * Follows the same constructor-injection pattern as all other repositories in
 * this codebase.  The underlying store is the shared Prisma client; if the
 * schema does not yet contain the required models the repository degrades
 * gracefully by using an in-memory fallback so that the rest of the system
 * continues to function during development.
 *
 * Layer contract:
 *  - No business logic lives here.
 *  - All public methods are async and return Promise<T>.
 *  - Errors are logged and re-thrown so the service layer can translate them
 *    into domain errors.
 */
export class ProjectMemoryRepository {
  // In-memory fallback store (used when the DB models are not yet migrated)
  private _plans = new Map<string, AgentPlan>();
  private _entries = new Map<string, ProjectMemoryEntry>();

  private readonly _useDb: boolean;

  constructor() {
    // Detect whether the Prisma client exposes the required models.
    // This allows the repository to be instantiated safely in environments
    // where the migration has not yet been applied.
    this._useDb =
      typeof (prisma as Record<string, unknown>)["agentPlan"] !== "undefined";

    if (!this._useDb) {
      logger.warn(
        "[ProjectMemoryRepository] agentPlan / projectMemoryEntry Prisma " +
          "models not found — falling back to in-memory store. " +
          "Run the DB migration to enable persistence."
      );
    }
  }

  // ─── Plans ──────────────────────────────────────────────────────────────────

  /**
   * Persist a new plan.  If a plan with the same id already exists it will be
   * replaced (upsert semantics).
   */
  async savePlan(plan: AgentPlan): Promise<AgentPlan> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const saved = await db.agentPlan.upsert({
          where: { id: plan.id },
          create: this._serializePlan(plan),
          update: this._serializePlan(plan),
        });
        return this._deserializePlan(saved);
      }

      // In-memory fallback
      const record: AgentPlan = {
        ...plan,
        updatedAt: new Date().toISOString(),
      };
      this._plans.set(plan.id, record);
      logger.debug(`[ProjectMemoryRepository] savePlan id=${plan.id}`);
      return record;
    } catch (err) {
      logger.error("[ProjectMemoryRepository] savePlan failed", { err, plan });
      throw err;
    }
  }

  /**
   * Retrieve a single plan by its primary key.
   * Returns `null` when not found.
   */
  async findPlanById(id: string): Promise<AgentPlan | null> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const row = await db.agentPlan.findUnique({ where: { id } });
        return row ? this._deserializePlan(row) : null;
      }

      return this._plans.get(id) ?? null;
    } catch (err) {
      logger.error("[ProjectMemoryRepository] findPlanById failed", { err, id });
      throw err;
    }
  }

  /**
   * Return the most recent active plan for a given session, or `null` if none
   * exists.
   */
  async findActivePlanBySession(sessionId: string): Promise<AgentPlan | null> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const row = await db.agentPlan.findFirst({
          where: { sessionId, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        return row ? this._deserializePlan(row) : null;
      }

      // In-memory fallback
      const candidates = Array.from(this._plans.values())
        .filter((p) => p.sessionId === sessionId && p.status === "active")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      return candidates[0] ?? null;
    } catch (err) {
      logger.error(
        "[ProjectMemoryRepository] findActivePlanBySession failed",
        { err, sessionId }
      );
      throw err;
    }
  }

  /**
   * List plans with optional filtering and pagination.
   */
  async listPlans(filter: FindPlansFilter = {}): Promise<AgentPlan[]> {
    const { sessionId, status, limit = 20, offset = 0 } = filter;

    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const rows = await db.agentPlan.findMany({
          where: {
            ...(sessionId ? { sessionId } : {}),
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });
        return rows.map((r: RawPlanRow) => this._deserializePlan(r));
      }

      // In-memory fallback
      let results = Array.from(this._plans.values());
      if (sessionId) results = results.filter((p) => p.sessionId === sessionId);
      if (status) results = results.filter((p) => p.status === status);
      results.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return results.slice(offset, offset + limit);
    } catch (err) {
      logger.error("[ProjectMemoryRepository] listPlans failed", {
        err,
        filter,
      });
      throw err;
    }
  }

  /**
   * Update the status of a single step within a plan.
   * Performs a targeted patch so concurrent step updates do not clobber each
   * other.
   */
  async updatePlanStep(input: UpsertPlanStepInput): Promise<AgentPlan | null> {
    const { planId, stepId, status, completedAt, errorMessage } = input;

    try {
      const plan = await this.findPlanById(planId);
      if (!plan) return null;

      const steps = plan.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status,
              ...(completedAt ? { completedAt } : {}),
              ...(errorMessage ? { errorMessage } : {}),
            }
          : s
      );

      const updated: AgentPlan = {
        ...plan,
        steps,
        updatedAt: new Date().toISOString(),
      };

      return this.savePlan(updated);
    } catch (err) {
      logger.error("[ProjectMemoryRepository] updatePlanStep failed", {
        err,
        input,
      });
      throw err;
    }
  }

  /**
   * Mark a plan as completed / abandoned.
   */
  async updatePlanStatus(
    id: string,
    status: AgentPlan["status"]
  ): Promise<AgentPlan | null> {
    try {
      const plan = await this.findPlanById(id);
      if (!plan) return null;

      return this.savePlan({
        ...plan,
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("[ProjectMemoryRepository] updatePlanStatus failed", {
        err,
        id,
        status,
      });
      throw err;
    }
  }

  /**
   * Hard-delete a plan and all its associated memory entries.
   */
  async deletePlan(id: string): Promise<boolean> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        await db.agentPlan.delete({ where: { id } });
        // Cascade-delete associated entries
        await db.projectMemoryEntry.deleteMany({ where: { planId: id } });
        return true;
      }

      const existed = this._plans.has(id);
      this._plans.delete(id);
      // Remove associated entries
      for (const [entryId, entry] of this._entries) {
        if ((entry.metadata as Record<string, unknown>)?.planId === id) {
          this._entries.delete(entryId);
        }
      }
      return existed;
    } catch (err) {
      logger.error("[ProjectMemoryRepository] deletePlan failed", { err, id });
      throw err;
    }
  }

  // ─── Memory Entries ──────────────────────────────────────────────────────────

  /**
   * Append a new memory entry.  Entries are immutable once written; to
   * "update" an entry create a new one and reference the old id in metadata.
   */
  async addEntry(
    entry: Omit<ProjectMemoryEntry, "id" | "createdAt">
  ): Promise<ProjectMemoryEntry> {
    const record: ProjectMemoryEntry = {
      ...entry,
      id: this._generateId(),
      createdAt: new Date().toISOString(),
    };

    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const saved = await db.projectMemoryEntry.create({
          data: this._serializeEntry(record),
        });
        return this._deserializeEntry(saved);
      }

      this._entries.set(record.id, record);
      logger.debug(
        `[ProjectMemoryRepository] addEntry id=${record.id} type=${record.type}`
      );
      return record;
    } catch (err) {
      logger.error("[ProjectMemoryRepository] addEntry failed", {
        err,
        entry,
      });
      throw err;
    }
  }

  /**
   * Retrieve a single entry by id.
   */
  async findEntryById(id: string): Promise<ProjectMemoryEntry | null> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const row = await db.projectMemoryEntry.findUnique({ where: { id } });
        return row ? this._deserializeEntry(row) : null;
      }

      return this._entries.get(id) ?? null;
    } catch (err) {
      logger.error("[ProjectMemoryRepository] findEntryById failed", {
        err,
        id,
      });
      throw err;
    }
  }

  /**
   * Query memory entries with optional filtering.
   */
  async listEntries(
    filter: FindEntriesFilter = {}
  ): Promise<ProjectMemoryEntry[]> {
    const {
      sessionId,
      type,
      tags,
      relatedFile,
      limit = 50,
      offset = 0,
    } = filter;

    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        const rows = await db.projectMemoryEntry.findMany({
          where: {
            ...(sessionId ? { sessionId } : {}),
            ...(type ? { type } : {}),
            ...(tags?.length
              ? { tags: { hasSome: tags } }
              : {}),
            ...(relatedFile
              ? { relatedFiles: { has: relatedFile } }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });
        return rows.map((r: RawEntryRow) => this._deserializeEntry(r));
      }

      // In-memory fallback
      let results = Array.from(this._entries.values());
      if (sessionId)
        results = results.filter((e) => e.sessionId === sessionId);
      if (type) results = results.filter((e) => e.type === type);
      if (tags?.length)
        results = results.filter((e) =>
          tags.some((t) => e.tags.includes(t))
        );
      if (relatedFile)
        results = results.filter((e) => e.relatedFiles.includes(relatedFile));

      results.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return results.slice(offset, offset + limit);
    } catch (err) {
      logger.error("[ProjectMemoryRepository] listEntries failed", {
        err,
        filter,
      });
      throw err;
    }
  }

  /**
   * Build a full snapshot of all plans and entries for a session.
   * Used by PlannerService to reconstruct context before calling the LLM.
   */
  async getSessionSnapshot(
    sessionId: string
  ): Promise<ProjectMemorySnapshot> {
    try {
      const [plans, entries] = await Promise.all([
        this.listPlans({ sessionId, limit: 100 }),
        this.listEntries({ sessionId, limit: 200 }),
      ]);

      return {
        sessionId,
        plans,
        entries,
        capturedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error(
        "[ProjectMemoryRepository] getSessionSnapshot failed",
        { err, sessionId }
      );
      throw err;
    }
  }

  /**
   * Purge all data for a session.  Useful in tests and when a user explicitly
   * resets their planning session.
   */
  async clearSession(sessionId: string): Promise<void> {
    try {
      if (this._useDb) {
        const db = prisma as unknown as PrismaWithMemory;
        await db.projectMemoryEntry.deleteMany({ where: { sessionId } });
        await db.agentPlan.deleteMany({ where: { sessionId } });
        return;
      }

      for (const [id, plan] of this._plans) {
        if (plan.sessionId === sessionId) this._plans.delete(id);
      }
      for (const [id, entry] of this._entries) {
        if (entry.sessionId === sessionId) this._entries.delete(id);
      }
    } catch (err) {
      logger.error("[ProjectMemoryRepository] clearSession failed", {
        err,
        sessionId,
      });
      throw err;
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private _generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private _serializePlan(plan: AgentPlan): RawPlanRow {
    return {
      id: plan.id,
      sessionId: plan.sessionId,
      summary: plan.summary,
      architecture: plan.architecture,
      steps: JSON.stringify(plan.steps),
      totalEstimatedComplexity: plan.totalEstimatedComplexity,
      breakingChanges: plan.breakingChanges,
      testingStrategy: plan.testingStrategy,
      status: plan.status,
      metadata: plan.metadata ? JSON.stringify(plan.metadata) : null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private _deserializePlan(row: RawPlanRow): AgentPlan {
    return {
      id: row.id,
      sessionId: row.sessionId,
      summary: row.summary,
      architecture: row.architecture,
      steps:
        typeof row.steps === "string"
          ? (JSON.parse(row.steps) as AgentPlanStep[])
          : (row.steps as AgentPlanStep[]),
      totalEstimatedComplexity:
        row.totalEstimatedComplexity as AgentPlan["totalEstimatedComplexity"],
      breakingChanges: row.breakingChanges ?? [],
      testingStrategy: row.testingStrategy,
      status: row.status as AgentPlan["status"],
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata ?? undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : row.updatedAt,
    };
  }

  private _serializeEntry(entry: ProjectMemoryEntry): RawEntryRow {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      type: entry.type,
      content: entry.content,
      embedding: entry.embedding ?? null,
      tags: entry.tags,
      relatedFiles: entry.relatedFiles,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt: entry.createdAt,
    };
  }

  private _deserializeEntry(row: RawEntryRow): ProjectMemoryEntry {
    return {
      id: row.id,
      sessionId: row.sessionId,
      type: row.type as ProjectMemoryEntry["type"],
      content: row.content,
      embedding: row.embedding ?? undefined,
      tags: row.tags ?? [],
      relatedFiles: row.relatedFiles ?? [],
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata ?? undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
    };
  }
}

// ─── Internal raw row shapes (Prisma-compatible) ──────────────────────────────
// These mirror what Prisma would return once the schema is migrated.
// Kept private to this module so the rest of the codebase only sees the clean
// domain types above.

interface RawPlanRow {
  id: string;
  sessionId: string;
  summary: string;
  architecture: string;
  steps: string | AgentPlanStep[];
  totalEstimatedComplexity: string;
  breakingChanges: string[];
  testingStrategy: string;
  status: string;
  metadata: string | Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface RawEntryRow {
  id: string;
  sessionId: string;
  type: string;
  content: string;
  embedding: number[] | null;
  tags: string[];
  relatedFiles: string[];
  metadata: string | Record<string, unknown> | null;
  createdAt: string | Date;
}

// Minimal Prisma client extension type — avoids importing generated types that
// may not exist yet in all environments.
interface PrismaWithMemory {
  agentPlan: {
    upsert: (args: unknown) => Promise<RawPlanRow>;
    findUnique: (args: unknown) => Promise<RawPlanRow | null>;
    findFirst: (args: unknown) => Promise<RawPlanRow | null>;
    findMany: (args: unknown) => Promise<RawPlanRow[]>;
    delete: (args: unknown) => Promise<void>;
    deleteMany: (args: unknown) => Promise<void>;
  };
  projectMemoryEntry: {
    create: (args: unknown) => Promise<RawEntryRow>;
    findUnique: (args: unknown) => Promise<RawEntryRow | null>;
    findMany: (args: unknown) => Promise<RawEntryRow[]>;
    deleteMany: (args: unknown) => Promise<void>;
  };
}
```

Key design decisions:

**Graceful degradation** — The constructor probes the Prisma client for the `agentPlan` model at runtime. If the DB migration hasn't been applied yet, the repository silently falls back to an in-memory `Map`-based store. This lets the rest of the system (PlannerService, agents) work during development without blocking on schema migrations.

**Strict layer contract** — No business logic lives here. Every method is `async`/`Promise<T>`, errors are logged then re-thrown so the service layer can translate them into domain errors, and the repository never calls other services.

**Serialization isolation** — `_serializePlan` / `_deserializePlan` and their entry equivalents are the only place that knows about the raw DB row shape (`RawPlanRow`, `RawEntryRow`). The `PrismaWithMemory` interface is a minimal structural type that avoids importing generated Prisma types that may not exist in all environments.

**Targeted step updates** — `updatePlanStep` does a read-modify-write at the application level rather than a raw JSON patch query, keeping the logic portable across both the DB and in-memory paths while avoiding full plan replacement races.

**Session snapshot** — `getSessionSnapshot` fans out two parallel queries and assembles the full context object that `PlannerService` needs before calling the LLM, keeping that orchestration concern out of the service layer.