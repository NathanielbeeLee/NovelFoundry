import type { Router } from "express";
import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { validate } from "../../../../middleware/validate";
import { novelRouteForecastService } from "../route-forecast";

const routeForecastSchema = z.object({
  candidateCount: z.number().int().min(2).max(5).optional(),
  horizon: z.number().int().min(2).max(5).optional(),
  authorIntent: z.string().trim().max(1_000).optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export function registerNovelRouteForecastRoutes(input: {
  router: Router;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
}): void {
  input.router.post(
    "/:id/chapters/:chapterId/route-forecast",
    validate({ params: input.chapterParamsSchema, body: routeForecastSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof input.chapterParamsSchema>;
        const data = await novelRouteForecastService.generate(
          id,
          chapterId,
          req.body as z.infer<typeof routeForecastSchema>,
        );
        res.status(200).json({
          success: true,
          data,
          message: "剧情路线推演完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
