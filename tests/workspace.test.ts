import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createRunDirs,
  writeArtifact,
  cleanupWorkspace,
  runsRoot,
  workspaceDir,
  artifactsDir
} from "@/lib/services/workspace";

const TEST_RUN_ID = "run_test_workspace_001";

afterEach(async () => {
  const dir = join(runsRoot(), TEST_RUN_ID);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("workspace lifecycle", () => {
  it("creates workspace and artifacts directories", async () => {
    const { workspacePath, artifactsPath } = await createRunDirs(TEST_RUN_ID);

    expect(existsSync(workspacePath)).toBe(true);
    expect(existsSync(artifactsPath)).toBe(true);
    expect(workspacePath).toBe(workspaceDir(TEST_RUN_ID));
    expect(artifactsPath).toBe(artifactsDir(TEST_RUN_ID));
  });

  it("writes artifact atomically", async () => {
    const { artifactsPath } = await createRunDirs(TEST_RUN_ID);
    const data = { runId: TEST_RUN_ID, status: "complete" };

    const filePath = await writeArtifact(artifactsPath, "test.json", data);
    const content = JSON.parse(await readFile(filePath, "utf8"));
    expect(content.runId).toBe(TEST_RUN_ID);

    // No .tmp file should remain
    expect(existsSync(filePath + ".tmp")).toBe(false);
  });

  it("cleanupWorkspace removes workspace but keeps artifacts", async () => {
    const { workspacePath, artifactsPath } = await createRunDirs(TEST_RUN_ID);
    await writeArtifact(artifactsPath, "keep.json", { preserved: true });

    await cleanupWorkspace(TEST_RUN_ID);

    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(artifactsPath)).toBe(true);
    const kept = JSON.parse(await readFile(join(artifactsPath, "keep.json"), "utf8"));
    expect(kept.preserved).toBe(true);
  });
});
