import { prisma } from "../../../db/prisma";
import type { LegacyVolumeSource } from "./volumePlanUtils";
import { readLegacyVolumeSource } from "./workspace/infrastructure/LegacyVolumeSourceQuery";

export async function getLegacyVolumeSource(novelId: string): Promise<LegacyVolumeSource> {
  return readLegacyVolumeSource(prisma, novelId);
}
