import { PlanPage } from "@/components/plan-page";

export default function PlanRoute({
  params
}: {
  params: { runId: string };
}): React.ReactElement {
  return <PlanPage runId={params.runId} />;
}
