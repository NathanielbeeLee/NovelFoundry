import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { episodeIdParams, panelIdParams } from "../request/contracts";

import { comicPanelScriptService } from "../infrastructure/serviceInstances";

export const generateScriptSchema = z
  .object({
    targetPanelCount: z.number().int().min(10).max(80).optional(),
    densityMode: z.enum(["relaxed", "balanced", "compact"]).optional(),
    scriptPromptInstruction: z.string().trim().max(1000).optional(),
    refreshSourceText: z.boolean().optional(),
    provider: z.string().trim().optional(),
  })
  .optional();

export const visualPromptSchema = z.object({
  visualPrompt: z.string().trim().min(1).max(400),
});

export const dialoguesSchema = z.object({
  dialogues: z.array(z.unknown()).max(3),
});

export function registerComicPanelScriptsRoutes(router: Router): void {
router.get("/episodes/:episodeId/panels", validate({ params: episodeIdParams }), async (req, res, next) => {
  try {
    const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
    const data = await comicPanelScriptService.getPanels(episodeId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/episodes/:episodeId/generate-script",
  validate({ params: episodeIdParams, body: generateScriptSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof generateScriptSchema>;
      const { provider, ...scriptInput } = body ?? {};
      const data = await comicPanelScriptService.generatePanelScript(
        episodeId,
        scriptInput,
        provider as Parameters<typeof comicPanelScriptService.generatePanelScript>[2],
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/panels/:panelId", validate({ params: panelIdParams }), async (req, res, next) => {
  try {
    const { panelId } = req.params as z.infer<typeof panelIdParams>;
    const data = await comicPanelScriptService.getPanel(panelId);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画格子不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch(
  "/panels/:panelId/visual-prompt",
  validate({ params: panelIdParams, body: visualPromptSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const { visualPrompt } = req.body as z.infer<typeof visualPromptSchema>;
      const data = await comicPanelScriptService.updatePanelVisualPrompt(panelId, visualPrompt);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.patch(
  "/panels/:panelId/dialogues",
  validate({ params: panelIdParams, body: dialoguesSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const { dialogues } = req.body as z.infer<typeof dialoguesSchema>;
      const data = await comicPanelScriptService.updatePanelDialogues(panelId, dialogues);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);
}
