import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { runHarnessPipeline } from "@/lib/services/pipeline";
import { PipelineSource } from "@/lib/models";
import { artifactsDir, runsRoot } from "@/lib/services/workspace";

describe("plan.md artifact generation", () => {
  const testRunIds: string[] = [];

  afterEach(async () => {
    // Cleanup test runs
    for (const runId of testRunIds) {
      await rm(resolve(runsRoot(), runId), { recursive: true, force: true });
    }
    testRunIds.length = 0;
  });

  it("should generate plan.md artifact for GitHub source", async () => {
    const source: PipelineSource = {
      type: "github",
      repoUrl: "https://github.com/vercel/next.js",
      ref: "canary"
    };

    const run = await runHarnessPipeline(source, "quick");
    testRunIds.push(run.id);

    // Check that plan.md exists
    const planMdPath = resolve(artifactsDir(run.id), "plan.md");
    const content = await readFile(planMdPath, "utf8");

    // Verify content structure
    expect(content).toContain("# Plan:");
    expect(content).toContain("## Phase 1: Initial Understanding");
    expect(content).toContain("## Phase 2: Design");
    expect(content).toContain("## Phase 3: Review");
    expect(content).toContain("## Phase 4: Final Plan");
    expect(content).toContain("## Implementation Prompt (LLM Ready)");
    
    // Verify it matches the prompt field in run result
    expect(content).toBe(run.plan.prompt);
  }, { timeout: 30000 });

  it("should generate plan.md artifact for local source", async () => {
    const source: PipelineSource = {
      type: "local",
      repoPath: process.cwd()
    };

    const run = await runHarnessPipeline(source, "quick");
    testRunIds.push(run.id);

    // Check that plan.md exists
    const planMdPath = resolve(artifactsDir(run.id), "plan.md");
    const content = await readFile(planMdPath, "utf8");

    // Verify content exists and is markdown
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("# Plan:");
    expect(content).toBe(run.plan.prompt);
  }, { timeout: 20000 });

  it("plan.md should be a readable markdown file", async () => {
    const source: PipelineSource = {
      type: "github",
      repoUrl: "https://github.com/vercel/next.js"
    };

    const run = await runHarnessPipeline(source, "quick");
    testRunIds.push(run.id);

    const planMdPath = resolve(artifactsDir(run.id), "plan.md");
    const content = await readFile(planMdPath, "utf8");

    // Should be plain text, not JSON
    expect(() => JSON.parse(content)).toThrow();
    
    // Should have markdown formatting
    expect(content).toMatch(/^#\s+/m); // Has headers
    expect(content).toMatch(/^-\s+/m); // Has lists
    expect(content).toMatch(/```/); // Has code blocks
  }, { timeout: 30000 });
});
