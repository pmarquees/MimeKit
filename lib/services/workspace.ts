import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const RUNS_ROOT = process.env.VERCEL
  ? join(tmpdir(), ".runs")
  : join(process.cwd(), ".runs");

export function runsRoot(): string {
  return RUNS_ROOT;
}

export function runDir(runId: string): string {
  return join(RUNS_ROOT, runId);
}

export function workspaceDir(runId: string): string {
  return join(RUNS_ROOT, runId, "workspace");
}

export function artifactsDir(runId: string): string {
  return join(RUNS_ROOT, runId, "artifacts");
}

export async function createRunDirs(runId: string): Promise<{
  workspacePath: string;
  artifactsPath: string;
}> {
  const ws = workspaceDir(runId);
  const art = artifactsDir(runId);
  await mkdir(ws, { recursive: true });
  await mkdir(art, { recursive: true });
  return { workspacePath: ws, artifactsPath: art };
}

export async function writeArtifact(
  artifactsPath: string,
  fileName: string,
  data: unknown
): Promise<string> {
  const filePath = join(artifactsPath, fileName);
  const tmp = filePath + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  // Atomic rename via overwrite
  const { rename } = await import("node:fs/promises");
  await rename(tmp, filePath);
  return filePath;
}

export async function writeTextArtifact(
  artifactsPath: string,
  fileName: string,
  content: string
): Promise<string> {
  const filePath = join(artifactsPath, fileName);
  const tmp = filePath + ".tmp";
  await writeFile(tmp, content, "utf8");
  // Atomic rename via overwrite
  const { rename } = await import("node:fs/promises");
  await rename(tmp, filePath);
  return filePath;
}

export async function cleanupWorkspace(runId: string): Promise<void> {
  const ws = workspaceDir(runId);
  await rm(ws, { recursive: true, force: true });
}
