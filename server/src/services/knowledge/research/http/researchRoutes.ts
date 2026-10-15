import type { Router } from "express";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import { extractResearch } from "../application/ResearchService";
import { readResearchSource, saveResearchSource, setResearchAdoption, listResearchAdoptions } from "../infrastructure/ResearchStore";
const params = z.object({ id: z.string().min(1) });
const sourceBody = z.object({
  documentVersionId: z.string().min(1), expectedRevision: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).nullable().optional(),
  author: z.string().trim().max(200).nullable().optional(),
  accessedAt: z.iso.datetime().nullable().optional(),
  reliabilityReason: z.string().trim().min(1).max(500), enabled: z.boolean(),
});
export function registerResearchRoutes(router: Router): void {
  router.get("/research/adoptions", validate({ query: z.object({ novelId: z.string().min(1) }) }), async (req, res, next) => {
    try { res.json({ success: true, data: await listResearchAdoptions(String(req.query.novelId)) }); } catch (error) { next(error); }
  });
  router.get("/documents/:id/research", validate({ params }), async (req, res, next) => {
    try { res.json({ success: true, data: await readResearchSource(String(req.params.id)) }); } catch (error) { next(error); }
  });
  router.put("/documents/:id/research", validate({ params, body: sourceBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await saveResearchSource(String(req.params.id), sourceBody.parse(req.body)) }); } catch (error) { next(error); }
  });
  router.post("/documents/:id/research/extract", validate({ params, body: z.object({ expectedRevision: z.string().min(1) }) }), async (req, res, next) => {
    try { res.json({ success: true, data: await extractResearch(String(req.params.id), req.body.expectedRevision) }); } catch (error) { next(error); }
  });
  router.put("/documents/:id/research/findings/:findingId/adoption", validate({
    params: params.extend({ findingId: z.string().min(1) }), body: z.object({ novelId: z.string().min(1), adopt: z.boolean() }),
  }), async (req, res, next) => {
    try { res.json({ success: true, data: await setResearchAdoption(String(req.params.id), String(req.params.findingId), req.body.novelId, req.body.adopt) }); } catch (error) { next(error); }
  });
}
