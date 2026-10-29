import { AppError } from "../../../../../middleware/errorHandler";
import type { ChapterSyncDiagnosticsReader } from "../domain/contracts";
import { projectChapterSyncDiagnostics } from "../domain/projectDiagnostics";
import { sameSource } from "../domain/sourceIdentity";
import { ChapterSyncDiagnosticsRepository } from "../infrastructure/ChapterSyncDiagnosticsRepository";

export class ChapterSyncDiagnosticsService {
  constructor(private readonly reader: ChapterSyncDiagnosticsReader = new ChapterSyncDiagnosticsRepository(),
    private readonly now: () => Date = () => new Date()) {}

  async get(novelId: string, chapterId: string) {
    const snapshot = await this.reader.readSnapshot(novelId, chapterId);
    if (!snapshot) throw new AppError("章节不存在", 404);
    const latest = await this.reader.readSource(novelId, chapterId);
    return projectChapterSyncDiagnostics(snapshot, this.now(), sameSource(snapshot, latest));
  }
}
