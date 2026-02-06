import { simpleGit, SimpleGit } from "simple-git";
import { fetchArtifactSchema, FetchArtifact, HarnessContext } from "@/lib/models";
import { HARNESS } from "@/lib/services/config";
import { writeArtifact } from "@/lib/services/workspace";

export async function runFetchStage(ctx: HarnessContext): Promise<FetchArtifact> {
  if (ctx.source.type !== "github") {
    throw new Error("fetch stage only applies to GitHub sources");
  }

  const git: SimpleGit = simpleGit();
  const depth = HARNESS.github.shallowCloneDepth;
  const cloneArgs = [`--depth=${depth}`, "--single-branch"];
  if (ctx.source.ref) {
    cloneArgs.push("--branch", ctx.source.ref);
  }

  await git.clone(ctx.source.repoUrl, ctx.workspacePath, cloneArgs);

  const localGit = simpleGit(ctx.workspacePath);

  if (ctx.source.ref) {
    await localGit.checkout(ctx.source.ref);
  }

  const log = await localGit.log({ maxCount: 1 });
  const commitSha = log.latest?.hash ?? "";
  if (!commitSha) {
    throw new Error("Could not resolve HEAD commit SHA after clone");
  }

  const resolvedRef = ctx.source.ref || (await localGit.revparse(["--abbrev-ref", "HEAD"])).trim();

  const artifact: FetchArtifact = {
    runId: ctx.runId,
    repoUrl: ctx.source.repoUrl,
    ref: resolvedRef,
    commitSha,
    workspacePath: ctx.workspacePath
  };

  // Validate before persisting
  fetchArtifactSchema.parse(artifact);

  await writeArtifact(ctx.artifactsPath, "fetch.json", artifact);

  return artifact;
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    const git = simpleGit();
    await git.version();
    return true;
  } catch {
    return false;
  }
}
