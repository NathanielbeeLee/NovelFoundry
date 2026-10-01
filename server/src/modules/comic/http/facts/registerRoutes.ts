import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { comicFactService } from "../../../../services/comic/ComicFactService";

import { idParams, factIdParams } from "../request/contracts";

export function registerComicFactsRoutes(router: Router): void {
router.get("/projects/:id/facts", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicFactService.listFacts(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.delete("/facts/:factId", validate({ params: factIdParams }), async (req, res, next) => {
  try {
    const { factId } = req.params as z.infer<typeof factIdParams>;
    await comicFactService.deleteFact(factId);
    res.json({ success: true, data: null } satisfies ApiResponse<null>);
  } catch (err) { next(err); }
});
}
