import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaStoryboardService } from "../../../../services/drama/DramaStoryboardService";

import { dramaVideoPromptService } from "../../../../services/drama/DramaVideoPromptService";

import { dramaShotKeyframeService } from "../../../../services/drama/visual/DramaShotKeyframeService";

import { episodeParamsSchema, llmOptionsSchema, storyboardParamsSchema, shotParamsSchema, imageProviderBodySchema } from "../request/contracts";

export function registerDramaStoryboardsRoutes(router: Router): void {
router.post("/projects/:id/episodes/:order/storyboard", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaStoryboardService.generateStoryboard(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama storyboard generated." });
  } catch (error) {
    next(error);
  }
});

router.get("/storyboards/:storyboardId", validate({ params: storyboardParamsSchema }), async (req, res, next) => {
  try {
    const { storyboardId } = req.params as z.infer<typeof storyboardParamsSchema>;
    const data = await dramaStoryboardService.getStoryboard(storyboardId);
    res.status(200).json({ success: true, data, message: "Drama storyboard loaded." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/video-prompt", validate({ params: shotParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaVideoPromptService.generateVideoPromptForShot(id, shotId, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama video prompt generated." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/keyframe/prepare", validate({ params: shotParamsSchema, body: imageProviderBodySchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const body = req.body as { provider?: string; useCharacterRefImages?: boolean } | undefined;
    const data = await dramaShotKeyframeService.prepareKeyframe(
      shotId,
      body?.provider as Parameters<typeof dramaShotKeyframeService.prepareKeyframe>[1],
      body?.useCharacterRefImages ?? false,
    );
    res.status(200).json({ success: true, data, message: "Drama shot keyframe preview prepared." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/keyframe", validate({ params: shotParamsSchema, body: imageProviderBodySchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const body = req.body as {
      provider?: string;
      useCharacterRefImages?: boolean;
      promptOverride?: string;
      providerOverride?: string;
      sizeOverride?: string;
      negativePromptOverride?: string;
      excludedReferenceImageUrls?: string[];
    } | undefined;
    const data = await dramaShotKeyframeService.generateKeyframe(
      shotId,
      body?.provider as Parameters<typeof dramaShotKeyframeService.generateKeyframe>[1],
      body?.useCharacterRefImages ?? false,
      {
        promptOverride: body?.promptOverride,
        providerOverride: body?.providerOverride,
        sizeOverride: body?.sizeOverride as never,
        negativePromptOverride: body?.negativePromptOverride,
        excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
      },
    );
    res.status(200).json({ success: true, data, message: "Drama shot keyframe generated." });
  } catch (error) {
    next(error);
  }
});
}
