import { WorkspacePage } from "@/components/workspace-page";

export default function WorkspaceRoute({
  params
}: {
  params: { runId: string };
}): React.ReactElement {
  return <WorkspacePage runId={params.runId} />;
}
