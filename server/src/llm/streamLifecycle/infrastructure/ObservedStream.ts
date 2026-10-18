type CancellableSource<T> = AsyncIterable<T> & { cancel?(reason?: unknown): Promise<void> };

/** Preserve transport cancellation through lazy usage/debug observers, including before first next. */
export function observeStream<T>(
  source: CancellableSource<T>,
  observe: (iterator: AsyncIterableIterator<T>) => AsyncGenerator<T>,
): AsyncIterableIterator<T> & { cancel(reason?: unknown): Promise<void> } {
  const iterator = source[Symbol.asyncIterator]();
  let ended = false;
  let closing: Promise<void> | undefined;
  const closeSource = (reason?: unknown): Promise<void> => closing ??= (async () => {
    if (ended) return;
    // Native ReadableStream.cancel rejects while its iterator owns a reader;
    // iterator.return still owns and closes that reader in the finally block.
    try {
      if (!(source instanceof ReadableStream && source.locked)) await source.cancel?.(reason);
    }
    finally { await iterator.return?.(); }
  })();
  const owned: AsyncIterableIterator<T> = {
    async next() {
      const result = await iterator.next();
      if (result.done) ended = true;
      return result;
    },
    async return() {
      await closeSource();
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() { return this; },
  };
  const observed = observe(owned);
  let stopped = false;
  let stopping: Promise<IteratorResult<T>> | undefined;
  const stop = (reason?: unknown): Promise<IteratorResult<T>> => stopping ??= (async () => {
    stopped = true;
    try { await closeSource(reason); }
    finally { await observed.return(undefined as never); }
    return { done: true, value: undefined };
  })();
  return {
    async next(...args) {
      if (stopped) return { done: true, value: undefined };
      try {
        const result = await observed.next(...args);
        if (result.done) stopped = true;
        return result;
      } catch (error) {
        await stop(error).catch(() => undefined);
        throw error;
      }
    },
    return: () => stop(),
    async throw(error) {
      await stop(error);
      throw error;
    },
    async cancel(reason) { await stop(reason); },
    [Symbol.asyncIterator]() { return this; },
  };
}
