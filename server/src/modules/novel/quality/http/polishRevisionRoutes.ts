import type { Router } from "express";
import { z } from "zod";
import type { PolishRevisionService } from "../application/polish";
export function registerPolishRevisionRoutes(router: Router, service: PolishRevisionService): void {
  router.get("/:id/polish-revisions", async (req, res, next) => { try { res.json({ success: true, data: await service.list(String(req.params.id), typeof req.query.jobId === "string" ? req.query.jobId : undefined, typeof req.query.cursor === "string" ? req.query.cursor : undefined) }); } catch (e) { next(e); } });
  router.get("/:id/polish-revisions/:revisionId", async (req, res, next) => { try { const data = await service.detail(String(req.params.id), String(req.params.revisionId)); if (!data) return res.status(404).json({ success: false }); return res.json({ success: true, data }); } catch (e) { next(e); } });
  router.post("/:id/polish-revisions/:revisionId/undo", async (req, res, next) => { try { const body = z.object({ expectedAfterHash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body); res.json({ success: true, data: await service.undo(String(req.params.id), String(req.params.revisionId), body.expectedAfterHash) }); } catch (e) { next(e); } });
}
