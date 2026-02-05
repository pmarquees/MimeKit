import { NextResponse } from "next/server";
import { getRun } from "@/lib/services/cache";

export async function GET(
  _request: Request,
  context: { params: { runId: string } }
): Promise<Response> {
  const run = getRun(context.params.runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
