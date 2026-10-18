import { AsyncLocalStorage } from "node:async_hooks";

export const DEFAULT_LLM_REQUEST_BUDGET = 8;
export const LLM_REQUEST_BUDGET_EXHAUSTED = "LLM_REQUEST_BUDGET_EXHAUSTED";

export interface LlmRequestBudget {
  readonly label: string;
  readonly maxRequests: number;
  readonly requestsUsed: number;
}

export class LlmRequestBudgetExhaustedError extends Error {
  readonly code = LLM_REQUEST_BUDGET_EXHAUSTED;

  constructor(readonly budget: LlmRequestBudget) {
    super(`[${budget.label}] LLM request budget exhausted (${budget.requestsUsed}/${budget.maxRequests}).`);
    this.name = "LlmRequestBudgetExhaustedError";
  }
}

const budgetStorage = new AsyncLocalStorage<LlmRequestBudget>();
const budgetCounters = new WeakMap<LlmRequestBudget, { requestsUsed: number }>();

export function createLlmRequestBudget(input: {
  label: string;
  maxRequests?: number;
}): LlmRequestBudget {
  const maxRequests = input.maxRequests ?? DEFAULT_LLM_REQUEST_BUDGET;
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError("LLM request budget must be a positive safe integer.");
  }
  const counter = { requestsUsed: 0 };
  const budget: LlmRequestBudget = Object.freeze({
    label: input.label,
    maxRequests,
    get requestsUsed() { return counter.requestsUsed; },
  });
  budgetCounters.set(budget, counter);
  return budget;
}

export function withLlmRequestBudget<T>(
  budget: LlmRequestBudget,
  run: () => Promise<T>,
): Promise<T> {
  // An inner assessment or repair cannot refresh its enclosing phase's budget.
  const activeBudget = budgetStorage.getStore();
  if (activeBudget) return run();
  if (!budgetCounters.has(budget)) {
    throw new TypeError("LLM request budgets must be created with createLlmRequestBudget.");
  }
  return budgetStorage.run(budget, run);
}

export function runWithLlmRequestBudget<T>(
  input: { label: string; maxRequests?: number },
  run: () => Promise<T>,
): Promise<T> {
  if (budgetStorage.getStore()) return run();
  return withLlmRequestBudget(createLlmRequestBudget(input), run);
}

/** Charge immediately before an actual transport fetch, including SDK retries. */
export function consumeLlmRequestBudget(): void {
  const budget = budgetStorage.getStore();
  if (!budget) return;
  const counter = budgetCounters.get(budget)!;
  if (counter.requestsUsed >= budget.maxRequests) {
    throw new LlmRequestBudgetExhaustedError(budget);
  }
  // Synchronous reservation also bounds concurrent child requests in this scope.
  counter.requestsUsed += 1;
}

export function isLlmRequestBudgetExhausted(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && current.code === LLM_REQUEST_BUDGET_EXHAUSTED) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
