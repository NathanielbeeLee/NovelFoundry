import type { StyleDetectionReport, StyleRewriteResult } from "@novelfoundry/shared/types/styleEngine";
import { readStyleRewritePreview } from "../domain/result.ts";

export interface StyleRewritePreviewInput {
  content: string;
  styleProfileId?: string;
  previewAntiAiRuleIds: readonly string[];
  provider: string;
  model: string;
  /** Includes rule definitions, profile configuration and the model selection. */
  configurationKey: string;
}

export interface StyleRewritePreviewRequest {
  content: string;
  styleProfileId?: string;
  previewAntiAiRuleIds: string[];
  provider: string;
  model: string;
  temperature: number;
}

interface PreviewOperations {
  detect: (input: StyleRewritePreviewRequest, signal: AbortSignal) => Promise<StyleDetectionReport>;
  rewrite: (input: StyleRewritePreviewRequest & {
    issues: Array<{ ruleName: string; excerpt: string; suggestion: string }>;
  }, signal: AbortSignal) => Promise<unknown>;
  isInputCurrent?: (key: string) => boolean;
}

export interface StyleRewritePreviewState {
  key: string;
  operation: "detect" | "rewrite" | null;
  report: StyleDetectionReport | null;
  preview: StyleRewriteResult | null;
  notice: string | null;
  error: string | null;
}

interface RequestTicket {
  key: string;
  input: StyleRewritePreviewInput;
  controller: AbortController;
}

export function styleRewritePreviewInputKey(input: StyleRewritePreviewInput): string {
  return JSON.stringify([
    input.content, input.styleProfileId ?? "", [...input.previewAntiAiRuleIds].sort(),
    input.provider, input.model, input.configurationKey,
  ]);
}

export function emptyStyleRewritePreviewState(key: string): StyleRewritePreviewState {
  return { key, operation: null, report: null, preview: null, notice: null, error: null };
}

/** Owns one read-only preview request and its source-bound detection cache. */
export class StyleRewritePreviewSession {
  private state = emptyStyleRewritePreviewState("");
  private active: RequestTicket | null = null;
  private readonly operations: PreviewOperations;
  private readonly listener: (state: StyleRewritePreviewState) => void;

  constructor(operations: PreviewOperations, listener: (state: StyleRewritePreviewState) => void) {
    this.operations = operations;
    this.listener = listener;
  }

  getState(): StyleRewritePreviewState { return this.state; }

  setInput(input: StyleRewritePreviewInput): void {
    const key = styleRewritePreviewInputKey(input);
    if (key === this.state.key) return;
    this.cancel();
    this.state = emptyStyleRewritePreviewState(key);
    this.listener(this.state);
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = null;
  }

  private update(patch: Partial<StyleRewritePreviewState>): void {
    this.state = { ...this.state, ...patch };
    this.listener(this.state);
  }

  private begin(input: StyleRewritePreviewInput, operation: "detect" | "rewrite"): RequestTicket | null {
    this.setInput(input);
    if (this.active || !input.content.trim()) return null;
    const captured = Object.freeze({ ...input, previewAntiAiRuleIds: Object.freeze([...input.previewAntiAiRuleIds]) });
    const ticket = { key: this.state.key, input: captured, controller: new AbortController() };
    this.active = ticket;
    this.update({ operation, preview: null, error: null, notice: null, ...(operation === "detect" ? { report: null } : {}) });
    return ticket;
  }

  private current(ticket: RequestTicket): boolean {
    return this.active === ticket && !ticket.controller.signal.aborted
      && this.state.key === ticket.key && (this.operations.isInputCurrent?.(ticket.key) ?? true);
  }

  private request(ticket: RequestTicket, temperature: number): StyleRewritePreviewRequest {
    return {
      content: ticket.input.content,
      styleProfileId: ticket.input.styleProfileId,
      previewAntiAiRuleIds: [...ticket.input.previewAntiAiRuleIds],
      provider: ticket.input.provider,
      model: ticket.input.model,
      temperature,
    };
  }

  private failure(ticket: RequestTicket, error: unknown, message: string): void {
    if (this.current(ticket)) this.update({ error: error instanceof Error ? error.message : message });
  }

  private finish(ticket: RequestTicket): void {
    if (!this.current(ticket)) return;
    this.active = null;
    this.update({ operation: null });
  }

  async detect(input: StyleRewritePreviewInput): Promise<void> {
    const ticket = this.begin(input, "detect");
    if (!ticket) return;
    try {
      const report = await this.operations.detect(this.request(ticket, 0.2), ticket.controller.signal);
      if (this.current(ticket)) this.update({ report });
    } catch (error) {
      this.failure(ticket, error, "检测失败，请重试。");
    } finally { this.finish(ticket); }
  }

  async rewrite(input: StyleRewritePreviewInput): Promise<void> {
    const ticket = this.begin(input, "rewrite");
    if (!ticket) return;
    try {
      const report = this.state.report ?? await this.operations.detect(this.request(ticket, 0.2), ticket.controller.signal);
      if (!this.current(ticket)) return;
      this.update({ report });
      if (report.violations.length === 0) {
        this.update({ notice: "原文没有命中需要修文的规则，未生成修订稿。" });
        return;
      }
      const response = await this.operations.rewrite({
        ...this.request(ticket, 0.5),
        issues: report.violations.map(({ ruleName, excerpt, suggestion }) => ({ ruleName, excerpt, suggestion })),
      }, ticket.controller.signal);
      if (this.current(ticket)) this.update({ preview: readStyleRewritePreview(response, ticket.input.content) });
    } catch (error) {
      this.failure(ticket, error, "生成修订稿失败，请重试。");
    } finally { this.finish(ticket); }
  }
}
