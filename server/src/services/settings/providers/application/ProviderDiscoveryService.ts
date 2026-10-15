import { AppError } from "../../../../middleware/errorHandler";
import { secretStore, type SecretStoreRecord } from "../../secretStore";
import {
  matchesProviderDiscoveryRecord, readProviderDiscovery, saveProviderDiscovery,
} from "../infrastructure/ProviderDiscoveryStore";

// Re-read after remote work: even a failed/fallback response must not reintroduce an old configuration.
export async function resolveProviderDiscovery(
  record: SecretStoreRecord, requestStartedAt: number, discoveredModels?: string[],
) {
  if (discoveredModels) await saveProviderDiscovery(record, discoveredModels, requestStartedAt);
  const current = await secretStore.getProvider(record.provider);
  if (!current || !matchesProviderDiscoveryRecord(record, current)) {
    throw new AppError("厂商配置已更改，请重新加载后刷新模型列表。", 409);
  }
  return readProviderDiscovery(current);
}
