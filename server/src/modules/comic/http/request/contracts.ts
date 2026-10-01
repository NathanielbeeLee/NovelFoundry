import { z } from "zod";

export const assetIdParams = z.object({ assetId: z.string().trim().min(1) });

export const sceneIdParams = z.object({ sceneId: z.string().trim().min(1) });

export const idParams = z.object({ id: z.string().trim().min(1) });

export const episodeIdParams = z.object({ episodeId: z.string().trim().min(1) });

export const panelIdParams = z.object({ panelId: z.string().trim().min(1) });

export const charIdParams = z.object({ charId: z.string().trim().min(1) });

export const charSheetVersionParams = z.object({ charId: z.string().trim().min(1), version: z.coerce.number().int().min(1) });

export const factIdParams = z.object({ factId: z.string().trim().min(1) });

export const excludedReferenceImageUrlsSchema = z.array(z.string().trim().min(1).max(1000)).max(24).optional();

export const imageGenerateSchema = z
  .object({
    provider: z.string().trim().optional(),
    promptOverride: z.string().trim().max(4000).optional(),
    providerOverride: z.string().trim().optional(),
    sizeOverride: z.string().trim().max(20).optional(),
    negativePromptOverride: z.string().trim().max(2000).optional(),
    excludedReferenceImageUrls: excludedReferenceImageUrlsSchema,
  })
  .optional();
