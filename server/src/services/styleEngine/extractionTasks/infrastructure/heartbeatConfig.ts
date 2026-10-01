import { parseTimeoutMs } from "../domain/taskPolicy";

export const STYLE_EXTRACTION_HEARTBEAT_INTERVAL_MS = parseTimeoutMs(
  process.env.STYLE_EXTRACTION_TASK_HEARTBEAT_INTERVAL_MS,
  10_000,
  5_000,
  60_000,
);
