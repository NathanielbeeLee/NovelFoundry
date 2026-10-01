import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaCharacterImageService } from "../../../../services/drama/DramaCharacterImageService";

import { characterParamsSchema, imageProviderBodySchema } from "../request/contracts";

export function registerDramaCharacterImagesRoutes(router: Router): void {
router.get(
  "/projects/:id/characters/:characterId/image-status",
  validate({ params: characterParamsSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterImageService.getImageStatus(characterId);
      res.status(200).json({ success: true, data, message: "Character image status loaded." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/prepare-character-sheet",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const provider = (req.body as { provider?: string } | undefined)?.provider;
      const data = await dramaCharacterImageService.prepareCharacterSheet(
        characterId,
        provider as Parameters<typeof dramaCharacterImageService.prepareCharacterSheet>[1],
      );
      res.status(200).json({ success: true, data, message: "Character sheet preview prepared." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/generate-character-sheet",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as {
        provider?: string;
        promptOverride?: string;
        providerOverride?: string;
        sizeOverride?: string;
        negativePromptOverride?: string;
        excludedReferenceImageUrls?: string[];
      } | undefined;
      const data = await dramaCharacterImageService.generateCharacterSheet(
        characterId,
        body?.provider as Parameters<typeof dramaCharacterImageService.generateCharacterSheet>[1],
        {
          promptOverride: body?.promptOverride,
          providerOverride: body?.providerOverride,
          sizeOverride: body?.sizeOverride as never,
          negativePromptOverride: body?.negativePromptOverride,
          excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
        },
      );
      res.status(200).json({ success: true, data, message: "Character sheet generation completed." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/generate-portrait",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as {
        provider?: string;
        promptOverride?: string;
        providerOverride?: string;
        sizeOverride?: string;
        negativePromptOverride?: string;
        excludedReferenceImageUrls?: string[];
      } | undefined;
      const data = await dramaCharacterImageService.generateCharacterSheet(
        characterId,
        body?.provider as Parameters<typeof dramaCharacterImageService.generateCharacterSheet>[1],
        {
          promptOverride: body?.promptOverride,
          providerOverride: body?.providerOverride,
          sizeOverride: body?.sizeOverride as never,
          negativePromptOverride: body?.negativePromptOverride,
          excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
        },
      );
      res.status(200).json({ success: true, data, message: "Portrait generation completed." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/generate-three-view",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const provider = (req.body as { provider?: string } | undefined)?.provider;
      const data = await dramaCharacterImageService.generateThreeView(
        characterId,
        provider as Parameters<typeof dramaCharacterImageService.generateThreeView>[1],
      );
      res.status(200).json({ success: true, data, message: "Three-view generation completed." });
    } catch (error) {
      next(error);
    }
  },
);
}
