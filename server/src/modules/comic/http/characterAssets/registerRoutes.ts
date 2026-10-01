import { Router } from "express";

import type { ApiResponse } from "@novelfoundry/shared/types/api";

import { z } from "zod";

import { validate } from "../../../../middleware/validate";

import { comicCharacterAssetService } from "../../../../services/comic/ComicCharacterAssetService";

import { charIdParams, idParams, assetIdParams } from "../request/contracts";

export const createAssetSchema = z.object({
  characterId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  assetType: z.enum(["costume", "weapon", "item", "vehicle", "ability", "other"]),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateAssetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  assetType: z.enum(["costume", "weapon", "item", "vehicle", "ability", "other"]).optional(),
});

export function registerComicCharacterAssetsRoutes(router: Router): void {
router.get("/characters/:charId/assets", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const data = await comicCharacterAssetService.listAssets(charId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get("/projects/:id/character-assets", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicCharacterAssetService.listByProject(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post("/character-assets", validate({ body: createAssetSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createAssetSchema>;
    const data = await comicCharacterAssetService.createAsset(body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch("/character-assets/:assetId", validate({ params: assetIdParams, body: updateAssetSchema }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetIdParams>;
    const body = req.body as z.infer<typeof updateAssetSchema>;
    const data = await comicCharacterAssetService.updateAsset(assetId, body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.delete("/character-assets/:assetId", validate({ params: assetIdParams }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetIdParams>;
    await comicCharacterAssetService.deleteAsset(assetId);
    res.json({ success: true, data: null } satisfies ApiResponse<null>);
  } catch (err) { next(err); }
});

router.post("/character-assets/:assetId/prepare-image", validate({ params: assetIdParams }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetIdParams>;
    const provider = typeof req.body.provider === "string" ? req.body.provider : undefined;
    const data = await comicCharacterAssetService.prepareAssetImage(assetId, provider);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post("/character-assets/:assetId/generate-image", validate({ params: assetIdParams }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetIdParams>;
    const body = req.body as {
      provider?: string;
      promptOverride?: string;
      sizeOverride?: string;
      providerOverride?: string;
      excludedReferenceImageUrls?: string[];
    };
    await comicCharacterAssetService.generateAssetImage(assetId, body.provider, {
      promptOverride: body.promptOverride,
      sizeOverride: body.sizeOverride as never,
      providerOverride: body.providerOverride,
      excludedReferenceImageUrls: body.excludedReferenceImageUrls,
    });
    const data = await comicCharacterAssetService.getAsset(assetId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/character-assets/:assetId/upload-image",
  validate({ params: assetIdParams }),
  async (req, res, next) => {
    try {
      const { assetId } = req.params as z.infer<typeof assetIdParams>;
      const mimeType = req.headers["content-type"] ?? "image/png";
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) throw new Error("未收到图片数据");
      const data = await comicCharacterAssetService.uploadAssetImage(assetId, buffer, mimeType);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/character-assets/:assetId/image", validate({ params: assetIdParams }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetIdParams>;
    const { filePath, mimeType } = await comicCharacterAssetService.serveAssetImage(assetId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const { createReadStream } = await import("fs");
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});
}
