import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeRequestSchema } from "@/lib/models";
import { runAnalysis } from "@/lib/services/pipeline";
import { setRun } from "@/lib/services/cache";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const input = analyzeRequestSchema.parse(body);
    const session = await getServerSession(authOptions);
    const run = await runAnalysis({
      ...input,
      githubToken: input.githubToken ?? session?.githubAccessToken
    });
    setRun(run);
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
