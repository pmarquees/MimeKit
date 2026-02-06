import {
  AnalyzeRequest,
  analyzeRequestSchema,
  HarnessContext,
  MODEL_VERSION,
  PipelineSource,
  RepoSnapshot,
  RunResult,
  ScanMode,
  TargetAgent
} from "@/lib/models";
import { HARNESS } from "@/lib/services/config";
import { buildRepoSnapshot } from "@/lib/services/github-intake";
import { runFetchStage, isGitAvailable } from "@/lib/services/fetch.stage";
import { runIngestStage } from "@/lib/services/ingest.stage";
import { createRunDirs, cleanupWorkspace, writeTextArtifact } from "@/lib/services/workspace";
import { detectStack } from "@/lib/services/stack-detector";
import { extractArchitecture, extractIntent } from "@/lib/services/analysis";
import { compileExecutablePlan } from "@/lib/services/prompt-compiler";

function now(): string {
  return new Date().toISOString();
}

function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type StageState = RunResult["stages"][number];

function initStagesForSource(source: PipelineSource, useHarness: boolean): StageState[] {
  const stages: StageState[] = [];
  if (source.type === "github" && useHarness) {
    stages.push({ id: "fetch", label: "Fetch repository", status: "pending" });
  }
  stages.push(
    { id: "ingest", label: "Ingest workspace", status: "pending" },
    { id: "stack", label: "Stack detection", status: "pending" },
    { id: "arch", label: "Architecture extraction", status: "pending" },
    { id: "intent", label: "Intent extraction", status: "pending" },
    { id: "plan", label: "Plan compilation", status: "pending" }
  );
  return stages;
}

// Legacy stages for API fallback (no git available)
function initLegacyStages(): StageState[] {
  return [
    { id: "intake", label: "Repo intake", status: "pending" },
    { id: "stack", label: "Stack detection", status: "pending" },
    { id: "arch", label: "Architecture extraction", status: "pending" },
    { id: "intent", label: "Intent extraction", status: "pending" },
    { id: "plan", label: "Plan compilation", status: "pending" }
  ];
}

function startStage(stages: StageState[], id: string): void {
  const stage = stages.find((item) => item.id === id);
  if (!stage) return;
  stage.status = "running";
  stage.startedAt = now();
}

function completeStage(stages: StageState[], id: string): void {
  const stage = stages.find((item) => item.id === id);
  if (!stage) return;
  stage.status = "done";
  stage.finishedAt = now();
}

function failStage(stages: StageState[], id: string, error: unknown): void {
  const stage = stages.find((item) => item.id === id);
  if (!stage) return;
  stage.status = "error";
  stage.finishedAt = now();
  stage.error = error instanceof Error ? error.message : "Unexpected error";
}

// ---------------------------------------------------------------------------
// Harness pipeline: fetch -> ingest -> stack -> arch -> intent -> plan
// ---------------------------------------------------------------------------

