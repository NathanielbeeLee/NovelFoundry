import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Product owners provide the authority check; the DB layer knows no director rules. */
export interface ExecutionWriteScope {
  signal: AbortSignal;
  assertLive(): void;
  lock(tx: Prisma.TransactionClient): Promise<void>;
}
interface ScopedTransaction {
  client: Prisma.TransactionClient;
  open: boolean;
  afterCommit: Array<() => Promise<void>>;
}
interface ScopeContext { authority: ExecutionWriteScope; background: Promise<unknown>[]; transaction?: ScopedTransaction }
const storage = new AsyncLocalStorage<ScopeContext>();
export function runWithExecutionWriteScope<T>(authority: ExecutionWriteScope, run: () => T): T {
  authority.assertLive();
  return storage.run({ authority, background: [] }, run);
}
export function executionSignal(signal?: AbortSignal): AbortSignal | undefined {
  const authority = storage.getStore()?.authority;
  if (!authority) return signal;
  authority.assertLive();
  return signal ? AbortSignal.any([signal, authority.signal]) : authority.signal;
}

/** Register director-owned scheduled work before returning from its dispatch entrypoint. */
export function scheduleExecutionWork(run: () => Promise<unknown>): boolean {
  const scope = storage.getStore();
  if (!scope) return false;
  assertScope(scope);
  if (scope.transaction) throw new Error("Background work cannot start inside a write transaction.");
  const work = new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
    assertScope(scope);
    return run();
  });
  // A dispatch may still be awaiting other work when its child fails.
  void work.catch(() => undefined);
  scope.background.push(work);
  return true;
}

export async function drainExecutionWork(): Promise<void> {
  const scope = storage.getStore();
  if (!scope) return;
  while (scope.background.length) {
    const batch = scope.background.splice(0);
    const settled = await Promise.allSettled(batch);
    scope.authority.assertLive();
    const failed = settled.find((item) => item.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}

export function afterExecutionCommit(notify: () => Promise<void>): boolean {
  const scope = storage.getStore();
  if (!scope?.transaction) return false;
  assertScope(scope);
  scope.transaction.afterCommit.push(notify);
  return true;
}

const MUTATIONS = new Set([
  "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn",
  "upsert", "delete", "deleteMany",
]);
interface DeferredOperation { scope: ScopeContext; run(tx: Prisma.TransactionClient): Promise<unknown> }
const deferred = new WeakMap<object, DeferredOperation>();

function assertScope(scope: ScopeContext): void {
  scope.authority.assertLive();
  if (scope.transaction && !scope.transaction.open) throw new Error("Execution transaction has already closed.");
}

/** Outside a scope the exact delegates and PrismaPromises pass through unchanged. */
export function withExecutionWriteFence(raw: PrismaClient): PrismaClient {
  async function transaction<T>(scope: ScopeContext, run: (tx: Prisma.TransactionClient) => Promise<T>, options?: unknown): Promise<T> {
    assertScope(scope);
    if (scope.transaction) return run(scope.transaction.client);
    const committed: Array<() => Promise<void>> = [];
    const result = await raw.$transaction(async (tx) => {
      assertScope(scope);
      // Conditional authority write uses this exact connection and holds its row lock to commit.
      await scope.authority.lock(tx);
      const state = { client: tx, open: true, afterCommit: committed };
      try {
        return await storage.run({ ...scope, transaction: state }, async () => {
          const result = await run(tx);
          scope.authority.assertLive();
          return result;
        });
      } finally {
        state.open = false;
      }
    }, options as { timeout?: number; maxWait?: number });
    // Only committed transitions may notify; notification I/O never holds the claim row lock.
    for (const notify of committed) await storage.exit(notify);
    return result;
  }

  function lazy(scope: ScopeContext, run: (tx: Prisma.TransactionClient) => Promise<unknown>, mutation: boolean) {
    // Do not execute at construction: array transactions must not leak writes before fencing.
    let pending: Promise<unknown> | undefined;
    const execute = () => pending ??= (async () => {
      assertScope(scope);
      const active = storage.getStore();
      const effective = active?.authority === scope.authority ? active : scope;
      if (mutation) return transaction(effective, run);
      return run(effective.transaction?.client ?? raw);
    })();
    const promise = {
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
      catch: (reject: any) => execute().catch(reject),
      finally: (settled: any) => execute().finally(settled),
      [Symbol.toStringTag]: "PrismaPromise",
    };
    deferred.set(promise, { scope, run });
    return promise;
  }

  function scopedClient(client: Prisma.TransactionClient | PrismaClient, scope: ScopeContext): PrismaClient {
    return new Proxy(client as PrismaClient, {
      get(target, key) {
        if (key === "$transaction") return (operation: unknown, options?: unknown) => transaction(scope, async (tx) => {
          const active = storage.getStore() ?? scope;
          if (typeof operation === "function") return operation(scopedClient(tx, active));
          if (!Array.isArray(operation)) throw new Error("Invalid scoped transaction operation.");
          const operations = operation.map((item) => deferred.get(item));
          if (operations.some((item) => !item || item.scope.authority !== scope.authority)) {
            throw new Error("Scoped array transactions require operations created by the scoped Prisma facade.");
          }
          const results = [];
          for (const item of operations) {
            assertScope(active);
            assertScope(item!.scope);
            results.push(await item!.run(tx));
          }
          return results;
        }, options);
        const value = Reflect.get(target, key, target);
        if (typeof key === "string" && key.startsWith("$")) {
          if (["$extends", "$use"].includes(key)) throw new Error("Client extensions cannot escape an execution write scope.");
          // Raw query APIs can write (including queryRaw RETURNING); fence all of them.
          if (["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"].includes(key)) {
            return (...args: unknown[]) => lazy(scope, (tx) => (tx as any)[key](...args), true);
          }
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (!value || typeof value !== "object") return value;
        return new Proxy(value, {
          get(delegate, method) {
            const operation = Reflect.get(delegate, method, delegate);
            if (typeof operation !== "function") return operation;
            return (...args: unknown[]) => lazy(scope, async (tx) => {
              assertScope(storage.getStore() ?? scope);
              return (tx as any)[key][method](...args);
            }, MUTATIONS.has(String(method)));
          },
        });
      },
    });
  }

  return new Proxy(raw, {
    get(target, key) {
      const scope = storage.getStore();
      if (scope) return Reflect.get(scopedClient(target, scope), key);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
