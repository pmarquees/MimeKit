export const APP_NAME = "MimicKit";

function readInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const LIMITS = {
  maxRepoKb: readInt("MAX_REPO_KB", 50_000),
  maxFileBytes: readInt("MAX_FILE_BYTES", 120_000),
  maxSnapshotTokens: readInt("MAX_SNAPSHOT_TOKENS", 90_000),
  quickTopFiles: 10,
  deepTopFiles: 30,
  maxTreeItems: 6_000,
  maxContentsFiles: 80
};

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
export const ANTHROPIC_API_BASE = process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com/v1";
export const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export const HARNESS = {
  github: {
    shallowCloneDepth: readInt("HARNESS_CLONE_DEPTH", 1),
    cleanupWorkspace: process.env.HARNESS_CLEANUP_WORKSPACE === "true"
  },
  enableBuildExecution: false,
  ingest: {
    maxFileSizeBytes: readInt("HARNESS_MAX_FILE_SIZE", 120_000),
    maxBinarySizeBytes: readInt("HARNESS_MAX_BINARY_SIZE", 0)
  }
} as const;
