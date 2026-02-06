import { describe, it, expect, vi } from "vitest";
import type { PipelineSource } from "@/lib/models";

// Mock all heavy dependencies
vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => ({
    clone: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue({ latest: { hash: "abcdef1234567890abcdef1234567890abcdef12" } }),
    revparse: vi.fn().mockResolvedValue("main"),
    version: vi.fn().mockResolvedValue({ installed: true })
  }))
}));

vi.mock("@/lib/services/workspace", () => ({
  createRunDirs: vi.fn().mockResolvedValue({
    workspacePath: "/mock/workspace",
    artifactsPath: "/mock/artifacts"
  }),
  cleanupWorkspace: vi.fn().mockResolvedValue(undefined),
  artifactsDir: vi.fn().mockReturnValue("/mock/artifacts"),
  writeArtifact: vi.fn().mockResolvedValue("/mock/artifacts/test.json"),
  writeTextArtifact: vi.fn().mockResolvedValue("/mock/artifacts/plan.md")
}));

vi.mock("@/lib/services/fetch.stage", () => ({
  runFetchStage: vi.fn().mockResolvedValue({
    runId: "run_test",
    repoUrl: "https://github.com/a/b",
    ref: "main",
    commitSha: "abcdef1234567890abcdef1234567890abcdef12",
    workspacePath: "/mock/workspace"
  }),
  isGitAvailable: vi.fn().mockResolvedValue(true)
}));

vi.mock("@/lib/services/ingest.stage", () => ({
  runIngestStage: vi.fn().mockResolvedValue({
    version: "1.0.0",
    repo: { url: "https://github.com/a/b", owner: "a", name: "b", branch: "main", defaultBranch: "main", sizeKb: 100, stars: 0, openIssues: 0 },
    metadata: { scanMode: "quick", fetchedAt: new Date().toISOString(), totalFiles: 10, selectedFiles: 3, skippedBinaryFiles: 0, skippedScriptFiles: 0, tokenEstimate: 500 },
    languages: [],
    fileTree: [],
    files: []
  })
}));

vi.mock("@/lib/services/stack-detector", () => ({
  detectStack: vi.fn().mockReturnValue({
    version: "1.0.0",
    frontend: [], backend: [], db: [], auth: [], infra: [], language: [],
    lowConfidenceFindings: []
  })
}));

vi.mock("@/lib/services/analysis", () => ({
  extractArchitecture: vi.fn().mockResolvedValue({
    version: "1.0.0", components: [], edges: []
  }),
  extractIntent: vi.fn().mockResolvedValue({
    version: "1.0.0", system_purpose: "test", core_features: [], user_flows: [],
    business_rules: [], data_contracts: [], invariants: [], assumptions: [], unknowns: [],
    confidenceBySection: {}
  })
}));

vi.mock("@/lib/services/prompt-compiler", () => ({
  compileExecutablePlan: vi.fn().mockResolvedValue({
    version: "1.0.0",
    targetAgent: "claude-code",
    structured: {
      systemOverview: "", architectureDescription: "", routeMap: [], moduleList: [],
      functionalityLogic: [], interfaces: [], dataModels: [], databaseDesign: [],
      designSystem: { visualDirection: "", styleLanguage: [], colorPalette: [], typography: [], radiusSystem: [], pageLayoutPatterns: [], components: [], motion: [], distinctiveTraits: [], statesAndFeedback: [] },
      behaviorRules: [], buildSteps: [], testExpectations: [], constraints: [], nonGoals: []
    },
    prompt: ""
  })
}));

vi.mock("@/lib/services/github-intake", () => ({
  buildRepoSnapshot: vi.fn()
}));

import { runHarnessPipeline } from "@/lib/services/pipeline";
import { isGitAvailable } from "@/lib/services/fetch.stage";
import { runFetchStage } from "@/lib/services/fetch.stage";
import { runIngestStage } from "@/lib/services/ingest.stage";
import { beforeEach } from "vitest";

describe("pipeline orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GitHub path runs fetch -> ingest -> stack -> arch -> intent -> plan", async () => {
    const source: PipelineSource = {
      type: "github",
      repoUrl: "https://github.com/a/b",
      ref: "main"
    };

    const result = await runHarnessPipeline(source, "quick");

    expect(runFetchStage).toHaveBeenCalled();
    expect(runIngestStage).toHaveBeenCalled();
    expect(result.stages.map((s) => s.id)).toEqual([
      "fetch", "ingest", "stack", "arch", "intent", "plan"
    ]);
    expect(result.stages.every((s) => s.status === "done")).toBe(true);
  });

  it("local path bypasses fetch stage", async () => {
    const source: PipelineSource = {
      type: "local",
      repoPath: "/some/local/repo"
    };

    const result = await runHarnessPipeline(source, "quick");

    expect(runFetchStage).not.toHaveBeenCalled();
    expect(runIngestStage).toHaveBeenCalled();
    expect(result.stages.map((s) => s.id)).toEqual([
      "ingest", "stack", "arch", "intent", "plan"
    ]);
  });

  it("falls back to legacy when git unavailable for GitHub source", async () => {
    vi.mocked(isGitAvailable).mockResolvedValueOnce(false);

    const { buildRepoSnapshot } = await import("@/lib/services/github-intake");
    vi.mocked(buildRepoSnapshot).mockResolvedValueOnce({
      version: "1.0.0",
      repo: { url: "https://github.com/a/b", owner: "a", name: "b", branch: "main", defaultBranch: "main", sizeKb: 100, stars: 0, openIssues: 0 },
      metadata: { scanMode: "quick", depthStrategy: "file-count", fetchedAt: new Date().toISOString(), totalFiles: 5, selectedFiles: 2, skippedBinaryFiles: 0, skippedScriptFiles: 0, tokenEstimate: 300 },
      languages: [],
      fileTree: [],
      files: []
    });

    const source: PipelineSource = {
      type: "github",
      repoUrl: "https://github.com/a/b"
    };

    const result = await runHarnessPipeline(source, "quick");

    // Legacy path uses "intake" stage name
    expect(result.stages.map((s) => s.id)).toEqual([
      "intake", "stack", "arch", "intent", "plan"
    ]);
    expect(buildRepoSnapshot).toHaveBeenCalled();
  });
});
