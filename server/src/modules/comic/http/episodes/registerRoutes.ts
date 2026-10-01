import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { idParams, episodeIdParams } from "../request/contracts";

import { comicEpisodePlanService } from "../infrastructure/serviceInstances";

export const generateOutlineSchema = z
  .object({
    startOrder: z.number().int().min(1).optional(),
    count: z.number().int().min(1).max(40).optional(),
    provider: z.string().trim().optional(),
  })
  .optional();

export const sourceTextSchema = z.object({
  sourceText: z.string().max(50000),
});

export const updateEpisodeSchema = z.object({
  title: z.string().trim().max(30).optional(),
  outline: z.string().trim().max(1000).optional(),
  cliffhanger: z.string().trim().max(100).optional(),
  isPaywalled: z.boolean().optional(),
});

export function registerComicEpisodesRoutes(router: Router): void {
router.get("/projects/:id/episodes", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicEpisodePlanService.listEpisodes(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/projects/:id/episodes/generate-outline",
  validate({ params: idParams, body: generateOutlineSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = (req.body ?? {}) as z.infer<typeof generateOutlineSchema>;
      const { provider, ...planInput } = body ?? {};
      const data = await comicEpisodePlanService.generateOutline(
        id,
        planInput,
        provider as Parameters<typeof comicEpisodePlanService.generateOutline>[2],
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/episodes/:episodeId", validate({ params: episodeIdParams }), async (req, res, next) => {
  try {
    const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
    const data = await comicEpisodePlanService.getEpisode(episodeId);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画话数不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch(
  "/episodes/:episodeId/source-text",
  validate({ params: episodeIdParams, body: sourceTextSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const { sourceText } = req.body as z.infer<typeof sourceTextSchema>;
      const data = await comicEpisodePlanService.updateEpisodeSourceText(episodeId, sourceText);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.patch(
  "/episodes/:episodeId",
  validate({ params: episodeIdParams, body: updateEpisodeSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const patch = req.body as z.infer<typeof updateEpisodeSchema>;
      const data = await comicEpisodePlanService.updateEpisode(episodeId, patch);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);
}
