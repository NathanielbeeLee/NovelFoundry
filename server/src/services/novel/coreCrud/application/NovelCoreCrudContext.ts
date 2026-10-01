import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { NovelContinuationService } from "../../NovelContinuationService";
import { NovelVolumeService } from "../../volume/NovelVolumeService";

export class NovelCoreCrudContext {
  protected readonly novelContinuationService = new NovelContinuationService();
  protected readonly workflowService = new NovelWorkflowService();
  protected readonly volumeService = new NovelVolumeService();
}
