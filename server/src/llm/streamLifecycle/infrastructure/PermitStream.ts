import { IterableReadableStream } from "@langchain/core/utils/stream";

type CancellableSource<T> = AsyncIterable<T> & { cancel?(reason?: unknown): Promise<void> };

/** A permit belongs to the provider stream until completion or awaited shutdown. */
export function holdStreamPermit<T>(
  source: CancellableSource<T>,
  release: () => void,
  signal?: AbortSignal,
  withinStream: <R>(operation: () => R) => R = (operation) => operation(),
  abortRequest?: (reason?: unknown) => void,
): IterableReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  let controller: ReadableStreamDefaultController<T>;
  let stopped = false;
  let finished = false;
  let closing: Promise<void> | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener("abort", aborted);
    release();
  };
  const close = (reason?: unknown): Promise<void> => {
    if (closing) return closing;
    stopped = true;
    closing = Promise.resolve().then(async () => {
      try {
        // SDK iterator.return can wait behind a pending read; abort its transport first.
        abortRequest?.(reason);
        try {
          if (!(source instanceof ReadableStream && source.locked)) await withinStream(() => source.cancel?.(reason));
        }
        finally { await withinStream(() => iterator.return?.()); }
      }
      finally { finish(); }
    });
    return closing;
  };
  const aborted = () => {
    if (stopped) return;
    // Reject readers promptly, but keep capacity occupied until transport cleanup settles.
    controller.error(signal?.reason);
    void close(signal?.reason).catch(() => undefined);
  };
  const stream = new IterableReadableStream<T>({
    start(value) { controller = value; },
    async pull(value) {
      if (stopped) return;
      try {
        signal?.throwIfAborted();
        const result = await withinStream(() => iterator.next());
        if (stopped) return;
        if (result.done) {
          stopped = true;
          finish();
          value.close();
        } else {
          value.enqueue(result.value);
        }
      } catch (error) {
        if (!stopped) value.error(error);
        await close(error).catch(() => undefined);
      }
    },
    cancel: close,
  }, { highWaterMark: 0 });
  signal?.addEventListener("abort", aborted, { once: true });
  if (signal?.aborted) aborted();
  return stream;
}
