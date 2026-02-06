#!/usr/bin/env node

import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { PipelineSource, ScanMode } from "../models";
import { runHarnessPipeline } from "../services/pipeline";
import { artifactsDir } from "../services/workspace";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  source: PipelineSource;
  ref?: string;
  scanMode: ScanMode;
} {
  let github: string | undefined;
  let repo: string | undefined;
  let ref: string | undefined;
  let scanMode: ScanMode = "quick";

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--github":
        github = args[++i];
        break;
      case "--repo":
        repo = args[++i];
        break;
      case "--ref":
        ref = args[++i];
        break;
      case "--scan-mode":
        scanMode = args[++i] as ScanMode;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  if (github && repo) {
    console.error("Error: specify exactly one of --github or --repo, not both.");
    process.exit(1);
  }

  if (!github && !repo) {
    console.error("Usage:");
    console.error("  run-harness --github <repo_url> [--ref <branch|tag|sha>] [--scan-mode quick|deep]");
    console.error("  run-harness --repo <local_path> [--ref <branch|tag|sha>] [--scan-mode quick|deep]");
    process.exit(1);
  }

  const source: PipelineSource = github
    ? { type: "github", repoUrl: github, ref }
    : { type: "local", repoPath: resolve(repo!), ref };

  return { source, ref, scanMode };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { source, scanMode } = parseArgs(process.argv);

  console.log(`MimicKit Harness`);
  console.log(`Source: ${source.type === "github" ? source.repoUrl : source.repoPath}`);
  console.log(`Mode: ${scanMode}`);
  if ("ref" in source && source.ref) {
    console.log(`Ref: ${source.ref}`);
  }
  console.log("");

  const githubToken = process.env.GITHUB_TOKEN;
  const run = await runHarnessPipeline(source, scanMode, githubToken);

  // Write final run artifact
  const artifactPath = artifactsDir(run.id);
  const runJsonPath = resolve(artifactPath, "run.json");
  await writeFile(runJsonPath, JSON.stringify(run, null, 2), "utf8");

  // Summary
  console.log("");
  console.log("--- Run Complete ---");
  console.log(`Run ID:      ${run.id}`);
  console.log(`Source:      ${source.type}`);
  const fetchStage = run.stages.find((s) => s.id === "fetch");
  if (fetchStage) {
    const snapshotRef = run.snapshot.repo.branch;
    console.log(`Ref:         ${snapshotRef}`);
  }
  console.log(`Files:       ${run.snapshot.metadata.selectedFiles} selected / ${run.snapshot.metadata.totalFiles} total`);
  console.log(`Stack:       ${[...run.stack.frontend, ...run.stack.backend, ...run.stack.language].map((s) => s.name).join(", ") || "(none detected)"}`);
  console.log(`Artifacts:   ${artifactPath}`);
  console.log(`  - run.json (full analysis)`);
  console.log(`  - plan.md (executable prompt)`);

  for (const stage of run.stages) {
    const icon = stage.status === "done" ? "+" : stage.status === "error" ? "!" : "-";
    console.log(`  [${icon}] ${stage.label}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
