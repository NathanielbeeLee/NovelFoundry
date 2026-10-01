import { NovelWorldSliceService } from "../../storyWorldSlice/NovelWorldSliceService";
import { NovelWorldInstanceService } from "../../worldContext/NovelWorldInstanceService";
import { NovelWorldLibrarySaveService } from "../../worldContext/NovelWorldLibrarySaveService";
import { NovelWorldManualService } from "../../worldContext/NovelWorldManualService";
import { NovelApplicationContext } from "./NovelApplicationContext";

export class NovelWorldApplication extends NovelApplicationContext {
  getWorldSlice(...args: Parameters<NovelWorldSliceService["getWorldSliceView"]>) {
    return this.worldSliceService.getWorldSliceView(...args);
  }

  refreshWorldSlice(...args: Parameters<NovelWorldSliceService["refreshWorldSlice"]>) {
    return this.worldSliceService.refreshWorldSlice(...args);
  }

  updateWorldSliceOverrides(...args: Parameters<NovelWorldSliceService["updateWorldSliceOverrides"]>) {
    return this.worldSliceService.updateWorldSliceOverrides(...args);
  }

  getNovelWorld(...args: Parameters<NovelWorldInstanceService["getNovelWorldView"]>) {
    return this.novelWorldInstanceService.getNovelWorldView(...args);
  }

  getNovelWorldSyncDiff(...args: Parameters<NovelWorldInstanceService["getSyncDiff"]>) {
    return this.novelWorldInstanceService.getSyncDiff(...args);
  }

  importNovelWorldFromLibrary(...args: Parameters<NovelWorldInstanceService["importFromWorldLibrary"]>) {
    return this.novelWorldInstanceService.importFromWorldLibrary(...args);
  }

  createManualNovelWorld(...args: Parameters<NovelWorldManualService["createManualNovelWorld"]>) {
    return this.novelWorldManualService.createManualNovelWorld(...args);
  }

  generateNovelWorldFromTheme(...args: Parameters<NovelWorldInstanceService["generateFromNovelTheme"]>) {
    return this.novelWorldInstanceService.generateFromNovelTheme(...args);
  }

  saveNovelWorldToLibrary(...args: Parameters<NovelWorldLibrarySaveService["saveNovelWorldToLibrary"]>) {
    return this.novelWorldLibrarySaveService.saveNovelWorldToLibrary(...args);
  }

  syncNovelWorldWithLibrary(...args: Parameters<NovelWorldInstanceService["syncWithLibrary"]>) {
    return this.novelWorldInstanceService.syncWithLibrary(...args);
  }
}
