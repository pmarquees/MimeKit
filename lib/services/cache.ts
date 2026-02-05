import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunResult, runResultSchema } from "@/lib/models";

const CACHE_FILE = path.join(os.tmpdir(), "mimickit-runs-cache.json");
const MAX_RUNS = 50;

type GlobalCache = {
  __mimickitRunCache?: Map<string, RunResult>;
};

const globalCache = globalThis as unknown as GlobalCache;
const runCache = globalCache.__mimickitRunCache ?? (globalCache.__mimickitRunCache = new Map());

function sortRuns(runs: RunResult[]): RunResult[] {
  return runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function readRunsFromDisk(): RunResult[] {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return [];
    }

    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const valid: RunResult[] = [];
    for (const item of parsed) {
      const result = runResultSchema.safeParse(item);
      if (result.success) {
        valid.push(result.data);
      }
    }
    return valid;
  } catch (error) {
    console.warn(
      `Unable to read run cache from disk: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

function syncFromDisk(): void {
  const diskRuns = readRunsFromDisk();
  for (const run of diskRuns) {
    runCache.set(run.id, run);
  }
}

function persistToDisk(): void {
  try {
    const runs = sortRuns([...runCache.values()]).slice(0, MAX_RUNS);
    const payload = JSON.stringify(runs, null, 2);
    fs.writeFileSync(CACHE_FILE, payload, "utf8");

    runCache.clear();
    for (const run of runs) {
      runCache.set(run.id, run);
    }
  } catch (error) {
    console.warn(
      `Unable to persist run cache to disk: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function setRun(run: RunResult): void {
  syncFromDisk();
  runCache.set(run.id, run);
  persistToDisk();
}

export function getRun(runId: string): RunResult | undefined {
  syncFromDisk();
  return runCache.get(runId);
}

export function listRuns(): RunResult[] {
  syncFromDisk();
  return sortRuns([...runCache.values()]);
}
