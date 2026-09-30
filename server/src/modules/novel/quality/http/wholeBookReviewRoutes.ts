import type { Router } from "express";
import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import type { WholeBookReviewService } from "../application/WholeBookReviewService";

const rangeSchema = z.object({
  startOrder: z.number().int().positive().optional(),
  endOrder: z.number().int().positive().optional(),
});
const rangeQuerySchema = z.object({
  startOrder: z.coerce.number().int().positive().optional(),
  endOrder: z.coerce.number().int().positive().optional(),
});
const feedbackSchema = z.object({ issueIds: z.array(z.string().uuid()).optional() });

export function registerWholeBookReviewRoutes(router: Router, service: WholeBookReviewService): void {
  router.get("/:id/whole-book-reviews", async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.list(String(req.params.id)) });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/:id/whole-book-reviews/status",
    validate({ query: rangeQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await service.getStatus(String(req.params.id), req.query);
        res.json({
          success: true,
          data,
          message: "全书审校状态已更新。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/whole-book-reviews",
    validate({ body: rangeSchema }),
    async (req, res, next) => {
      try {
        const data = await service.run(String(req.params.id), req.body);
        res.status(201).json({
          success: true,
          data,
          message: "全书审校完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/whole-book-reviews/:reportId/feedback",
    validate({ body: feedbackSchema }),
    async (req, res, next) => {
      try {
        res.json({
          success: true,
          data: await service.applyFeedback(String(req.params.id), String(req.params.reportId), req.body.issueIds),
        });
      } catch (error) {
        next(error);
      }
    },
  );
}
