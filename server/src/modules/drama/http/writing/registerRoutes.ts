import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaComplianceService } from "../../../../services/drama/DramaComplianceService";

import { dramaEpisodeService } from "../../../../services/drama/DramaEpisodeService";

import { dramaEpisodeOutlineService } from "../../../../services/drama/DramaEpisodeOutlineService";

import { dramaQualityGate } from "../../../../services/drama/DramaQualityGate";

import { dramaRepairService } from "../../../../services/drama/DramaRepairService";

import { dramaScriptService } from "../../../../services/drama/DramaScriptService";

import { dramaStrategyService } from "../../../../services/drama/DramaStrategyService";

import { idParamsSchema, llmOptionsSchema, episodeParamsSchema } from "../request/contracts";

export const outlineRequestSchema = z
  .object({
    startOrder: z.number().int().min(1).optional(),
    count: z.number().int().min(1).max(40).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

export const repairRequestSchema = z
  .object({
    instruction: z.string().trim().max(4000).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

export const episodeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(200000).optional(),
  hookOpening: z.string().trim().max(1000).nullable().optional(),
  cliffhanger: z.string().trim().max(1000).nullable().optional(),
  durationSec: z.number().int().min(1).max(600).nullable().optional(),
});

export function registerDramaWritingRoutes(router: Router): void {
router.post("/projects/:id/strategy", validate({ params: idParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaStrategyService.generateStrategy(id, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama strategy generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/outline", validate({ params: idParamsSchema, body: outlineRequestSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const body = (req.body ?? {}) as { startOrder?: number; count?: number };
    const data = await dramaEpisodeOutlineService.generateOutline(
      id,
      { startOrder: body.startOrder, count: body.count },
      (req.body ?? {}) as never,
    );
    res.status(200).json({ success: true, data, message: "Drama episode outline generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/script", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaScriptService.generateEpisodeScript(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode script generated." });
  } catch (error) {
    next(error);
  }
});

router.patch("/projects/:id/episodes/:order", validate({ params: episodeParamsSchema, body: episodeUpdateSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaEpisodeService.updateEpisode(id, order, req.body as z.infer<typeof episodeUpdateSchema>);
    res.status(200).json({ success: true, data, message: "Drama episode updated." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/review", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaQualityGate.reviewEpisode(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode reviewed." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/compliance", validate({ params: idParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaComplianceService.checkProject(id, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama project compliance checked." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/compliance", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaComplianceService.checkEpisode(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode compliance checked." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/repair", validate({ params: episodeParamsSchema, body: repairRequestSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = (req.body ?? {}) as { instruction?: string };
    const data = await dramaRepairService.repairEpisode(id, order, body.instruction, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode repaired." });
  } catch (error) {
    next(error);
  }
});
}
