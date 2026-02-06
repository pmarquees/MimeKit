import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchArtifactSchema } from "@/lib/models";

// Mock simple-git before importing the module under test
const mockClone = vi.fn();
const mockCheckout = vi.fn();
const mockLog = vi.fn();
const mockRevparse = vi.fn();
const mockVersion = vi.fn();

vi.mock("simple-git", () => ({
  simpleGit: vi.fn((path?: string) => {
    if (path) {
      return {
        checkout: mockCheckout,
        log: mockLog,
        revparse: mockRevparse
      };
    }
    return {
      clone: mockClone,
      version: mockVersion
    };
  })
}));

vi.mock("@/lib/services/workspace", () => ({
  writeArtifact: vi.fn().mockResolvedValue("/mock/artifacts/fetch.json")
}));

import { runFetchStage, isGitAvailable } from "@/lib/services/fetch.stage";
import type { HarnessContext } from "@/lib/models";

function makeCtx(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    runId: "run_test_001",
    source: { type: "github", repoUrl: "https://github.com/owner/repo", ref: "main" },
    workspacePath: "/tmp/test-workspace",
    artifactsPath: "/tmp/test-artifacts",
    scanMode: "quick",
    runtimeOptions: { cleanupWorkspace: false, enableBuildExecution: false },
    ...overrides
  };
}

describe("fetch.stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClone.mockResolvedValue(undefined);
    mockCheckout.mockResolvedValue(undefined);
    mockLog.mockResolvedValue({ latest: { hash: "abc1234def5678901234567890abcdef12345678" } });
    mockRevparse.mockResolvedValue("main");
  });

  it("clones repo and writes valid fetch.json artifact", async () => {
    const ctx = makeCtx();
    const artifact = await runFetchStage(ctx);

    expect(mockClone).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "/tmp/test-workspace",
      expect.arrayContaining(["--depth=1", "--single-branch", "--branch", "main"])
    );

    expect(artifact.runId).toBe("run_test_001");
    expect(artifact.repoUrl).toBe("https://github.com/owner/repo");
    expect(artifact.ref).toBe("main");
    expect(artifact.commitSha).toBe("abc1234def5678901234567890abcdef12345678");

    // Validate against schema
    const result = fetchArtifactSchema.safeParse(artifact);
    expect(result.success).toBe(true);
  });

  it("checks out requested ref", async () => {
    const ctx = makeCtx({
      source: { type: "github", repoUrl: "https://github.com/owner/repo", ref: "v2.0.0" }
    });
    await runFetchStage(ctx);
    expect(mockCheckout).toHaveBeenCalledWith("v2.0.0");
  });

  it("rejects non-github source", async () => {
    const ctx = makeCtx({
      source: { type: "local", repoPath: "/some/path" }
    });
    await expect(runFetchStage(ctx)).rejects.toThrow("fetch stage only applies to GitHub sources");
  });

  it("isGitAvailable returns true when git works", async () => {
    mockVersion.mockResolvedValue({ installed: true });
    const available = await isGitAvailable();
    expect(available).toBe(true);
  });

  it("isGitAvailable returns false when git fails", async () => {
    mockVersion.mockRejectedValue(new Error("not found"));
    const available = await isGitAvailable();
    expect(available).toBe(false);
  });
});

describe("fetchArtifactSchema validation", () => {
  it("rejects malformed commitSha", () => {
    const bad = {
      runId: "run_1",
      repoUrl: "https://github.com/a/b",
      ref: "main",
      commitSha: "not-a-sha!",
      workspacePath: "/tmp/ws"
    };
    const result = fetchArtifactSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = fetchArtifactSchema.safeParse({ runId: "run_1" });
    expect(result.success).toBe(false);
  });
});
