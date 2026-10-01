import { NovelEditWorkspaceView, useNovelEditWorkspace } from "./novelEdit/index";

export default function NovelEdit() {
  const workspace = useNovelEditWorkspace();
  return <NovelEditWorkspaceView {...workspace} />;
}
