Looking at the plan, I need to create `src/services/coder.service.ts` - a proper service class that extracts coder agent logic with dependency injection, typed interfaces, and clean separation of concerns.

Let me first examine the existing coder agent and related files to understand the current implementation.

```typescript
// src/services/coder.service.ts

import type { LLMService } from "./llm.service";
import type { ProjectMemoryRepository } from "../repositories/project-memory.repository";
import type { Logger } from "../core/logger";
import type { EventBus } from "../core/event-bus";
import type {
  CoderInput,
  CoderOutput,
  CoderServiceConfig,
  FileEdit,
  CodeReviewResult,
} from "../types/agent.types";
import type { LLMMessage } from "../types/llm.types";
import type { ProjectMap } from "../types/project.types";
import { CoderError, ValidationError } from "../types/errors.types";

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CoderServiceConfig = {
  maxRetries: 2,
  model: "primary",
  maxTokens: 8192,
  temperature: 0.2,
  enableReview: true,
  reviewModel: "secondary",
};

// ---------------------------------------------------------------------------
// CoderService
// ---------------------------------------------------------------------------

/**
 * CoderService owns all prompt construction, LLM interaction, and response
 * parsing for the "coder" agent role.  It is injected with an LLMService so
 * that model routing, retries, and circuit-breaking are handled externally.
 *
 * Usage:
 *   const coder = container.resolve<CoderService>("CoderService");
 *   const result = await coder.implement(plan, projectMap);
 */
export class CoderService {
  private readonly config: CoderServiceConfig;

  constructor(
    private readonly llm: LLMService,
    private readonly memory: ProjectMemoryRepository,
    private readonly logger: Logger,
    private readonly events: EventBus,
    config: Partial<CoderServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Implement a planner-produced plan by generating or editing source files.
   */
  async implement(input: CoderInput): Promise<CoderOutput> {
    const correlationId = input.correlationId ?? crypto.randomUUID();
    const log = this.logger.child({ service: "CoderService", correlationId });

    log.info({ planSteps: input.plan.steps.length }, "Starting implementation");

    // 1. Enrich context from project memory
    const projectMap = await this.resolveProjectMap(input, log);

    // 2. Build the prompt messages
    const messages = this.buildMessages(input, projectMap);

    // 3. Call the LLM (with retry handled inside LLMService)
    let rawResponse: string;
    try {
      rawResponse = await this.llm.complete({
        messages,
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        correlationId,
      });
    } catch (err) {
      throw new CoderError(
        "LLM call failed during implementation",
        { correlationId, cause: err }
      );
    }

    // 4. Parse the structured response
    const edits = this.parseEdits(rawResponse, correlationId);

    // 5. Optional self-review pass
    let review: CodeReviewResult | undefined;
    if (this.config.enableReview && edits.length > 0) {
      review = await this.reviewEdits(edits, input, correlationId, log);
    }

    // 6. Persist to memory so subsequent agents can reference the output
    await this.memory.saveCoderOutput(correlationId, { edits, review });

    // 7. Emit completion event for observability / cache invalidation
    this.events.emit("coder.completed", {
      correlationId,
      filesChanged: edits.map((e) => e.path),
      reviewPassed: review?.passed ?? true,
    });

    log.info(
      { filesChanged: edits.length, reviewPassed: review?.passed },
      "Implementation complete"
    );

    return {
      correlationId,
      edits,
      review,
      rawResponse,
    };
  }

  /**
   * Perform a standalone review of already-generated edits without re-coding.
   */
  async review(
    edits: FileEdit[],
    context: string,
    correlationId: string
  ): Promise<CodeReviewResult> {
    const log = this.logger.child({ service: "CoderService", correlationId });
    log.info({ files: edits.length }, "Running standalone review");

    return this.reviewEdits(edits, { context } as CoderInput, correlationId, log);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async resolveProjectMap(
    input: CoderInput,
    log: Logger
  ): Promise<ProjectMap | null> {
    if (input.projectMap) {
      return input.projectMap;
    }

    try {
      return await this.memory.getProjectMap();
    } catch (err) {
      // Non-fatal: coder can still operate without the full project map
      log.warn({ err }, "Could not load project map from memory; continuing without it");
      return null;
    }
  }

  private buildMessages(
    input: CoderInput,
    projectMap: ProjectMap | null
  ): LLMMessage[] {
    const messages: LLMMessage[] = [
      { role: "system", content: this.buildSystemPrompt(projectMap) },
      { role: "user", content: this.buildUserPrompt(input) },
    ];

    // Inject prior conversation turns when re-running after a review failure
    if (input.priorMessages && input.priorMessages.length > 0) {
      // Insert prior turns between system and the new user message
      messages.splice(1, 0, ...input.priorMessages);
    }

    return messages;
  }

  private buildSystemPrompt(projectMap: ProjectMap | null): string {
    const projectContext = projectMap
      ? this.formatProjectMap(projectMap)
      : "No project map available.";

    return `You are an expert software engineer implementing tasks for a production OTA (Online Travel Agency) platform.

