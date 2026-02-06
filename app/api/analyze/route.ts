import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeRequestSchema } from "@/lib/models";
import { runAnalysis } from "@/lib/services/pipeline";
import { setRun } from "@/lib/services/cache";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    // Safety boundary: reject local path fields in API payload
    if ("repoPath" in body || "localPath" in body || "path" in body) {
      return NextResponse.json(
        { error: "Local path sources are not accepted via the API. Use the CLI instead." },
        { status: 400 }
      );
    }

    const input = analyzeRequestSchema.parse(body);
    const session = await getServerSession(authOptions);
    const run = await runAnalysis({
      ...input,
      githubToken: input.githubToken ?? session?.githubAccessToken
    });
    setRun(run);

    // Strip internal workspace paths from response
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
