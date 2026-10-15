import { createHash } from "node:crypto";
import { prisma } from "../../../../db/prisma";
import type { SecretStoreRecord } from "../../secretStore/SecretStore";

export type ProviderDiscoveryIdentity = Pick<SecretStoreRecord,
  "provider" | "key" | "baseURL" | "authMode" | "requestProtocol" | "createdAt" | "updatedAt">;
export interface ProviderDiscovery {
  models: string[];
  discoveredAt: string;
  requestStartedAt: number;
}
const prefix = "provider.modelDiscovery.";
let lastRequestStartedAt = 0;

export function beginProviderDiscovery(): number {
  lastRequestStartedAt = Math.max(Date.now(), lastRequestStartedAt + 0.001);
  return lastRequestStartedAt;
}

export function matchesProviderDiscoveryRecord(a: ProviderDiscoveryIdentity, b: ProviderDiscoveryIdentity): boolean {
  return identity(a) === identity(b) && a.updatedAt.getTime() === b.updatedAt.getTime();
}

function identity(record: ProviderDiscoveryIdentity): string {
  // Store only a digest; credentials and URLs (which may contain credentials) stay in the secret store.
  return createHash("sha256").update(JSON.stringify([
    record.provider, record.createdAt.toISOString(), record.baseURL?.trim() ?? "",
    record.key?.trim() ?? "", record.authMode, record.requestProtocol,
  ])).digest("hex");
}

function parse(value: string | undefined, record: ProviderDiscoveryIdentity): ProviderDiscovery | null {
  try {
    const data = JSON.parse(value ?? "null");
    if (!data || data.version !== 1 || data.identity !== identity(record)
      || !Array.isArray(data.models) || !data.models.length
      || !data.models.every((item: unknown) => typeof item === "string" && item.trim())
      || typeof data.discoveredAt !== "string" || !Number.isFinite(Date.parse(data.discoveredAt))
      || !Number.isFinite(data.requestStartedAt)) return null;
    return { models: data.models, discoveredAt: data.discoveredAt, requestStartedAt: data.requestStartedAt };
  } catch { return null; }
}

export async function readProviderDiscovery(record: ProviderDiscoveryIdentity): Promise<ProviderDiscovery | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: prefix + record.provider } });
  return parse(setting?.value, record);
}

export async function saveProviderDiscovery(
  record: ProviderDiscoveryIdentity, models: string[], requestStartedAt: number,
): Promise<boolean> {
  const normalized = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
  if (!normalized.length) return false;
  return prisma.$transaction(async (tx) => {
    // A conditional no-op write locks the provider until this discovery commits. A changed/deleted
    // configuration cannot receive a delayed response from a previous request, even across processes.
    const locked = await tx.$executeRaw`UPDATE "APIKey" SET "provider" = "provider" WHERE "provider" = ${record.provider}`;
    if (locked !== 1) return false;
    const current = await tx.aPIKey.findUnique({ where: { provider: record.provider } });
    // Compare decoded dates, so legacy SQLite epoch timestamps and ISO timestamps behave identically.
    if (!current || !matchesProviderDiscoveryRecord(record, current)) return false;
    const key = prefix + record.provider;
    const previous = parse((await tx.appSetting.findUnique({ where: { key } }))?.value, record);
    if (previous && previous.requestStartedAt >= requestStartedAt) return false;
    const value = JSON.stringify({ version: 1, identity: identity(record), models: normalized,
      requestStartedAt, discoveredAt: new Date().toISOString() });
    await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return true;
  });
}

export async function deleteProviderDiscovery(record: ProviderDiscoveryIdentity): Promise<void> {
  const key = prefix + record.provider;
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (setting && parse(setting.value, record)) {
    await prisma.appSetting.deleteMany({ where: { key, value: setting.value } });
  }
}
