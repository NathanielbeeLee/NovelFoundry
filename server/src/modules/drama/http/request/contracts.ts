import { z } from "zod";

export const llmOptionsSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

export const imageProviderBodySchema = z
  .object({
    provider: z.string().trim().optional(),
    useCharacterRefImages: z.boolean().optional(),
    promptOverride: z.string().trim().max(4000).optional(),
    providerOverride: z.string().trim().optional(),
    sizeOverride: z.string().trim().max(20).optional(),
    negativePromptOverride: z.string().trim().max(2000).optional(),
    excludedReferenceImageUrls: z.array(z.string().trim().min(1).max(1000)).max(24).optional(),
  })
  .optional();

export const idParamsSchema = z.object({ id: z.string().trim().min(1) });

export const episodeParamsSchema = z.object({
  id: z.string().trim().min(1),
  order: z.coerce.number().int().min(1),
});

export const characterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});

export const storyboardParamsSchema = z.object({ storyboardId: z.string().trim().min(1) });

export const shotParamsSchema = z.object({
  id: z.string().trim().min(1),
  shotId: z.string().trim().min(1),
});

export const videoPromptParamsSchema = z.object({ videoPromptId: z.string().trim().min(1) });

export const shotImageParamsSchema = z.object({ shotId: z.string().trim().min(1) });

export const shotImageVersionParamsSchema = z.object({
  shotId: z.string().trim().min(1),
  version: z.string().trim().regex(/^v?\d+$/),
});

export const charImageParamsSchema = z.object({
  characterId: z.string().trim().min(1),
});

export const charImageVersionParamsSchema = z.object({
  characterId: z.string().trim().min(1),
  version: z.string().trim().regex(/^v?\d+$/),
});

export const threeViewParamsSchema = z.object({
  characterId: z.string().trim().min(1),
  view: z.enum(["front", "side", "back"]),
});
