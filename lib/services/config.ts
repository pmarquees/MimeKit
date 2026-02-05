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

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-7-sonnet-latest";
export const ANTHROPIC_API_BASE = process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com/v1";
export const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
