import type { NovelSnapshotListItem } from "@novelfoundry/shared/types/novel";

export function toNovelSnapshotListItem(snapshot: {
  id: string;
  novelId: string;
  label: string | null;
  triggerType: string;
  createdAt: Date;
}): NovelSnapshotListItem {
  return {
    id: snapshot.id,
    novelId: snapshot.novelId,
    label: snapshot.label,
    triggerType: snapshot.triggerType as NovelSnapshotListItem["triggerType"],
    createdAt: snapshot.createdAt.toISOString(),
  };
}
