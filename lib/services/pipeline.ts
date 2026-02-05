import {
  AnalyzeRequest,
  analyzeRequestSchema,
  MODEL_VERSION,
  RunResult,
  TargetAgent
} from "@/lib/models";
import { buildRepoSnapshot } from "@/lib/services/github-intake";
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

function initStages(): StageState[] {
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

export async function runAnalysis(input: AnalyzeRequest): Promise<RunResult> {
  const parsed = analyzeRequestSchema.parse(input);
  const stages = initStages();

  startStage(stages, "intake");
  const snapshot = await buildRepoSnapshot(
    parsed.repoUrl,
    parsed.branch,
    parsed.scanMode,
    parsed.githubToken
  ).catch((error) => {
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

  return {
    id: newRunId(),
    createdAt: now(),
    snapshot,
    stack,
    architecture,
    intent,
    plan,
    stages
  };
}

export function cloneRun(run: RunResult): RunResult {
  return structuredClone(run);
}

export function validateVersion(): string {
  return MODEL_VERSION;
}
