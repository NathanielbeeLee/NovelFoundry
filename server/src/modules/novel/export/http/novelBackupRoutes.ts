import { raw, type Router } from "express";
import { z } from "zod";
import { NOVEL_BACKUP_MAX_BYTES } from "@novelfoundry/shared/types/novelBackup";
import { AppError } from "../../../../middleware/errorHandler";
import { exportNovelBackup, previewNovelBackup, restoreNovelBackup } from "../backup";

const idSchema = z.string().trim().min(1).max(200);
const restoreQuerySchema = z.object({
  title: z.string().trim().min(1).max(120),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
});

function readPackage(body: unknown): unknown {
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > NOVEL_BACKUP_MAX_BYTES) {
    throw new AppError("请选择有效的小说备份文件，大小上限为 128 MB。", 400);
  }
  try { return JSON.parse(body.toString("utf8")); }
  catch { throw new AppError("备份文件格式无法读取，请选择导出的小说备份文件。", 400); }
}

/** Registered behind novel auth and before /:id write guards; import always creates a new novel. */
export function registerNovelBackupRoutes(router: Router, services = { exportNovelBackup, previewNovelBackup, restoreNovelBackup }): void {
  const upload = raw({ type: "application/octet-stream", limit: NOVEL_BACKUP_MAX_BYTES, inflate: false });
  router.get("/:id/backup", async (req, res, next) => {
    try {
      const novelId = idSchema.parse(req.params.id);
      const archive = await services.exportNovelBackup(novelId);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="novel-backup.json"');
      res.setHeader("Cache-Control", "no-store");
      res.send(JSON.stringify(archive));
    } catch (error) { next(error); }
  });
  router.post("/backup/preview", upload, (req, res, next) => {
    try {
      const preview = services.previewNovelBackup(readPackage(req.body));
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  });
  router.post("/backup/restore", upload, async (req, res, next) => {
    try {
      const query = restoreQuerySchema.parse(req.query);
      const result = await services.restoreNovelBackup(readPackage(req.body), {
        title: query.title, expectedDigest: query.digest, requestId: query.requestId,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  });
}
