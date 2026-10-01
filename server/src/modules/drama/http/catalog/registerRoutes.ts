import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaGuidanceService } from "../../../../services/drama/guidance/DramaGuidanceService";

import { ttsProviderRegistry } from "../../../../services/drama/audio/TTSProviderPort";

import { rhythmEngine } from "../../../../services/drama/engine/rhythmEngine";

import { videoProviderRegistry } from "../../../../services/drama/video/VideoProviderPort";

export const trackRecommendationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import"]),
  sourceDigest: z.string().trim().max(20000).optional(),
  theme: z.string().trim().max(120).optional(),
  targetEpisodes: z.number().int().min(1).max(500).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export function registerDramaCatalogRoutes(router: Router): void {
router.get("/tracks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listTracks(), message: "Drama tracks loaded." });
});

router.get("/hooks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listHooks(), message: "Drama hooks loaded." });
});

router.get("/video-providers", (_req, res) => {
  const data = videoProviderRegistry.listProviders();
  res.status(200).json({ success: true, data, message: "Drama video providers loaded." });
});

router.get("/tts-providers", (_req, res) => {
  const data = ttsProviderRegistry.listProviders();
  res.status(200).json({ success: true, data, message: "Drama TTS providers loaded." });
});

router.post("/track-recommendation", validate({ body: trackRecommendationSchema }), async (req, res, next) => {
  try {
    const data = await dramaGuidanceService.recommendTrack(req.body as z.infer<typeof trackRecommendationSchema>);
    res.status(200).json({ success: true, data, message: "Drama track recommendation generated." });
  } catch (error) {
    next(error);
  }
});
}
