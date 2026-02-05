import { NextResponse } from "next/server";
import { z } from "zod";
import { getRun, setRun } from "@/lib/services/cache";
import { compileExecutablePlan } from "@/lib/services/prompt-compiler";
import { recompileRequestSchema } from "@/lib/models";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const input = recompileRequestSchema.parse(body);
    const run = getRun(input.runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const plan = await compileExecutablePlan(
      run.stack,
      run.architecture,
      input.intent,
      run.snapshot,
      input.targetAgent
    );
    const updated = {
      ...run,
      intent: input.intent,
      plan
    };

    setRun(updated);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
