import type { ChatOpenAI } from "@langchain/openai";
import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import { AsyncLocalStorage } from "node:async_hooks";
import { holdStreamPermit } from "./streamLifecycle";

const LLM_REQUEST_LIMITER_PATCHED = Symbol("LLM_REQUEST_LIMITER_PATCHED");

export interface ProviderModelLimitOptions {
  provider: LLMProvider;
  model: string;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_REQUEST_LIMITER_PATCHED]?: boolean;
};

function normalizeNonNegativeInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

class ProviderModelRequestLimiter {
  private readonly concurrencyLimit: number;
  private readonly requestIntervalMs: number;
  private readonly queue: Array<{
    signal?: AbortSignal;
    abort: () => void;
    resolve: (permit: { release(): void }) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private activeCount = 0;
  private nextStartAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ProviderModelLimitOptions) {
    this.concurrencyLimit = normalizeNonNegativeInteger(options.concurrencyLimit);
    this.requestIntervalMs = normalizeNonNegativeInteger(options.requestIntervalMs);
  }

  acquire(signal?: AbortSignal): Promise<{ release(): void }> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const entry = { signal, resolve, reject, abort: () => {
        const index = this.queue.indexOf(entry);
        if (index < 0) return;
        this.queue.splice(index, 1);
        signal?.removeEventListener("abort", entry.abort);
        reject(signal?.reason);
        this.processQueue();
      } };
      this.queue.push(entry);
      signal?.addEventListener("abort", entry.abort, { once: true });
      this.processQueue();
    });
  }

  async run<T>(operation: () => Promise<T> | T, signal?: AbortSignal): Promise<T> {
    const permit = await this.acquire(signal);
    try {
      signal?.throwIfAborted();
      return await operation();
    } finally {
      permit.release();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    if (this.concurrencyLimit > 0 && this.activeCount >= this.concurrencyLimit) {
      return;
    }

    const waitMs = this.requestIntervalMs > 0 ? this.nextStartAt - Date.now() : 0;
    if (waitMs > 0) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, waitMs);
      }
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }
    next.signal?.removeEventListener("abort", next.abort);
    this.activeCount += 1;
    if (this.requestIntervalMs > 0) this.nextStartAt = Date.now() + this.requestIntervalMs;
    let released = false;
    next.resolve({ release: () => {
      if (released) return;
      released = true;
      this.activeCount -= 1;
      this.processQueue();
    } });
    this.processQueue();
  }
}

const sharedLimiters = new Map<string, ProviderModelRequestLimiter>();

function getLimiterKey(options: ProviderModelLimitOptions): string {
  return [
    options.provider,
    options.model,
    normalizeNonNegativeInteger(options.concurrencyLimit),
    normalizeNonNegativeInteger(options.requestIntervalMs),
  ].join(":");
}

export function createProviderModelLimiter(options: ProviderModelLimitOptions): ProviderModelRequestLimiter {
  return new ProviderModelRequestLimiter(options);
}

/**
 * 当 provider 配置变更时调用，淘汰该 provider 下所有旧限速器实例。
 * 持有旧实例引用的 LLM 客户端仍可完成在途请求，新请求将使用新配置创建的实例。
 */
export function evictSharedLimiters(provider: string): void {
  const prefix = `${provider}:`;
  for (const key of sharedLimiters.keys()) {
    if (key.startsWith(prefix)) {
      sharedLimiters.delete(key);
    }
  }
}

function getSharedProviderModelLimiter(options: ProviderModelLimitOptions): ProviderModelRequestLimiter {
  const key = getLimiterKey(options);
  const existing = sharedLimiters.get(key);
  if (existing) {
    return existing;
  }
  const created = createProviderModelLimiter(options);
  sharedLimiters.set(key, created);
  return created;
}

export function attachLLMRequestLimiter(llm: ChatOpenAI, options: ProviderModelLimitOptions): ChatOpenAI {
  const concurrencyLimit = normalizeNonNegativeInteger(options.concurrencyLimit);
  const requestIntervalMs = normalizeNonNegativeInteger(options.requestIntervalMs);
  if (concurrencyLimit === 0 && requestIntervalMs === 0) {
    return llm;
  }

  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_REQUEST_LIMITER_PATCHED]) {
    return llm;
  }

  const limiter = getSharedProviderModelLimiter({
    ...options,
    concurrencyLimit,
    requestIntervalMs,
  });
  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const streamFallback = new AsyncLocalStorage<{ input: unknown; available: boolean; active: boolean }>();

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    // LangChain's disabled-stream adapter invokes this same input under its stream permit.
    const fallback = streamFallback.getStore();
    if (fallback?.active && fallback.available && fallback.input === args[0]) {
      fallback.available = false;
      return originalInvoke(...args);
    }
    return limiter.run(() => originalInvoke(...args), args[1]?.signal);
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const signal = args[1]?.signal;
    const permit = await limiter.acquire(signal);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });
    if (signal?.aborted) forwardAbort();
    const fallback = { input: args[0], available: llm.disableStreaming === true, active: true };
    const release = () => {
      signal?.removeEventListener("abort", forwardAbort);
      fallback.active = false;
      permit.release();
    };
    const withinStream = <T>(operation: () => T) => streamFallback.run(fallback, operation);
    try {
      controller.signal.throwIfAborted();
      const stream = await withinStream(() => originalStream(args[0], { ...args[1], signal: controller.signal }));
      return holdStreamPermit(stream, release, controller.signal, withinStream, reason => controller.abort(reason));
    } catch (error) {
      controller.abort(error);
      release();
      throw error;
    }
  }) as ChatOpenAI["stream"];

  // Installed LangChain and Anthropic batches call this.invoke per item. An outer
  // permit would double-count requests and deadlock a concurrency limit of one.

  Object.defineProperty(patchable, LLM_REQUEST_LIMITER_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
