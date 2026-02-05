import { NextResponse } from "next/server";
import { listRuns } from "@/lib/services/cache";

export async function GET(): Promise<Response> {
  return NextResponse.json({ runs: listRuns() });
}
