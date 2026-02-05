import { NextResponse } from "next/server";
import { z } from "zod";
import { getRun, setRun } from "@/lib/services/cache";
import { applyStackSwap } from "@/lib/services/stack-swap";
import { stackSwapRequestSchema, targetAgentSchema } from "@/lib/models";

const requestSchema = stackSwapRequestSchema.extend({
  targetAgent: targetAgentSchema.default("claude-code")
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);
    const run = getRun(input.runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const updated = await applyStackSwap(run, {
      category: input.category,
      current: input.current,
      replacement: input.replacement,
      targetAgent: input.targetAgent
    });

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