## Your responsibilities
- Write clean, idiomatic TypeScript that follows the existing architecture.
- Respect existing patterns: repository → service → API route layering.
- Never introduce breaking changes to public interfaces without explicit instruction.
- Prefer small, focused edits over large rewrites.
- Always include necessary imports and export statements.

## Project structure
${projectContext}

## Output format
Respond ONLY with a JSON array of file edits. Each edit must conform to:
\`\`\`json
[
  {
    "path": "src/path/to/file.ts",
    "operation": "create" | "update" | "delete",
    "content": "<full file content as a string, or null for delete>"
  }
]
\`\`\`

Do not include any prose outside the JSON block.`;
  }

  private buildUserPrompt(input: CoderInput): string {
    const stepsList = input.plan.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");

    const contextSection = input.context
      ? `\n## Additional context\n${input.context}\n`
      : "";

    const constraintsSection =
      input.plan.constraints && input.plan.constraints.length > 0
        ? `\n## Constraints\n${input.plan.constraints.map((c) => `- ${c}`).join("\n")}\n`
        : "";

    const targetFilesSection =
      input.plan.targetFiles && input.plan.targetFiles.length > 0
        ? `\n## Target files\n${input.plan.targetFiles.map((f) => `- ${f}`).join("\n")}\n`
        : "";

    return `## Task
${input.plan.description}

## Steps
${stepsList}
${contextSection}${constraintsSection}${targetFilesSection}
Implement the above plan now.`;
  }

  private formatProjectMap(map: ProjectMap): string {
    const sections: string[] = [];

    for (const [category, files] of Object.entries(map)) {
      if (Array.isArray(files) && files.length > 0) {
        sections.push(`### ${category}\n${files.map((f) => `- ${f}`).join("\n")}`);
      }
    }

    return sections.join("\n\n");
  }

  /**
   * Parse the raw LLM response into typed FileEdit objects.
   * Handles both bare JSON arrays and markdown-fenced code blocks.
   */
  private parseEdits(raw: string, correlationId: string): FileEdit[] {
    const log = this.logger.child({ service: "CoderService", correlationId });

    // Strip markdown fences if present
    const jsonMatch =
      raw.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      raw.match(/(\[[\s\S]*\])/);

    const jsonString = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      log.error({ raw: raw.slice(0, 500), err }, "Failed to parse coder JSON output");
      throw new CoderError("Coder output is not valid JSON", {
        correlationId,
        cause: err,
        rawSnippet: raw.slice(0, 500),
      });
    }

    if (!Array.isArray(parsed)) {
      throw new ValidationError("Coder output must be a JSON array", {
        correlationId,
      });
    }

    return parsed.map((item, index) =>
      this.validateAndNormalizeEdit(item, index, correlationId)
    );
  }

  private validateAndNormalizeEdit(
    raw: unknown,
    index: number,
    correlationId: string
  ): FileEdit {
    if (typeof raw !== "object" || raw === null) {
      throw new ValidationError(`Edit at index ${index} is not an object`, {
        correlationId,
      });
    }

    const edit = raw as Record<string, unknown>;

    if (typeof edit.path !== "string" || edit.path.trim() === "") {
      throw new ValidationError(
        `Edit at index ${index} is missing a valid "path" field`,
        { correlationId }
      );
    }

    const validOperations = ["create", "update", "delete"] as const;
    type Operation = (typeof validOperations)[number];

    const operation: Operation = validOperations.includes(
      edit.operation as Operation
    )
      ? (edit.operation as Operation)
      : "update"; // default to update for backwards compatibility

    if (operation !== "delete" && typeof edit.content !== "string") {
      throw new ValidationError(
        `Edit at index ${index} (${edit.path}) must have a string "content" for operation "${operation}"`,
        { correlationId }
      );
    }

    return {
      path: edit.path.trim(),
      operation,
      content: operation === "delete" ? null : (edit.content as string),
    };
  }

  private async reviewEdits(
    edits: FileEdit[],
    input: Pick<CoderInput, "context" | "plan">,
    correlationId: string,
    log: Logger
  ): Promise<CodeReviewResult> {
    log.info({ files: edits.length }, "Running self-review pass");

    const reviewPrompt = this.buildReviewPrompt(edits, input);

    let rawReview: string;
    try {
      rawReview = await this.llm.complete({
        messages: [
          { role: "system", content: this.buildReviewSystemPrompt() },
          { role: "user", content: reviewPrompt },
        ],
        model: this.config.reviewModel ?? this.config.model,
        maxTokens: 2048,
        temperature: 0.1,
        correlationId,
      });
    } catch (err) {
      // Review failure is non-fatal — log and return a neutral result
      log.warn({ err }, "Review LLM call failed; skipping review");
      return { passed: true, issues: [], skipped: true };
    }

    return this.parseReviewResult(rawReview, correlationId, log);
  }

  private buildReviewSystemPrompt(): string {
    return `You are a senior code reviewer for a production OTA platform.
Evaluate the provided code edits for correctness, security, and adherence to the project's architecture.

Respond ONLY with a JSON object:
\`\`\`json
{
  "passed": true | false,
  "issues": [
    { "severity": "error" | "warning" | "info", "file": "path/to/file.ts", "message": "description" }
  ]
}
\`\`\``;
  }

  private buildReviewPrompt(
    edits: FileEdit[],
    input: Pick<CoderInput, "context" | "plan">
  ): string {
    const editSummary = edits
      .map(
        (e) =>
          `### ${e.path} (${e.operation})\n\`\`\`typescript\n${
            e.content?.slice(0, 3000) ?? "(deleted)"
          }\n\`\`\``
      )
      .join("\n\n");

    const taskDescription = input.plan?.description ?? input.context ?? "No description provided.";

    return `## Task that was implemented
${taskDescription}

## Generated edits
${editSummary}

Review the above edits for issues.`;
  }

  private parseReviewResult(
    raw: string,
    correlationId: string,
    log: Logger
  ): CodeReviewResult {
    const jsonMatch =
      raw.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      raw.match(/(\{[\s\S]*\})/);

    const jsonString = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    try {
      const parsed = JSON.parse(jsonString) as {
        passed: boolean;
        issues?: Array<{
          severity: "error" | "warning" | "info";
          file: string;
          message: string;
        }>;
      };

      return {
        passed: Boolean(parsed.passed),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        skipped: false,
      };
    } catch (err) {
      log.warn({ err, raw: raw.slice(0, 300) }, "Could not parse review JSON; treating as passed");
      return { passed: true, issues: [], skipped: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory helper (used by DI container bootstrap)
// ---------------------------------------------------------------------------

export function createCoderService(
  llm: LLMService,
  memory: ProjectMemoryRepository,
  logger: Logger,
  events: EventBus,
  config?: Partial<CoderServiceConfig>
): CoderService {
  return new CoderService(llm, memory, logger, events, config);
}
```

Now let me create the supporting type files that `CoderService` depends on:

```typescript
// src/types/agent.types.ts

import type { LLMMessage } from "./llm.types";
import type { ProjectMap } from "./project.types";

// ---------------------------------------------------------------------------
// Shared agent primitives
// ---------------------------------------------------------------------------

export interface AgentPlan {
  /** Human-readable summary of what needs to be done. */
  description: string;
  /** Ordered implementation steps. */
  steps: string[];
  /** Hard constraints the coder must respect. */
  constraints?: string[];
  /** Explicit list of files the plan targets (optional hint). */
  targetFiles?: string[];
  /** Arbitrary metadata attached by the planner. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CoderService types
// ---------------------------------------------------------------------------

export interface CoderInput {
  /** Unique identifier shared across the full agent run. */
  correlationId?: string;
  /** The plan produced by PlannerService. */
  plan: AgentPlan;
  /** Free-form additional context (e.g. user request, diff, error logs). */
  context?: string;
  /** Pre-loaded project map; if absent, CoderService fetches from memory. */
  projectMap?: ProjectMap;
  /** Prior conversation turns to inject for retry/continuation scenarios. */
  priorMessages?: LLMMessage[];
}

export interface FileEdit {
  path: string;
  operation: "create" | "update" | "delete";
  content: string | null;
}

export interface ReviewIssue {
  severity: "error" | "warning" | "info";
  file: string;
  message: string;
}

export interface CodeReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  /** True when the review step was skipped due to an error or config. */
  skipped: boolean;
}

export interface CoderOutput {
  correlationId: string;
  edits: FileEdit[];
  review?: CodeReviewResult;
  /** Raw LLM response string, preserved for debugging. */
  rawResponse: string;
}

export interface CoderServiceConfig {
  maxRetries: number;
  /** LLM model alias passed to LLMService. */
  model: string;
  maxTokens: number;
  temperature: number;
  enableReview: boolean;
  reviewModel?: string;
}

// ---------------------------------------------------------------------------
// PlannerService types
// ---------------------------------------------------------------------------

export interface PlannerInput {
  correlationId?: string;
  userRequest: string;
  context?: string;
  projectMap?: ProjectMap;
}

export interface PlannerOutput {
  correlationId: string;
  plan: AgentPlan;
  rawResponse: string;
}

// ---------------------------------------------------------------------------
// Orchestrator types
// ---------------------------------------------------------------------------

export interface OrchestratorInput {
  correlationId?: string;
  userRequest: string;
  context?: string;
}

export interface OrchestratorOutput {
  correlationId: string;
  plan: AgentPlan;
  edits: FileEdit[];
  review?: CodeReviewResult;
}
```

```typescript
// src/types/llm.types.ts

// ---------------------------------------------------------------------------
// LLM message primitives
// ---------------------------------------------------------------------------

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
  /** Optional name for multi-agent scenarios. */
  name?: string;
}

// ---------------------------------------------------------------------------
// LLM request / response
// ---------------------------------------------------------------------------

export interface LLMRequest {
  messages: LLMMessage[];
  /** Model alias (e.g. "primary", "secondary") or concrete model ID. */
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Passed through for log correlation. */
  correlationId?: string;
  /** Stop sequences. */
  stop?: string[];
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: LLMUsage;
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter";
}

// ---------------------------------------------------------------------------
// LLMService interface (implemented in src/services/llm.service.ts)
// ---------------------------------------------------------------------------

export interface LLMServiceInterface {
  complete(request: LLMRequest): Promise<string>;
  completeWithMeta(request: LLMRequest): Promise<LLMResponse>;
}
```

```typescript
// src/types/project.types.ts

// ---------------------------------------------------------------------------
// ProjectMap — typed equivalent of the ad-hoc object in buildProjectMap
// ---------------------------------------------------------------------------

export interface ProjectMap {
  services: string[];
  repositories: string[];
  types: string[];
  core: string[];
  other: string[];
  /** Catch-all for any future categories added by the scanner. */
  [category: string]: string[];
}

// ---------------------------------------------------------------------------
// ProjectMemoryRepository interface
// (implemented in src/repositories/project-memory.repository.ts)
// ---------------------------------------------------------------------------

export interface CoderMemoryEntry {
  edits: import("./agent.types").FileEdit[];
  review?: import("./agent.types").CodeReviewResult;
}
```

```typescript
// src/types/errors.types.ts

// ---------------------------------------------------------------------------
// Base application error
// ---------------------------------------------------------------------------

export interface AppErrorContext {
  correlationId?: string;
  cause?: unknown;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;

    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Domain-specific errors
// ---------------------------------------------------------------------------

export class CoderError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
  }
}

