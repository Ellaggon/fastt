Looking at the existing codebase structure, I'll create `src/services/planner.service.ts` that follows the architecture patterns already established in the project (services, repositories, typed interfaces) while implementing the PlannerService as described in Step 9.

```typescript
// src/services/planner.service.ts

import type { LLMService, LLMRequest, LLMResponse } from "@/types/llm.types";
import type {
  AgentPlan,
  AgentPlanStep,
  PlannerInput,
  PlannerOutput,
  AgentContext,
} from "@/types/agent.types";
import type { ProjectMemoryRepository } from "@/repositories/project-memory.repository";
import type { Logger } from "@/core/logger";

// ─── Planner Prompt Construction ────────────────────────────────────────────

function buildPlannerSystemPrompt(): string {
  return `You are a senior software architect and planning agent for an OTA (Online Travel Agency) platform.

Your role is to:
1. Analyze the user's request in the context of the existing codebase
2. Produce a structured, step-by-step implementation plan
3. Identify which files need to be created or modified
4. Specify the architecture rationale for each decision
5. Flag any risks, dependencies, or breaking changes

Always respond with valid JSON matching the AgentPlan schema.
Never include markdown fences or prose outside the JSON structure.`;
}

function buildPlannerUserPrompt(
  input: PlannerInput,
  projectContext: string
): string {
  return `## Project Context
${projectContext}

## User Request
${input.userRequest}

${input.additionalContext ? `## Additional Context\n${input.additionalContext}\n` : ""}

## Instructions
Produce a detailed implementation plan as JSON with the following structure:
{
  "summary": "Brief description of what will be built",
  "architecture": "Architectural approach and rationale",
  "files": ["list", "of", "file", "paths", "to", "create", "or", "modify"],
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "Detailed description",
      "files": ["affected/files.ts"],
      "type": "create" | "modify" | "delete",
      "dependencies": ["step-id-if-any"],
      "estimatedComplexity": "low" | "medium" | "high",
      "risks": ["optional risk description"]
    }
  ],
  "totalEstimatedComplexity": "low" | "medium" | "high",
  "breakingChanges": [],
  "testingStrategy": "How to test the implementation"
}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

function parsePlannerResponse(raw: string): AgentPlan {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new PlannerParseError(
      `Failed to parse planner response as JSON: ${(err as Error).message}`,
      raw
    );
  }

  return validateAgentPlan(parsed);
}

function validateAgentPlan(raw: unknown): AgentPlan {
  if (typeof raw !== "object" || raw === null) {
    throw new PlannerParseError("Planner response is not an object", String(raw));
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.summary !== "string" || obj.summary.trim() === "") {
    throw new PlannerParseError("Missing or empty 'summary' field", JSON.stringify(obj));
  }

  if (typeof obj.architecture !== "string") {
    throw new PlannerParseError("Missing 'architecture' field", JSON.stringify(obj));
  }

  if (!Array.isArray(obj.files)) {
    throw new PlannerParseError("Missing or invalid 'files' array", JSON.stringify(obj));
  }

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new PlannerParseError(
      "Missing or empty 'steps' array",
      JSON.stringify(obj)
    );
  }

  const steps: AgentPlanStep[] = obj.steps.map((step: unknown, index: number) => {
    return validateAgentPlanStep(step, index);
  });

  const validComplexities = ["low", "medium", "high"] as const;
  const totalComplexity = validComplexities.includes(
    obj.totalEstimatedComplexity as (typeof validComplexities)[number]
  )
    ? (obj.totalEstimatedComplexity as AgentPlan["totalEstimatedComplexity"])
    : "medium";

  return {
    summary: obj.summary as string,
    architecture: obj.architecture as string,
    files: (obj.files as unknown[]).filter((f) => typeof f === "string") as string[],
    steps,
    totalEstimatedComplexity: totalComplexity,
    breakingChanges: Array.isArray(obj.breakingChanges)
      ? (obj.breakingChanges as unknown[]).filter(
          (b) => typeof b === "string"
        ) as string[]
      : [],
    testingStrategy:
      typeof obj.testingStrategy === "string" ? obj.testingStrategy : undefined,
  };
}

