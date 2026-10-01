import { Router } from "express";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { dramaExportService } from "../../../../services/drama/DramaExportService";

import { idParamsSchema, episodeParamsSchema } from "../request/contracts";

export function registerDramaExportsRoutes(router: Router): void {
router.get("/projects/:id/export", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const format = req.query.format === "json" ? "json" : "markdown";
    const data = await dramaExportService.exportProject(id, format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.status(200).send(data.body);
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/episodes/:order/export", validate({ params: episodeParamsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const format = req.query.format === "timeline-json" ? "timeline-json" : "srt";
    const data = await dramaExportService.exportEpisode(id, order, format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.status(200).send(data.body);
  } catch (error) {
    next(error);
  }
});
}