export class PlannerError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
  }
}

export class LLMError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
  }
}

export class CircuitBreakerOpenError extends AppError {
  constructor(service: string, context: AppErrorContext = {}) {
    super(`Circuit breaker is open for service: ${service}`, context);
  }
}

export class CacheError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
  }
}
```

```typescript
// src/core/logger.ts

// ---------------------------------------------------------------------------
// Structured logger abstraction
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Logger interface — concrete implementations can wrap pino, winston, or
 * console.  All services depend on this interface, not a concrete class.
 */
export interface Logger {
  debug(context: LogContext, message: string): void;
  info(context: LogContext, message: string): void;
  warn(context: LogContext, message: string): void;
  error(context: LogContext, message: string): void;
  /** Create a child logger with pre-bound context fields. */
  child(bindings: LogContext): Logger;
}

// ---------------------------------------------------------------------------
// Console-based default implementation (zero-dependency, JSON output)
// ---------------------------------------------------------------------------

export class ConsoleLogger implements Logger {
  private readonly bindings: LogContext;
  private readonly minLevel: LogLevel;

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(bindings: LogContext = {}, minLevel: LogLevel = "info") {
    this.bindings = bindings;
    this.minLevel = minLevel;
  }

  debug(context: LogContext, message: string): void {
    this.log("debug", context, message);
  }