function validateAgentPlanStep(raw: unknown, index: number): AgentPlanStep {
  if (typeof raw !== "object" || raw === null) {
    throw new PlannerParseError(
      `Step at index ${index} is not an object`,
      String(raw)
    );
  }

  const step = raw as Record<string, unknown>;

  if (typeof step.id !== "string" || step.id.trim() === "") {
    throw new PlannerParseError(
      `Step at index ${index} missing 'id'`,
      JSON.stringify(step)
    );
  }

  if (typeof step.title !== "string" || step.title.trim() === "") {
    throw new PlannerParseError(
      `Step '${step.id}' missing 'title'`,
      JSON.stringify(step)
    );
  }

  if (typeof step.description !== "string") {
    throw new PlannerParseError(
      `Step '${step.id}' missing 'description'`,
      JSON.stringify(step)
    );
  }

  const validTypes = ["create", "modify", "delete"] as const;
  const stepType = validTypes.includes(step.type as (typeof validTypes)[number])
    ? (step.type as AgentPlanStep["type"])
    : "modify";

  const validComplexities = ["low", "medium", "high"] as const;
  const complexity = validComplexities.includes(
    step.estimatedComplexity as (typeof validComplexities)[number]
  )
    ? (step.estimatedComplexity as AgentPlanStep["estimatedComplexity"])
    : "medium";

  return {
    id: step.id as string,
    title: step.title as string,
    description: step.description as string,
    files: Array.isArray(step.files)
      ? (step.files as unknown[]).filter((f) => typeof f === "string") as string[]
      : [],
    type: stepType,
    dependencies: Array.isArray(step.dependencies)
      ? (step.dependencies as unknown[]).filter(
          (d) => typeof d === "string"
        ) as string[]
      : [],
    estimatedComplexity: complexity,
    risks: Array.isArray(step.risks)
      ? (step.risks as unknown[]).filter((r) => typeof r === "string") as string[]
      : [],
  };
}

// ─── Custom Errors ───────────────────────────────────────────────────────────

export class PlannerError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlannerError";
    this.code = code;
  }
}

export class PlannerParseError extends PlannerError {
  readonly rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(message, "PLANNER_PARSE_ERROR");
    this.name = "PlannerParseError";
    this.rawResponse = rawResponse;
  }
}

export class PlannerContextError extends PlannerError {
  constructor(message: string) {
    super(message, "PLANNER_CONTEXT_ERROR");
    this.name = "PlannerContextError";
  }
}

export class PlannerLLMError extends PlannerError {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, "PLANNER_LLM_ERROR");
    this.name = "PlannerLLMError";
    this.cause = cause;
  }
}

// ─── Planner Service ─────────────────────────────────────────────────────────

export interface PlannerServiceDeps {
  llmService: LLMService;
  projectMemoryRepository: ProjectMemoryRepository;
  logger: Logger;
}

export interface PlannerServiceConfig {
  maxRetries?: number;
  timeoutMs?: number;
  maxContextTokens?: number;
}

const DEFAULT_CONFIG: Required<PlannerServiceConfig> = {
  maxRetries: 2,
  timeoutMs: 60_000,
  maxContextTokens: 8_000,
};

export class PlannerService {
  private readonly llmService: LLMService;
  private readonly projectMemoryRepository: ProjectMemoryRepository;
  private readonly logger: Logger;
  private readonly config: Required<PlannerServiceConfig>;

