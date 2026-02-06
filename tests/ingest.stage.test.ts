import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("@/lib/services/workspace", () => ({
  writeArtifact: vi.fn().mockResolvedValue("/mock/artifacts/ingest.json")
}));

// Mock simple-git for local git metadata
vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => ({
    revparse: vi.fn().mockResolvedValue("main")
  }))
}));

import { runIngestStage } from "@/lib/services/ingest.stage";
import type { HarnessContext } from "@/lib/models";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "mimickit-ingest-test-"));

  // Create a minimal project structure
  await writeFile(join(testDir, "package.json"), JSON.stringify({ name: "test", dependencies: { react: "18" } }));
  await writeFile(join(testDir, "README.md"), "# Test Project");
  await writeFile(join(testDir, "tsconfig.json"), "{}");
  await mkdir(join(testDir, "src"), { recursive: true });
  await writeFile(join(testDir, "src", "index.ts"), "export const main = () => console.log('hello');");
  await writeFile(join(testDir, "src", "app.tsx"), "<div>Hello</div>");

  // Create dirs that should be ignored
  await mkdir(join(testDir, "node_modules", "react"), { recursive: true });
  await writeFile(join(testDir, "node_modules", "react", "index.js"), "module.exports = {};");
  await mkdir(join(testDir, ".git"), { recursive: true });
  await writeFile(join(testDir, ".git", "HEAD"), "ref: refs/heads/main");
  await mkdir(join(testDir, "dist"), { recursive: true });
  await writeFile(join(testDir, "dist", "bundle.js"), "compiled output");

  // Create a lock file that should be skipped
  await writeFile(join(testDir, "package-lock.json"), "{}");
  await writeFile(join(testDir, "yarn.lock"), "lockfile");
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeCtx(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    runId: "run_test_ingest",
    source: { type: "local", repoPath: testDir },
    workspacePath: testDir,
    artifactsPath: "/tmp/test-artifacts",
    scanMode: "quick",
    runtimeOptions: { cleanupWorkspace: false, enableBuildExecution: false },
    ...overrides
  };
}

describe("ingest.stage", () => {
  it("produces a valid RepoSnapshot from filesystem", async () => {
    const snapshot = await runIngestStage(makeCtx());

    expect(snapshot.version).toBe("1.0.0");
    expect(snapshot.repo.name).toBeTruthy();
    expect(snapshot.metadata.scanMode).toBe("quick");
    expect(snapshot.metadata.totalFiles).toBeGreaterThan(0);
    expect(snapshot.files.length).toBeGreaterThan(0);
  });

  it("filters ignored directories (node_modules, .git, dist)", async () => {
    const snapshot = await runIngestStage(makeCtx());

    const allPaths = snapshot.fileTree.map((n) => n.path);
    expect(allPaths).not.toContain("node_modules");
    expect(allPaths).not.toContain(".git");
    expect(allPaths).not.toContain("dist");

    const filePaths = snapshot.files.map((f) => f.path);
    for (const p of filePaths) {
      expect(p).not.toMatch(/^node_modules\//);
      expect(p).not.toMatch(/^\.git\//);
      expect(p).not.toMatch(/^dist\//);
    }
  });

  it("filters lock files", async () => {
    const snapshot = await runIngestStage(makeCtx());

    const allPaths = snapshot.fileTree.map((n) => n.path);
    expect(allPaths).not.toContain("package-lock.json");
    expect(allPaths).not.toContain("yarn.lock");
  });

  it("selects important files (package.json, README.md)", async () => {
    const snapshot = await runIngestStage(makeCtx());

    const filePaths = snapshot.files.map((f) => f.path);
    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("README.md");
  });

  it("selects source files by size", async () => {
    const snapshot = await runIngestStage(makeCtx());

    const sourceFiles = snapshot.files.filter((f) => f.reason === "large source sample");
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("honors scan limits", async () => {
    const snapshot = await runIngestStage(makeCtx({ scanMode: "quick" }));
    // Should not exceed maxContentsFiles (80)
    expect(snapshot.files.length).toBeLessThanOrEqual(80);
  });

  it("sets local source metadata correctly", async () => {
    const snapshot = await runIngestStage(makeCtx());

    expect(snapshot.repo.owner).toBe("local");
    expect(snapshot.repo.url).toMatch(/^file:\/\//);
    expect(snapshot.repo.stars).toBe(0);
  });
});