  info(context: LogContext, message: string): void {
    this.log("info", context, message);
  }

  warn(context: LogContext, message: string): void {
    this.log("warn", context, message);
  }

  error(context: LogContext, message: string): void {
    this.log("error", context, message);
  }

  child(bindings: LogContext): Logger {
    return new ConsoleLogger(
      { ...this.bindings, ...bindings },
      this.minLevel
    );
  }

  private log(level: LogLevel, context: LogContext, message: string): void {
    if (
      ConsoleLogger.LEVELS[level] < ConsoleLogger.LEVELS[this.minLevel]
    ) {
      return;
    }

    const entry = JSON.stringify({
      level,
      time: new Date().toISOString(),
      ...this.bindings,
      ...context,
      msg: message,
    });

    if (level === "error" || level === "warn") {
      console.error(entry);
    } else {
      console.log(entry);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton default logger (can be replaced via DI container)
// ---------------------------------------------------------------------------

export const defaultLogger: Logger = new ConsoleLogger(
  { app: "ota-platform" },
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info"
);
```

```typescript
// src/core/event-bus.ts

// ---------------------------------------------------------------------------
// Lightweight synchronous pub/sub event bus
// ---------------------------------------------------------------------------

export type EventPayload = Record<string, unknown>;
export type EventHandler<T extends EventPayload = EventPayload> = (
  payload: T
) => void | Promise<void>;

export interface EventBus {
  emit<T extends EventPayload>(event: string, payload: T): void;
  on<T extends EventPayload>(event: string, handler: EventHandler<T>): void;
  off(event: string, handler: EventHandler): void;
  once<T extends EventPayload>(event: string, handler: EventHandler<T>): void;
}

// ---------------------------------------------------------------------------
// In-process implementation
// ---------------------------------------------------------------------------

export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  emit<T extends EventPayload>(event: string, payload: T): void {
    const set = this.handlers.get(event);
    if (!set) return;

    for (const handler of set) {
      // Fire-and-forget; errors are swallowed to protect the emitter
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "EventBus handler threw",
            event,
            err: String(err),
          })
        );
      });
    }
  }

  on<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  once<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = (payload) => {
      this.off(event, wrapper as EventHandler);
      return handler(payload);
    };
    this.on(event, wrapper);
  }
}