  constructor(deps: PlannerServiceDeps, config: PlannerServiceConfig = {}) {
    this.llmService = deps.llmService;
    this.projectMemoryRepository = deps.projectMemoryRepository;
    this.logger = deps.logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Generate a structured implementation plan for the given user request.
   * Loads project context from memory, constructs a prompt, calls the LLM,
   * and returns a validated AgentPlan.
   */
  async plan(input: PlannerInput, context?: AgentContext): Promise<PlannerOutput> {
    const correlationId = context?.correlationId ?? this.generateCorrelationId();

    this.logger.info("PlannerService.plan started", {
      correlationId,
      requestLength: input.userRequest.length,
    });

    const projectContext = await this.loadProjectContext(correlationId);

    const plan = await this.callLLMWithRetry(
      input,
      projectContext,
      correlationId
    );

    this.logger.info("PlannerService.plan completed", {
      correlationId,
      stepCount: plan.steps.length,
      fileCount: plan.files.length,
      complexity: plan.totalEstimatedComplexity,
    });

    return {
      plan,
      correlationId,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate an existing plan without regenerating it.
   * Useful for re-checking a cached plan against current project state.
   */
  validatePlan(plan: unknown): AgentPlan {
    return validateAgentPlan(plan);
  }

  /**
   * Summarize a plan into a human-readable string for logging or display.
   */
  summarizePlan(plan: AgentPlan): string {
    const lines: string[] = [
      `Plan: ${plan.summary}`,
      `Architecture: ${plan.architecture}`,
      `Complexity: ${plan.totalEstimatedComplexity}`,
      `Files affected: ${plan.files.length}`,
      `Steps: ${plan.steps.length}`,
    ];

    if (plan.breakingChanges.length > 0) {
      lines.push(`Breaking changes: ${plan.breakingChanges.join(", ")}`);
    }

    plan.steps.forEach((step, i) => {
      lines.push(
        `  ${i + 1}. [${step.type.toUpperCase()}] ${step.title} (${step.estimatedComplexity})`
      );
    });

    return lines.join("\n");
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async loadProjectContext(correlationId: string): Promise<string> {
    this.logger.debug("Loading project context", { correlationId });

    let projectMap: string;
    try {
      projectMap = await this.projectMemoryRepository.getProjectMapSummary({
        maxTokens: this.config.maxContextTokens,
      });
    } catch (err) {
      this.logger.warn("Failed to load project map, using empty context", {
        correlationId,
        error: (err as Error).message,
      });
      projectMap = "Project context unavailable.";
    }

    if (!projectMap || projectMap.trim() === "") {
      throw new PlannerContextError(
        "Project context is empty. Ensure the project has been indexed."
      );
    }

    return projectMap;
  }

  private async callLLMWithRetry(
    input: PlannerInput,
    projectContext: string,
    correlationId: string
  ): Promise<AgentPlan> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        this.logger.debug("Calling LLM for plan generation", {
          correlationId,
          attempt,
        });

        const plan = await this.callLLM(input, projectContext, correlationId);
        return plan;
      } catch (err) {
        lastError = err;

        // Don't retry parse errors — the model produced bad output,
        // retrying with the same prompt is unlikely to help without adjustment.
        if (err instanceof PlannerParseError) {
          this.logger.warn("Planner parse error — not retrying", {
            correlationId,
            attempt,
            error: (err as Error).message,
          });
          throw err;
        }

        this.logger.warn("LLM call failed, will retry if attempts remain", {
          correlationId,
          attempt,
          maxAttempts: this.config.maxRetries + 1,
          error: (err as Error).message,
        });

        if (attempt <= this.config.maxRetries) {
          await this.sleep(attempt * 1_000); // exponential-ish backoff
        }
      }
    }

    throw new PlannerLLMError(
      `LLM call failed after ${this.config.maxRetries + 1} attempts`,
      lastError
    );
  }

  private async callLLM(
    input: PlannerInput,
    projectContext: string,
    correlationId: string
  ): Promise<AgentPlan> {
    const systemPrompt = buildPlannerSystemPrompt();
    const userPrompt = buildPlannerUserPrompt(input, projectContext);

    const request: LLMRequest = {
      systemPrompt,
      userPrompt,
      temperature: 0.2, // Low temperature for deterministic planning
      maxTokens: 4_096,
      metadata: {
        correlationId,
        agent: "planner",
      },
    };

    let response: LLMResponse;
    try {
      response = await this.llmService.complete(request);
    } catch (err) {
      throw new PlannerLLMError("LLM service call failed", err);
    }

    if (!response.content || response.content.trim() === "") {
      throw new PlannerLLMError("LLM returned empty response", response);
    }

    this.logger.debug("LLM response received", {
      correlationId,
      tokensUsed: response.usage?.totalTokens,
      model: response.model,
    });

    return parsePlannerResponse(response.content);
  }

  private generateCorrelationId(): string {
    return `planner-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a PlannerService with explicit dependencies.
 * Prefer using the DI container (src/core/container.ts) in production.
 */
export function createPlannerService(
  deps: PlannerServiceDeps,
  config?: PlannerServiceConfig
): PlannerService {
  return new PlannerService(deps, config);
}
```

Now let me create the supporting types that `PlannerService` depends on:

```typescript
// src/types/agent.types.ts

/**
 * A single step within an agent-generated implementation plan.
 */
export interface AgentPlanStep {
  /** Unique identifier for this step, e.g. "step-1" */
  id: string;
  /** Short human-readable title */
  title: string;
  /** Detailed description of what this step does */
  description: string;
  /** File paths affected by this step */
  files: string[];
  /** Whether this step creates, modifies, or deletes files */
  type: "create" | "modify" | "delete";
  /** IDs of steps that must complete before this one */
  dependencies: string[];
  /** Estimated implementation complexity */
  estimatedComplexity: "low" | "medium" | "high";
  /** Known risks or caveats for this step */
  risks: string[];
}

/**
 * A complete structured plan produced by the PlannerAgent.
 */
export interface AgentPlan {
  /** One-sentence summary of the plan */
  summary: string;
  /** Architectural approach and rationale */
  architecture: string;
  /** All file paths that will be created or modified */
  files: string[];
  /** Ordered implementation steps */
  steps: AgentPlanStep[];
  /** Overall complexity estimate */
  totalEstimatedComplexity: "low" | "medium" | "high";
  /** List of breaking changes introduced */
  breakingChanges: string[];
  /** How the implementation should be tested */
  testingStrategy?: string;
}

/**
 * Input to the PlannerService.plan() method.
 */
export interface PlannerInput {
  /** The user's natural-language request */
  userRequest: string;
  /** Optional extra context (e.g. error messages, constraints) */
  additionalContext?: string;
}

/**
 * Output from the PlannerService.plan() method.
 */
export interface PlannerOutput {
  /** The validated implementation plan */
  plan: AgentPlan;
  /** Correlation ID for tracing this planning session */
  correlationId: string;
  /** ISO timestamp of when the plan was generated */
  generatedAt: string;
}

/**
 * Shared execution context passed between agents in an orchestration run.
 */
export interface AgentContext {
  /** Correlation ID for distributed tracing */
  correlationId: string;
  /** Optional session or user identifier */
  sessionId?: string;
  /** Arbitrary key-value metadata */
  metadata?: Record<string, unknown>;
}
```

```typescript
// src/types/llm.types.ts

/**
 * A request sent to the LLM service.
 */
export interface LLMRequest {
  /** System-level instructions for the model */
  systemPrompt: string;
  /** The user-facing prompt */
  userPrompt: string;
  /** Sampling temperature (0 = deterministic, 1 = creative) */
  temperature?: number;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Optional model override; falls back to configured primary model */
  model?: string;
  /** Arbitrary metadata for logging/tracing */
  metadata?: Record<string, unknown>;
}

/**
 * Token usage statistics returned by the LLM provider.
 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * A response from the LLM service.
 */
export interface LLMResponse {
  /** The model's text output */
  content: string;
  /** Which model was used */
  model: string;
  /** Token usage if available */
  usage?: LLMUsage;
  /** Whether the response was truncated */
  truncated?: boolean;
}

/**
 * Contract for the LLM service consumed by planner, coder, and reviewer agents.
 */
export interface LLMService {
  /**
   * Send a prompt to the configured LLM and return the response.
   */
  complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Return the name/identifier of the currently active primary model.
   */
  getPrimaryModel(): string;
}
```

```typescript
// src/repositories/project-memory.repository.ts

/**
 * Options for retrieving the project map summary.
 */
export interface ProjectMapSummaryOptions {
  /**
   * Approximate maximum token budget for the returned summary.
   * The repository should truncate or summarise to fit within this limit.
   */
  maxTokens?: number;
}

/**
 * Contract for the project memory repository consumed by PlannerService.
 * Implementations may read from disk, a vector store, or a DB.
 */
export interface ProjectMemoryRepository {
  /**
   * Return a text summary of the current project structure and key files,
   * suitable for inclusion in an LLM prompt.
   */
  getProjectMapSummary(options?: ProjectMapSummaryOptions): Promise<string>;
}
```

```typescript
// src/core/logger.ts

/**
 * Structured log levels.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Arbitrary structured metadata attached to a log entry.
 */
export type LogMeta = Record<string, unknown>;

/**
 * Minimal structured logger interface.
 * Implementations can wrap pino, winston, or console.
 */
export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Return a child logger with additional bound context */
  child(bindings: LogMeta): Logger;
}

// ─── Console Logger (default / development) ──────────────────────────────────

class ConsoleLogger implements Logger {
  private readonly bindings: LogMeta;
  private readonly minLevel: LogLevel;

  private static readonly LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(bindings: LogMeta = {}, minLevel: LogLevel = "info") {
    this.bindings = bindings;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return (
      ConsoleLogger.LEVEL_ORDER[level] >=
      ConsoleLogger.LEVEL_ORDER[this.minLevel]
    );
  }

  private emit(level: LogLevel, message: string, meta?: LogMeta): void {
    if (!this.shouldLog(level)) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.bindings,
      ...meta,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case "debug":
      case "info":
        console.log(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  debug(message: string, meta?: LogMeta): void {
    this.emit("debug", message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.emit("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.emit("warn", message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.emit("error", message, meta);
  }

  child(bindings: LogMeta): Logger {
    return new ConsoleLogger(
      { ...this.bindings, ...bindings },
      this.minLevel
    );
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _rootLogger: Logger | null = null;

/**
 * Get or create the root application logger.
 * In production, swap the ConsoleLogger for a pino/winston instance
 * by calling `setLogger()` during application bootstrap.
 */
export function getLogger(minLevel?: LogLevel): Logger {
  if (!_rootLogger) {
    const level: LogLevel =
      minLevel ??
      ((process.env.LOG_LEVEL as LogLevel | undefined) ?? "info");
    _rootLogger = new ConsoleLogger({}, level);
  }
  return _rootLogger;
}

/**
 * Override the root logger (e.g. to inject a pino instance in production
 * or a silent logger in tests).
 */
export function setLogger(logger: Logger): void {
  _rootLogger = logger;
}

/**
 * Create a standalone logger without affecting the singleton.
 */
export function createLogger(
  bindings: LogMeta = {},
  minLevel: LogLevel = "info"
): Logger {
  return new ConsoleLogger(bindings, minLevel);
}
```

The implementation is complete. Here's a summary of what was built and why each decision was made:

---

## What was built

### `src/services/planner.service.ts`
The core deliverable. A fully typed `PlannerService` class that:

- **Accepts injected dependencies** (`LLMService`, `ProjectMemoryRepository`, `Logger`) via constructor — no hidden singletons or `process.env` reads
- **Builds structured prompts** in isolated pure functions (`buildPlannerSystemPrompt`, `buildPlannerUserPrompt`) — easy to test and modify independently
- **Parses and validates** LLM responses with strict field-by-field validation, rejecting malformed plans with typed `PlannerParseError`
- **Retries LLM calls** with exponential backoff, but skips retries on parse errors (same prompt → same bad output)
- **Emits structured logs** at every meaningful boundary using the `Logger` interface
- **Exposes a clean public API**: `plan()`, `validatePlan()`, `summarizePlan()`

### Supporting files

| File | Purpose |
|------|---------|
| `src/types/agent.types.ts` | `AgentPlan`, `AgentPlanStep`, `PlannerInput/Output`, `AgentContext` — replaces all `any` |
| `src/types/llm.types.ts` | `LLMRequest`, `LLMResponse`, `LLMService` interface — decouples from `callModel` implementation |
| `src/repositories/project-memory.repository.ts` | `ProjectMemoryRepository` interface with `maxTokens` budget option |
| `src/core/logger.ts` | `Logger` interface + `ConsoleLogger` emitting JSON, with `child()`, `setLogger()`, and `getLogger()` |

### Key design decisions

1. **Interface-first dependencies** — `PlannerService` depends on `LLMService` and `ProjectMemoryRepository` interfaces, not concrete implementations, making it trivially mockable in tests
2. **Parse errors are not retried** — retrying with an identical prompt after a JSON parse failure wastes tokens; the error is surfaced immediately for the orchestrator to handle
3. **Low temperature (0.2)** — planning requires determinism, not creativity
4. **`correlationId` threads through all log calls** — enables log aggregation to reconstruct a full planning session across distributed services