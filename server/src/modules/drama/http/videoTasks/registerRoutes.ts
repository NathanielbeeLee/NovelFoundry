import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaVideoPromptService } from "../../../../services/drama/DramaVideoPromptService";

import { videoPromptParamsSchema } from "../request/contracts";

export const providerTaskSchema = z
  .object({
    provider: z.string().trim().min(1).optional(),
  })
  .optional();

export function registerDramaVideoTasksRoutes(router: Router): void {
router.post("/video-prompts/:videoPromptId/provider-task", validate({ params: videoPromptParamsSchema, body: providerTaskSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const body = (req.body ?? {}) as { provider?: string };
    const data = await dramaVideoPromptService.createProviderTask(videoPromptId, body.provider ?? "mock");
    res.status(200).json({ success: true, data, message: "Drama video task created." });
  } catch (error) {
    next(error);
  }
});

router.post("/video-prompts/:videoPromptId/provider-task/refresh", validate({ params: videoPromptParamsSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const data = await dramaVideoPromptService.refreshProviderTask(videoPromptId);
    res.status(200).json({ success: true, data, message: "Drama video task refreshed." });
  } catch (error) {
    next(error);
  }
});
}
