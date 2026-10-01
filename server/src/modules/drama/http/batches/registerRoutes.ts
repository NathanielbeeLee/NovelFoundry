import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaBatchOrchestrator } from "../../../../services/drama/production/DramaBatchOrchestrator";

import { episodeParamsSchema } from "../request/contracts";

export const batchJobBodySchema = z.object({
  type: z.enum(["keyframes", "videos", "tts"]),
  provider: z.string().trim().optional(),
  failedShotIds: z.array(z.string().trim().min(1)).optional(),
  useCharacterRefImages: z.boolean().optional(),
});

export function registerDramaBatchesRoutes(router: Router): void {
router.post("/projects/:id/episodes/:order/batch-jobs", validate({ params: episodeParamsSchema, body: batchJobBodySchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = req.body as z.infer<typeof batchJobBodySchema>;
    const data = await dramaBatchOrchestrator.createEpisodeBatchJob(id, order, body);
    res.status(201).json({ success: true, data, message: "Drama batch job created." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/batch-jobs/estimate", validate({ params: episodeParamsSchema, body: batchJobBodySchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = req.body as z.infer<typeof batchJobBodySchema>;
    const data = await dramaBatchOrchestrator.estimateEpisodeBatchJob(id, order, body);
    res.status(200).json({ success: true, data, message: "Drama batch job cost estimate loaded." });
  } catch (error) {
    next(error);
  }
});
}