export async function runHarnessPipeline(
  source: PipelineSource,
  scanMode: ScanMode,
  githubToken?: string
): Promise<RunResult> {
  const runId = newRunId();
  const gitAvailable = source.type === "github" ? await isGitAvailable() : true;
  const useHarness = source.type === "local" || gitAvailable;

  // If GitHub source and git not available, fall back to legacy API path
  if (source.type === "github" && !useHarness) {
    return runLegacyAnalysis(source.repoUrl, source.ref, scanMode, githubToken);
  }

  const { workspacePath, artifactsPath } = source.type === "local"
    ? { workspacePath: source.repoPath, artifactsPath: (await createRunDirs(runId)).artifactsPath }
    : await createRunDirs(runId);

  const ctx: HarnessContext = {
    runId,
    source,
    workspacePath,
    artifactsPath,
    scanMode,
    githubToken,
    runtimeOptions: {
      cleanupWorkspace: HARNESS.github.cleanupWorkspace,
      enableBuildExecution: HARNESS.enableBuildExecution
    }
  };

  const stages = initStagesForSource(source, useHarness);

  try {
    // Fetch stage (GitHub only)
    if (source.type === "github") {
      startStage(stages, "fetch");
      await runFetchStage(ctx).catch((error) => {
        failStage(stages, "fetch", error);
        throw error;
      });
      completeStage(stages, "fetch");
    }

    // Ingest stage
    startStage(stages, "ingest");
    const snapshot = await runIngestStage(ctx).catch((error) => {
      failStage(stages, "ingest", error);
      throw error;
    });
    completeStage(stages, "ingest");

    // Stack detection
    startStage(stages, "stack");
    const stack = detectStack(snapshot);
    completeStage(stages, "stack");

    // Architecture extraction
    startStage(stages, "arch");
    const architecture = await extractArchitecture(snapshot, stack).catch((error) => {
      failStage(stages, "arch", error);
      throw error;
    });
    completeStage(stages, "arch");

    // Intent extraction
    startStage(stages, "intent");
    const intent = await extractIntent(snapshot, architecture).catch((error) => {
      failStage(stages, "intent", error);
      throw error;
    });
    completeStage(stages, "intent");

    // Plan compilation
    startStage(stages, "plan");
    const targetAgent: TargetAgent = "claude-code";
    const plan = await compileExecutablePlan(stack, architecture, intent, snapshot, targetAgent).catch((error) => {
      failStage(stages, "plan", error);
      throw error;
    });
    completeStage(stages, "plan");

    // Write plan.md artifact
    await writeTextArtifact(ctx.artifactsPath, "plan.md", plan.prompt);

    return {
      id: runId,
      createdAt: now(),
      snapshot,
      stack,
      architecture,
      intent,
      plan,
      stages
    };
  } finally {
    if (source.type === "github" && ctx.runtimeOptions.cleanupWorkspace) {
      await cleanupWorkspace(runId).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy pipeline: uses GitHub Content API directly (no git clone)
// ---------------------------------------------------------------------------

async function runLegacyAnalysis(
  repoUrl: string,
  branch: string | undefined,
  scanMode: ScanMode,
  githubToken?: string
): Promise<RunResult> {
  const stages = initLegacyStages();
  const runId = newRunId();
  const { artifactsPath } = await createRunDirs(runId);

  startStage(stages, "intake");
  const snapshot = await buildRepoSnapshot(repoUrl, branch, scanMode, githubToken).catch((error) => {
    failStage(stages, "intake", error);
    throw error;
  });
  completeStage(stages, "intake");

  startStage(stages, "stack");
  const stack = detectStack(snapshot);
  completeStage(stages, "stack");

  startStage(stages, "arch");
  const architecture = await extractArchitecture(snapshot, stack).catch((error) => {
    failStage(stages, "arch", error);
    throw error;
  });
  completeStage(stages, "arch");

  startStage(stages, "intent");
  const intent = await extractIntent(snapshot, architecture).catch((error) => {
    failStage(stages, "intent", error);
    throw error;
  });
  completeStage(stages, "intent");

  startStage(stages, "plan");
  const targetAgent: TargetAgent = "claude-code";
  const plan = await compileExecutablePlan(stack, architecture, intent, snapshot, targetAgent).catch((error) => {
    failStage(stages, "plan", error);
    throw error;
  });
  completeStage(stages, "plan");

  // Write plan.md artifact
  await writeTextArtifact(artifactsPath, "plan.md", plan.prompt);

  return {
    id: runId,
    createdAt: now(),
    snapshot,
    stack,
    architecture,
    intent,
    plan,
    stages
  };
}

// ---------------------------------------------------------------------------
// API entry point (backwards compatible)
// ---------------------------------------------------------------------------

export async function runAnalysis(input: AnalyzeRequest): Promise<RunResult> {
  const parsed = analyzeRequestSchema.parse(input);
  const source: PipelineSource = {
    type: "github",
    repoUrl: parsed.repoUrl,
    ref: parsed.branch
  };
  return runHarnessPipeline(source, parsed.scanMode, parsed.githubToken);
}

export function cloneRun(run: RunResult): RunResult {
  return structuredClone(run);
}

export function validateVersion(): string {
  return MODEL_VERSION;
}
