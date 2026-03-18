Looking at the existing codebase structure, I'll create the `AgentOrchestrator` service that follows the established patterns while introducing proper orchestration, error handling, and event emission.

Let me first examine the relevant existing files to understand the patterns:

- `src/ai/agents/planner.agent.ts` and `coder.agent.ts` for agent patterns
- `src/ai/llm/call-model.ts` for LLM interaction
- `src/ai/orchestrator/run-agents.ts` for existing orchestration

```typescript
// src/services/agent-orchestrator.service.ts

import type {
  AgentOrchestrationContext,
  AgentOrchestrationResult,
  AgentPhase,
  AgentPhaseResult,
  AgentRunOptions,
  OrchestratorEvent,
  OrchestratorEventType,
  OrchestratorEventHandler,
  AgentError,
  AgentErrorCode,
  RecoveryStrategy,
} from "@/types/agent.types";

// ─── Inline type definitions (until src/types/agent.types.ts is created) ────

export interface PlanStep {
  id: string;
  description: string;
  filePath: string;
  action: "create" | "update" | "delete" | "read";
  dependsOn?: string[];
  estimatedTokens?: number;
}

export interface AgentPlan {
  sessionId: string;
  goal: string;
  steps: PlanStep[];
  contextFiles: string[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CoderResult {
  stepId: string;
  filePath: string;
  content: string;
  action: PlanStep["action"];
  tokensUsed?: number;
  durationMs?: number;
}

export interface OrchestrationPhase {
  name: "planning" | "coding" | "reviewing" | "complete" | "failed";
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: StructuredError;
}

export interface StructuredError {
  code: string;
  message: string;
  phase: OrchestrationPhase["name"];
  stepId?: string;
  filePath?: string;
  retryable: boolean;
  originalError?: unknown;
}

export interface OrchestrationResult {
  sessionId: string;
  goal: string;
  plan: AgentPlan | null;
  coderResults: CoderResult[];
  phases: OrchestrationPhase[];
  totalTokensUsed: number;
  totalDurationMs: number;
  success: boolean;
  errors: StructuredError[];
  completedAt: Date;
}

export type EventType =
  | "orchestration:started"
  | "orchestration:completed"
  | "orchestration:failed"
  | "phase:started"
  | "phase:completed"
  | "phase:failed"
  | "step:started"
  | "step:completed"
  | "step:failed"
  | "plan:created"
  | "plan:validated"
  | "cache:hit"
  | "cache:miss"
  | "llm:request"
  | "llm:response"
  | "llm:error"
  | "circuit-breaker:open"
  | "circuit-breaker:closed"
  | "circuit-breaker:half-open";

export interface OrchestratorEventPayload<T = unknown> {
  type: EventType;
  sessionId: string;
  timestamp: Date;
  correlationId: string;
  data: T;
}

export type EventHandler<T = unknown> = (
  event: OrchestratorEventPayload<T>
) => void | Promise<void>;

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  correlationId: string;
  sessionId?: string;
  phase?: string;
  stepId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

class StructuredLogger implements Logger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  private emit(
    level: LogEntry["level"],
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      level,
      message,
      correlationId: (this.context["correlationId"] as string) ?? "unknown",
      sessionId: this.context["sessionId"] as string | undefined,
      phase: this.context["phase"] as string | undefined,
      stepId: this.context["stepId"] as string | undefined,
      timestamp: new Date(),
      data: { ...this.context, ...data },
    };

    // Emit as structured JSON — in production this would pipe to pino/winston
    const output = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.emit("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.emit("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.emit("warn", message, data);
  }

  error(
    message: string,
    error?: unknown,
    data?: Record<string, unknown>
  ): void {
    const errorData: Record<string, unknown> = { ...data };
    if (error instanceof Error) {
      errorData["errorMessage"] = error.message;
      errorData["errorStack"] = error.stack;
      errorData["errorName"] = error.name;
    } else if (error !== undefined) {
      errorData["error"] = String(error);
    }
    this.emit("error", message, errorData);
  }

  child(context: Record<string, unknown>): Logger {
    return new StructuredLogger({ ...this.context, ...context });
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxCalls: number;
}

const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60_000,
  halfOpenMaxCalls: 1,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private halfOpenCallCount = 0;
  private lastFailureTime?: Date;
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;
  private readonly onStateChange?: (
    name: string,
    state: CircuitState
  ) => void;

  constructor(
    name: string,
    options: Partial<CircuitBreakerOptions> = {},
    onStateChange?: (name: string, state: CircuitState) => void
  ) {
    this.name = name;
    this.options = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
    this.onStateChange = onStateChange;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      const elapsed =
        Date.now() - (this.lastFailureTime?.getTime() ?? 0);
      if (elapsed >= this.options.timeoutMs) {
        this.transitionTo("half-open");
      } else {
        throw new Error(
          `Circuit breaker '${this.name}' is OPEN. Retry after ${Math.ceil(
            (this.options.timeoutMs - elapsed) / 1000
          )}s.`
        );
      }
    }

    if (
      this.state === "half-open" &&
      this.halfOpenCallCount >= this.options.halfOpenMaxCalls
    ) {
      throw new Error(
        `Circuit breaker '${this.name}' is HALF-OPEN and at max probe calls.`
      );
    }

    if (this.state === "half-open") {
      this.halfOpenCallCount++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo("closed");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    if (
      this.state === "half-open" ||
      this.failureCount >= this.options.failureThreshold
    ) {
      this.transitionTo("open");
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    if (next === "closed") {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCallCount = 0;
    }
    if (next === "half-open") {
      this.successCount = 0;
      this.halfOpenCallCount = 0;
    }
    this.onStateChange?.(this.name, next);
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.transitionTo("closed");
  }
}

// ─── In-Memory Cache ─────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

export interface CacheOptions {
  ttlMs: number;
  maxSize?: number;
}

export class InMemoryCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly options: Required<CacheOptions>;

  constructor(options: CacheOptions) {
    this.options = { maxSize: 500, ...options };
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.options.maxSize) {
      this.evictOldest();
    }
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.options.ttlMs),
      createdAt: now,
      hits: 0,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

export class EventBus {
  private readonly handlers = new Map<
    EventType,
    Set<EventHandler<unknown>>
  >();

  on<T>(type: EventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler as EventHandler<unknown>);
    };
  }

  async emit<T>(event: OrchestratorEventPayload<T>): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      try {
        const result = handler(event as OrchestratorEventPayload<unknown>);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (err) {
        // Event handlers must not crash the orchestrator
        console.error(
          `[EventBus] Handler error for event '${event.type}':`,
          err
        );
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  removeAllHandlers(type?: EventType): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }
}

// ─── Retry Utility ───────────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryIf?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  backoffFactor: 2,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger?: Logger
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const shouldRetry = opts.retryIf ? opts.retryIf(err) : true;
      if (!shouldRetry || attempt === opts.maxAttempts) {
        throw err;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelayMs
      );

      logger?.warn(`Retry attempt ${attempt}/${opts.maxAttempts}`, {
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ─── ID Generation ───────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

// ─── Plan Validator ──────────────────────────────────────────────────────────

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validatePlan(plan: AgentPlan): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan.goal || plan.goal.trim().length === 0) {
    errors.push("Plan goal is empty.");
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push("Plan contains no steps.");
  }

  const stepIds = new Set<string>();
  for (const step of plan.steps) {
    if (!step.id) {
      errors.push(`Step is missing an id: ${JSON.stringify(step)}`);
      continue;
    }
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);

    if (!step.filePath || step.filePath.trim().length === 0) {
      errors.push(`Step '${step.id}' has no filePath.`);
    }

    if (!step.action) {
      errors.push(`Step '${step.id}' has no action.`);
    }

    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          warnings.push(
            `Step '${step.id}' depends on '${dep}' which appears later or doesn't exist.`
          );
        }
      }
    }
  }

  if (plan.steps.length > 50) {
    warnings.push(
      `Plan has ${plan.steps.length} steps — consider breaking into smaller sessions.`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Dependency Sorter (Topological) ─────────────────────────────────────────

function topologicalSort(steps: PlanStep[]): PlanStep[] {
  const stepMap = new Map<string, PlanStep>(
    steps.map((s) => [s.id, s])
  );
  const visited = new Set<string>();
  const sorted: PlanStep[] = [];

  function visit(id: string, ancestors: Set<string>): void {
    if (ancestors.has(id)) {
      throw new Error(`Circular dependency detected at step '${id}'.`);
    }
    if (visited.has(id)) return;

    const step = stepMap.get(id);
    if (!step) return;

    ancestors.add(id);
    for (const dep of step.dependsOn ?? []) {
      visit(dep, new Set(ancestors));
    }
    ancestors.delete(id);

    visited.add(id);
    sorted.push(step);
  }

  for (const step of steps) {
    visit(step.id, new Set());
  }

  return sorted;
}

// ─── Planner Adapter ─────────────────────────────────────────────────────────
// Adapts the existing plannerAgent to produce a typed AgentPlan.

export interface PlannerAdapter {
  createPlan(goal: string, sessionId: string): Promise<AgentPlan>;
}

export interface CoderAdapter {
  executeStep(
    step: PlanStep,
    plan: AgentPlan,
    sessionId: string
  ): Promise<CoderResult>;
}

// ─── AgentOrchestrator ───────────────────────────────────────────────────────

export interface AgentOrchestratorOptions {
  maxConcurrentSteps?: number;
  planCacheTtlMs?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
  retryOptions?: Partial<RetryOptions>;
  stopOnFirstError?: boolean;
}

const DEFAULT_ORCHESTRATOR_OPTIONS: Required<AgentOrchestratorOptions> = {
  maxConcurrentSteps: 1, // Sequential by default for determinism
  planCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  enableCircuitBreaker: true,
  circuitBreakerOptions: {},
  retryOptions: {},
  stopOnFirstError: false,
};

export class AgentOrchestratorService {
  private readonly options: Required<AgentOrchestratorOptions>;
  private readonly eventBus: EventBus;
  private readonly planCache: InMemoryCache<AgentPlan>;
  private readonly plannerCircuit: CircuitBreaker;
  private readonly coderCircuit: CircuitBreaker;
  private readonly logger: Logger;

  constructor(
    private readonly plannerAdapter: PlannerAdapter,
    private readonly coderAdapter: CoderAdapter,
    options: AgentOrchestratorOptions = {},
    eventBus?: EventBus,
    logger?: Logger
  ) {
    this.options = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
    this.eventBus = eventBus ?? new EventBus();
    this.logger =
      logger ??
      new StructuredLogger({ service: "AgentOrchestratorService" });

    this.planCache = new InMemoryCache<AgentPlan>({
      ttlMs: this.options.planCacheTtlMs,
      maxSize: 100,
    });

    const circuitStateHandler = (name: string, state: CircuitState) => {
      const eventType: EventType =
        state === "open"
          ? "circuit-breaker:open"
          : state === "closed"
          ? "circuit-breaker:closed"
          : "circuit-breaker:half-open";

      void this.eventBus.emit({
        type: eventType,
        sessionId: "system",
        correlationId: generateId("cb"),
        timestamp: new Date(),
        data: { circuitName: name, state },
      });
    };

    this.plannerCircuit = new CircuitBreaker(
      "planner",
      this.options.circuitBreakerOptions,
      circuitStateHandler
    );

    this.coderCircuit = new CircuitBreaker(
      "coder",
      this.options.circuitBreakerOptions,
      circuitStateHandler
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to orchestration events.
   * Returns an unsubscribe function.
   */
  on<T>(type: EventType, handler: EventHandler<T>): () => void {
    return this.eventBus.on(type, handler);
  }

  /**
   * Run the full planning → coding pipeline for a given goal.
   */
  async run(
    goal: string,
    sessionId?: string
  ): Promise<OrchestrationResult> {
    const resolvedSessionId = sessionId ?? generateId("session");
    const correlationId = generateId("corr");
    const startTime = Date.now();

    const sessionLogger = this.logger.child({
      sessionId: resolvedSessionId,
      correlationId,
    });

    const result: OrchestrationResult = {
      sessionId: resolvedSessionId,
      goal,
      plan: null,
      coderResults: [],
      phases: [],
      totalTokensUsed: 0,
      totalDurationMs: 0,
      success: false,
      errors: [],
      completedAt: new Date(),
    };

    sessionLogger.info("Orchestration started", { goal });

    await this.emitEvent(
      "orchestration:started",
      resolvedSessionId,
      correlationId,
      { goal }
    );

    try {
      // ── Phase 1: Planning ────────────────────────────────────────────────
      const plan = await this.runPlanningPhase(
        goal,
        resolvedSessionId,
        correlationId,
        result,
        sessionLogger
      );

      result.plan = plan;

      // ── Phase 2: Coding ──────────────────────────────────────────────────
      await this.runCodingPhase(
        plan,
        resolvedSessionId,
        correlationId,
        result,
        sessionLogger
      );

      result.success = result.errors.length === 0;
    } catch (err) {
      const structuredError = this.buildError(err, "failed");
      result.errors.push(structuredError);
      result.success = false;

      sessionLogger.error("Orchestration failed with unhandled error", err);

      await this.emitEvent(
        "orchestration:failed",
        resolvedSessionId,
        correlationId,
        { error: structuredError }
      );
    } finally {
      result.totalDurationMs = Date.now() - startTime;
      result.completedAt = new Date();
      result.totalTokensUsed = result.coderResults.reduce(
        (sum, r) => sum + (r.tokensUsed ?? 0),
        0
      );
    }

    sessionLogger.info("Orchestration completed", {
      success: result.success,
      totalDurationMs: result.totalDurationMs,
      totalTokensUsed: result.totalTokensUsed,
      stepsCompleted: result.coderResults.length,
      errorCount: result.errors.length,
    });

    await this.emitEvent(
      "orchestration:completed",
      resolvedSessionId,
      correlationId,
      {
        success: result.success,
        totalDurationMs: result.totalDurationMs,
        stepsCompleted: result.coderResults.length,
      }
    );

    return result;
  }

  /**
   * Retrieve a cached plan by session ID without re-running planning.
   */
  getCachedPlan(sessionId: string): AgentPlan | undefined {
    return this.planCache.get(`plan:${sessionId}`);
  }

  /**
   * Invalidate a cached plan.
   */
  invalidatePlan(sessionId: string): void {
    this.planCache.delete(`plan:${sessionId}`);
  }

  /**
   * Reset circuit breakers (useful in tests or after manual recovery).
   */
  resetCircuitBreakers(): void {
    this.plannerCircuit.reset();
    this.coderCircuit.reset();
  }

  /**
   * Get current circuit breaker states for health checks.
   */
  getCircuitBreakerStates(): Record<string, CircuitState> {
    return {
      planner: this.plannerCircuit.getState(),
      coder: this.coderCircuit.getState(),
    };
  }

  // ── Private: Planning Phase ────────────────────────────────────────────────

  private async runPlanningPhase(
    goal: string,
    sessionId: string,
    correlationId: string,
    result: OrchestrationResult,
    logger: Logger
  ): Promise<AgentPlan> {
    const phase = this.startPhase("planning", result);
    const phaseLogger = logger.child({ phase: "planning" });

    await this.emitEvent("phase:started", sessionId, correlationId, {
      phase: "planning",
    });

    try {
      // Check cache first
      const cacheKey = `plan:${sessionId}`;
      const cached = this.planCache.get(cacheKey);

      if (cached) {
        phaseLogger.info("Plan cache hit", { cacheKey });
        await this.emitEvent("cache:hit", sessionId, correlationId, {
          cacheKey,
        });
        this.completePhase(phase);
        await this.emitEvent("phase:completed", sessionId, correlationId, {
          phase: "planning",
          cached: true,
        });
        return cached;
      }

      await this.emitEvent("cache:miss", sessionId, correlationId, {
        cacheKey,
      });

      // Call planner with circuit breaker + retry
      const plan = await withRetry(
        () =>
          this.options.enableCircuitBreaker
            ? this.plannerCircuit.execute(() =>
                this.plannerAdapter.createPlan(goal, sessionId)
              )
            : this.plannerAdapter.createPlan(goal, sessionId),
        this.options.retryOptions,
        phaseLogger
      );

      // Validate plan
      const validation = validatePlan(plan);

      await this.emitEvent("plan:validated", sessionId, correlationId, {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        stepCount: plan.steps.length,
      });

      if (!validation.valid) {
        throw new Error(
          `Plan validation failed: ${validation.errors.join("; ")}`
        );
      }

      if (validation.warnings.length > 0) {
        phaseLogger.warn("Plan validation warnings", {
          warnings: validation.warnings,
        });
      }

      // Cache the valid plan
      this.planCache.set(cacheKey, plan);

      await this.emitEvent("plan:created", sessionId, correlationId, {
        stepCount: plan.steps.length,
        contextFiles: plan.contextFiles,
      });

      phaseLogger.info("Plan created and cached", {
        stepCount: plan.steps.length,
      });

      this.completePhase(phase);
      await this.emitEvent("phase:completed", sessionId, correlationId, {
        phase: "planning",
        stepCount: plan.steps.length,
      });

      return plan;
    } catch (err) {
      const structuredError = this.buildError(err, "planning");
      result.errors.push(structuredError);
      this.failPhase(phase, structuredError);

      phaseLogger.error("Planning phase failed", err);

      await this.emitEvent("phase:failed", sessionId, correlationId, {
        phase: "planning",
        error: structuredError,
      });

      throw err;
    }
  }

  // ── Private: Coding Phase ──────────────────────────────────────────────────

  private async runCodingPhase(
    plan: AgentPlan,
    sessionId: string,
    correlationId: string,
    result: OrchestrationResult,
    logger: Logger
  ): Promise<void> {
    const phase = this.startPhase("coding", result);
    const phaseLogger = logger.child({ phase: "coding" });

    await this.emitEvent("phase:started", sessionId, correlationId, {
      phase: "coding",
      stepCount: plan.steps.length,
    });

    try {
      // Sort steps by dependency order
      const orderedSteps = topologicalSort(plan.steps);

      phaseLogger.info("Executing steps", {
        totalSteps: orderedSteps.length,
        maxConcurrent: this.options.maxConcurrentSteps,
      });

      if (this.options.maxConcurrentSteps === 1) {
        // Sequential execution — deterministic and safe
        await this.executeStepsSequentially(
          orderedSteps,
          plan,
          sessionId,
          correlationId,
          result,
          phaseLogger
        );
      } else {
        // Batched concurrent execution
        await this.executeStepsConcurrently(
          orderedSteps,
          plan,
          sessionId,
          correlationId,
          result,
          phaseLogger
        );
      }

      this.completePhase(phase);
      await this.emitEvent("phase:completed", sessionId, correlationId, {
        phase: "coding",
        completedSteps: result.coderResults.length,
        failedSteps: result.errors.filter((e) => e.phase === "coding").length,
      });
    } catch (err) {
      const structuredError = this.buildError(err, "coding");
      result.errors.push(structuredError);
      this.failPhase(phase, structuredError);

      phaseLogger.error("Coding phase failed", err);

      await this.emitEvent("phase:failed", sessionId, correlationId, {
        phase: "coding",
        error: structuredError,
      });

      throw err;
    }
  }

  private async executeStepsSequentially(
    steps: PlanStep[],
    plan: AgentPlan,
    sessionId: string,
    correlationId: string,
    result: OrchestrationResult,
    logger: Logger
  ): Promise<void> {
    for (const step of steps) {
      const stepLogger = logger.child({ stepId: step.id, filePath: step.filePath });

      await this.emitEvent("step:started", sessionId, correlationId, {
        stepId: step.id,
        filePath: step.filePath,
        action: step.action,
      });

      try {
        const coderResult = await withRetry(
          () =>
            this.options.enableCircuitBreaker
              ? this.coderCircuit.execute(() =>
                  this.coderAdapter.executeStep(step, plan, sessionId)
                )
              : this.coderAdapter.executeStep(step, plan, sessionId),
          this.options.retryOptions,
          stepLogger
        );

        result.coderResults.push(coderResult);

        stepLogger.info("Step completed", {
          tokensUsed: coderResult.tokensUsed,
          durationMs: coderResult.durationMs,
        });

        await this.emitEvent("step:completed", sessionId, correlationId, {
          stepId: step.id,
          filePath: step.filePath,
          tokensUsed: coderResult.tokensUsed,
          durationMs: coderResult.durationMs,
        });
      } catch (err) {
        const structuredError = this.buildError(err, "coding", step.id, step.filePath);
        result.errors.push(structuredError);

        stepLogger.error("Step failed", err);

        await this.emitEvent("step:failed", sessionId, correlationId, {
          stepId: step.id,
          filePath: step.filePath,
          error: structuredError,
        });

        if (this.options.stopOnFirstError) {
          throw new Error(
            `Stopping orchestration after step '${step.id}' failed: ${structuredError.message}`
          );
        }
      }
    }
  }

  private async executeStepsConcurrently(
    steps: PlanStep[],
    plan: AgentPlan,
    sessionId: string,
    correlationId: string,
    result: OrchestrationResult,
    logger: Logger
  ): Promise<void> {
    const batchSize = this.options.maxConcurrentSteps;

    for (let i = 0; i < steps.length; i += batchSize) {
      const batch = steps.slice(i, i + batchSize);

      logger.info(`Executing batch ${Math.floor(i / batchSize) + 1}`, {
        batchSize: batch.length,
        stepIds: batch.map((s) => s.id),
      });

      const batchPromises = batch.map((step) =>
        this.executeSingleStep(
          step,
          plan,
          sessionId,
          correlationId,
          result,
          logger
        )
      );

      await Promise.allSettled(batchPromises);

      if (
        this.options.stopOnFirstError &&
        result.errors.some((e) => e.phase === "coding")
      ) {
        throw new Error("Stopping orchestration due to step failure.");
      }
    }
  }

  private async executeSingleStep(
    step: PlanStep,
    plan: AgentPlan,
    sessionId: string,
    correlationId: string,
    result: OrchestrationResult,
    logger: Logger
  ): Promise<void> {
    const stepLogger = logger.child({ stepId: step.id });

    await this.emitEvent("step:started", sessionId, correlationId, {
      stepId: step.id,
      filePath: step.filePath,
    });

    try {
      const coderResult = await withRetry(
        () =>
          this.options.enableCircuitBreaker
            ? this.coderCircuit.execute(() =>
                this.coderAdapter.executeStep(step, plan, sessionId)
              )
            : this.coderAdapter.executeStep(step, plan, sessionId),
        this.options.retryOptions,
        stepLogger
      );

      result.coderResults.push(coderResult);

      await this.emitEvent("step:completed", sessionId, correlationId, {
        stepId: step.id,
        filePath: step.filePath,
        tokensUsed: coderResult.tokensUsed,
      });
    } catch (err) {
      const structuredError = this.buildError(
        err,
        "coding",
        step.id,
        step.filePath
      );
      result.errors.push(structuredError);

      await this.emitEvent("step:failed", sessionId, correlationId, {
        stepId: step.id,
        error: structuredError,
      });
    }
  }

  // ── Private: Phase Lifecycle ───────────────────────────────────────────────

  private startPhase(
    name: OrchestrationPhase["name"],
    result: OrchestrationResult
  ): OrchestrationPhase {
    const phase: OrchestrationPhase = {
      name,
      startedAt: new Date(),
    };
    result.phases.push(phase);
    return phase;
  }

  private completePhase(phase: OrchestrationPhase): void {
    phase.completedAt = new Date();
    phase.durationMs =
      phase.completedAt.getTime() - phase.startedAt.getTime();
  }

  private failPhase(
    phase: OrchestrationPhase,
    error: StructuredError
  ): void {
    phase.completedAt = new Date();
    phase.durationMs =
      phase.completedAt.getTime() - phase.startedAt.getTime();
    phase.name = "failed";
    phase.error = error;
  }

  // ── Private: Error Building ────────────────────────────────────────────────

  private buildError(
    err: unknown,
    phase: OrchestrationPhase["name"],
    stepId?: string,
    filePath?: string
  ): StructuredError {
    const message =
      err instanceof Error ? err.message : String(err ?? "Unknown error");

    const retryable = this.isRetryableError(err);

    return {
      code: this.classifyErrorCode(err),
      message,
      phase,
      stepId,
      filePath,
      retryable,
      originalError: err,
    };
  }

  private isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("rate limit") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused")
    );
  }

  private classifyErrorCode(err: unknown): string {
    if (!(err instanceof Error)) return "UNKNOWN_ERROR";
    const msg = err.message.toLowerCase();

    if (msg.includes("circuit breaker")) return "CIRCUIT_BREAKER_OPEN";
    if (msg.includes("timeout")) return "TIMEOUT";
    if (msg.includes("rate limit")) return "RATE_LIMIT";
    if (msg.includes("validation")) return "VALIDATION_ERROR";
    if (msg.includes("circular dependency")) return "CIRCULAR_DEPENDENCY";
    if (msg.includes("plan")) return "PLAN_ERROR";
    return "EXECUTION_ERROR";
  }

  // ── Private: Event Emission ────────────────────────────────────────────────

  private async emitEvent<T>(
    type: EventType,
    sessionId: string,
    correlationId: string,
    data: T
  ): Promise<void> {
    await this.eventBus.emit<T>({
      type,
      sessionId,
      correlationId,
      timestamp: new Date(),
      data,
    });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates an AgentOrchestratorService wired to the existing plannerAgent
 * and coderAgent implementations via adapter shims.
 *
 * This factory bridges the new orchestration layer with the existing
 * src/ai/agents/* implementations without modifying them.
 */
export function createAgentOrchestrator(
  plannerAdapter: PlannerAdapter,
  coderAdapter: CoderAdapter,
  options: AgentOrchestratorOptions = {}
): AgentOrchestratorService {
  const eventBus = new EventBus();
  const logger = new StructuredLogger({
    service: "AgentOrchestratorService",
    version: "1.0.0",
  });

  const orchestrator = new AgentOrchestratorService(
    plannerAdapter,
    coderAdapter,
    options,
    eventBus,
    logger
  );

  // Wire default observability handlers
  orchestrator.on("orchestration:started", (event) => {
    logger.info("▶ Orchestration started", {
      sessionId: event.sessionId,
      goal: (event.data as { goal: string }).goal,
    });
  });

  orchestrator.on("orchestration:completed", (event) => {
    const data = event.data as {
      success: boolean;
      totalDurationMs: number;
      stepsCompleted: number;
    };
    logger.info("✓ Orchestration completed", {
      sessionId: event.sessionId,
      success: data.success,
      totalDurationMs: data.totalDurationMs,
      stepsCompleted: data.stepsCompleted,
    });
  });

  orchestrator.on("orchestration:failed", (event) => {
    logger.error("✗ Orchestration failed", undefined, {
      sessionId: event.sessionId,
      error: event.data,
    });
  });

  orchestrator.on("circuit-breaker:open", (event) => {
    logger.warn("⚡ Circuit breaker opened", {
      sessionId: event.sessionId,
      data: event.data,
    });
  });

  return orchestrator;
}

// ─── Re-exports for consumers ─────────────────────────────────────────────────

export {
  validatePlan,
  topologicalSort,
  withRetry,
  generateId,
  StructuredLogger,
};

export type { CircuitState, CacheEntry, CacheOptions };
```

**Key design decisions:**

1. **Self-contained** — All supporting infrastructure (logger, circuit breaker, cache, event bus, retry) is co-located in this file until the plan's other files are created. Each is a clean class that can be extracted to `src/core/*` without API changes.

2. **Adapter pattern** — `PlannerAdapter` and `CoderAdapter` interfaces bridge the new orchestration layer to the existing `src/ai/agents/*` without modifying them. Consumers provide shims.

3. **Circuit breaker per agent** — Separate `plannerCircuit` and `coderCircuit` so a flaky coder doesn't block planning and vice versa.

4. **Topological sort** — Steps with `dependsOn` are executed in correct dependency order; circular deps throw immediately with a clear message.

5. **Dual execution modes** — Sequential (default, deterministic) and batched concurrent (opt-in via `maxConcurrentSteps`).

6. **Event bus decoupling** — All side effects (logging, cache invalidation, webhooks) attach via `orchestrator.on(...)` without touching core logic.

7. **Structured errors** — Every error carries `code`, `phase`, `stepId`, `filePath`, and `retryable` flag for downstream handling and alerting.