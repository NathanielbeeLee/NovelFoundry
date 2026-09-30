import { StreamOutcomeError, type StrictStreamPolicy } from "./StreamOutcome";

/** One scope owns the underlying request's abort, first/idle watchdog and total deadline. */
export class StreamExecutionScope {
  readonly controller = new AbortController();
  readonly aborted: Promise<never>;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private readonly upstream?: AbortSignal;
  private readonly forwardAbort = () => this.abort("cancelled");

  constructor(readonly policy: StrictStreamPolicy, signal?: AbortSignal) {
    this.upstream = signal;
    this.aborted = new Promise<never>((_resolve, reject) => {
      this.controller.signal.addEventListener("abort", () => reject(this.controller.signal.reason), { once: true });
    });
    void this.aborted.catch(() => undefined);
    if (signal?.aborted) this.forwardAbort();
    else signal?.addEventListener("abort", this.forwardAbort, { once: true });
    this.watchdog = setTimeout(() => this.abort("first_response_timeout"), policy.firstResponseTimeoutMs ?? 90_000);
    this.deadline = setTimeout(() => this.abort("deadline"), policy.totalTimeoutMs ?? 600_000);
  }
  get signal(): AbortSignal { return this.controller.signal; }
  race<T>(work: Promise<T>): Promise<T> { return Promise.race([work, this.aborted]); }
  progress(): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.abort("idle_timeout"), this.policy.idleTimeoutMs ?? 60_000);
  }
  abort(kind: ConstructorParameters<typeof StreamOutcomeError>[0]): void {
    if (!this.signal.aborted) this.controller.abort(new StreamOutcomeError(kind));
  }
  dispose(): void {
    clearTimeout(this.watchdog);
    clearTimeout(this.deadline);
    this.upstream?.removeEventListener("abort", this.forwardAbort);
  }
}
