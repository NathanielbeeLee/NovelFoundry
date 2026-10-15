/** A claim generation, not merely a reusable worker/slot name. */
export interface CommandLeaseIdentity {
  commandId: string;
  owner: string;
  attempt: number;
}

export class CommandLeaseLostError extends Error {
  readonly code = "DIRECTOR_COMMAND_LEASE_LOST";
  constructor(readonly identity: CommandLeaseIdentity) {
    super("后台执行权已移交，请从已保存的进度继续。");
    this.name = "CommandLeaseLostError";
  }
}

export class CommandLeaseAuthority {
  private readonly controller = new AbortController();
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private deadline: number;
  readonly signal = this.controller.signal;

  constructor(readonly identity: CommandLeaseIdentity, deadline: Date | number) {
    this.deadline = Number(deadline);
    this.scheduleExpiry();
  }

  assertLive(): void {
    if (!Number.isFinite(this.deadline) || Date.now() >= this.deadline) this.revoke();
    this.signal.throwIfAborted();
  }

  async wait<T>(work: Promise<T>): Promise<T> {
    void work.catch(() => undefined);
    this.assertLive();
    let lost: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      lost = () => reject(this.signal.reason);
      this.signal.addEventListener("abort", lost, { once: true });
      if (this.signal.aborted) lost();
    });
    try { return await Promise.race([work, aborted]); }
    finally { this.signal.removeEventListener("abort", lost); }
  }

  confirmRenewal(deadline: number): void {
    // Late successful replies never resurrect an expired/revoked attempt.
    this.assertLive();
    this.deadline = Math.max(this.deadline, deadline);
    this.scheduleExpiry();
  }

  revoke(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.controller.abort(new CommandLeaseLostError(this.identity));
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (!Number.isFinite(this.deadline) || this.deadline <= Date.now()) {
      this.revoke();
      return;
    }
    this.expiryTimer = setTimeout(() => this.revoke(), this.deadline - Date.now());
    this.expiryTimer.unref?.();
  }
}
