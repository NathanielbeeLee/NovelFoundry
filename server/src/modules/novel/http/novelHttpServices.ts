import { NovelDraftOptimizeService } from "../../../services/novel/NovelDraftOptimizeService";
import { getSharedNovelServices } from "../../../services/novel/application/sharedNovelServices";
import { WholeBookReviewService } from "../quality/application/WholeBookReviewService";

export function createNovelHttpServices() {
  return {
    novelService: getSharedNovelServices(),
    novelDraftOptimizeService: new NovelDraftOptimizeService(),
    wholeBookReviewService: new WholeBookReviewService(),
  };
}

export type NovelHttpServices = ReturnType<typeof createNovelHttpServices>;
