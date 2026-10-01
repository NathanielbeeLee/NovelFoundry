import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { comicProjectService } from "../infrastructure/serviceInstances";

import { idParams } from "../request/contracts";

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import", "comic_import"]),
  sourceRef: z.string().trim().min(1).optional(),
  trackId: z.string().trim().max(40).optional(),
  inspiration: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(200000).optional(),
  stylePreset: z.string().trim().max(1000).optional(),
});

export const styleUpdateSchema = z.object({
  style: z.string().trim().min(1).max(120),
});

export const presetUpdateSchema = z.object({
  format: z.string().trim().min(1).max(60).optional(),
  style: z.string().trim().max(120).optional(),
  promptKeywords: z.string().trim().max(400).optional(),
  imageSize: z.string().trim().max(20).optional(),
});

export function registerComicProjectsRoutes(router: Router): void {
router.get("/projects", async (_req, res, next) => {
  try {
    const data = await comicProjectService.listProjects();
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post("/projects", validate({ body: createProjectSchema }), async (req, res, next) => {
  try {
    const data = await comicProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get("/projects/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicProjectService.getProject(id);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画项目不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.delete("/projects/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    await comicProjectService.deleteProject(id);
    res.json({ success: true, data: null } satisfies ApiResponse<null>);
  } catch (err) { next(err); }
});

router.post("/projects/:id/source-bundle", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicProjectService.importSourceBundle(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch(
  "/projects/:id/style",
  validate({ params: idParams, body: styleUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { style } = req.body as z.infer<typeof styleUpdateSchema>;
      const data = await comicProjectService.updateProjectStyle(id, JSON.stringify({ style }));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.patch(
  "/projects/:id/preset",
  validate({ params: idParams, body: presetUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const patch = req.body as z.infer<typeof presetUpdateSchema>;
      const data = await comicProjectService.updateProjectPreset(id, patch);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);
}