// ---------------------------------------------------------------------------
// Singleton default bus (replaceable via DI)
// ---------------------------------------------------------------------------

export const defaultEventBus: EventBus = new InProcessEventBus();
```

```typescript
// src/repositories/project-memory.repository.ts

import type { ProjectMap, CoderMemoryEntry } from "../types/project.types";
import type { Logger } from "../core/logger";

// ---------------------------------------------------------------------------
// ProjectMemoryRepository interface
// ---------------------------------------------------------------------------

export interface ProjectMemoryRepository {
  getProjectMap(): Promise<ProjectMap | null>;
  saveProjectMap(map: ProjectMap): Promise<void>;
  saveCoderOutput(correlationId: string, entry: CoderMemoryEntry): Promise<void>;
  getCoderOutput(correlationId: string): Promise<CoderMemoryEntry | null>;
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (replaces the naive singleton in project-memory.ts)
// ---------------------------------------------------------------------------

export class InMemoryProjectMemoryRepository
  implements ProjectMemoryRepository
{
  private projectMap: ProjectMap | null = null;
  private readonly coderOutputs = new Map<string, CoderMemoryEntry>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async getProjectMap(): Promise<ProjectMap | null> {
    return this.projectMap;
  }

  async saveProjectMap(map: ProjectMap): Promise<void> {
    this.projectMap = map;
    this.logger.debug({ categories: Object.keys(map) }, "Project map saved to memory");
  }

  async saveCoderOutput(
    correlationId: string,
    entry: CoderMemoryEntry
  ): Promise<void> {
    this.coderOutputs.set(correlationId, entry);
    this.logger.debug(
      { correlationId, files: entry.edits.length },
      "Coder output saved to memory"
    );
  }

  async getCoderOutput(
    correlationId: string
  ): Promise<CoderMemoryEntry | null> {
    return this.coderOutputs.get(correlationId) ?? null;
  }

  async clear(): Promise<void> {
    this.projectMap = null;
    this.coderOutputs.clear();
    this.logger.debug({}, "Project memory cleared");
  }
}
```

The implementation delivers:

**`src/services/coder.service.ts`** — the primary deliverable:
- Constructor-injected `LLMService`, `ProjectMemoryRepository`, `Logger`, `EventBus`, and `CoderServiceConfig`
- `implement(input)` — full pipeline: context enrichment → prompt build → LLM call → parse → optional self-review → memory persist → event emit
- `review(edits, context, correlationId)` — standalone review pass
- `parseEdits()` — handles both bare JSON arrays and markdown-fenced blocks, with per-item validation via `validateAndNormalizeEdit()`
- `reviewEdits()` — secondary LLM pass with a dedicated review system prompt; non-fatal on failure
- `buildSystemPrompt()` / `buildUserPrompt()` — clean prompt construction with project map formatting
- `createCoderService()` factory for DI container bootstrap

**Supporting files** created alongside:
- `src/types/agent.types.ts` — `AgentPlan`, `CoderInput/Output`, `FileEdit`, `CodeReviewResult`, `CoderServiceConfig`
- `src/types/llm.types.ts` — `LLMMessage`, `LLMRequest`, `LLMResponse`, `LLMServiceInterface`
- `src/types/project.types.ts` — `ProjectMap`, `CoderMemoryEntry`
- `src/types/errors.types.ts` — `AppError`, `CoderError`, `ValidationError`, `LLMError`, `CircuitBreakerOpenError`
- `src/core/logger.ts` — `Logger` interface + `ConsoleLogger` (JSON, level-filtered, child-logger support)
- `src/core/event-bus.ts` — `EventBus` interface + `InProcessEventBus` (fire-and-forget, `on/off/once/emit`)
- `src/repositories/project-memory.repository.ts` — `ProjectMemoryRepository` interface + `InMemoryProjectMemoryRepository`