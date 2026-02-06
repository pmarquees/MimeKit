import { LIMITS, GITHUB_TOKEN } from "@/lib/services/config";
import { DepthStrategy, RepoSnapshot, ScanMode, SelectedFile, MODEL_VERSION, RepoTreeNode } from "@/lib/models";
import {
  estimateTokens,
  isBinaryFile,
  isScriptFile,
  safeSnippet
} from "@/lib/services/sanitize";

type RepoRef = {
  owner: string;
  name: string;
};

type GitHubRepoResponse = {
  default_branch: string;
  private: boolean;
  size: number;
  stargazers_count: number;
  open_issues_count: number;
  description: string | null;
  language: string | null;
};

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

const IMPORTANT_FILES = new Map<string, string>([
  ["package.json", "dependency manifest"],
  ["requirements.txt", "dependency manifest"],
  ["pyproject.toml", "dependency manifest"],
  ["go.mod", "dependency manifest"],
  ["Cargo.toml", "dependency manifest"],
  ["pom.xml", "dependency manifest"],
  ["build.gradle", "dependency manifest"],
  ["Dockerfile", "runtime manifest"],
  ["docker-compose.yml", "infra manifest"],
  ["docker-compose.yaml", "infra manifest"],
  ["README.md", "project readme"],
  ["README", "project readme"],
  ["README.txt", "project readme"]
]);

const CONFIG_FILE_SUFFIXES = [
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "vite.config.ts",
  "webpack.config.js",
  ".env.example",
  "serverless.yml",
  "k8s.yaml",
  "k8s.yml"
];

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "swift",
  "scala",
  "cs"
]);

function resolveGitHubToken(githubToken?: string): string | undefined {
  const trimmed = githubToken?.trim();
  if (trimmed) return trimmed;
  return GITHUB_TOKEN;
}

function githubHeaders(githubToken?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = resolveGitHubToken(githubToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeGitHubError(status: number, text: string): Error {
  const body = text.toLowerCase();
  if (status === 403 && body.includes("rate limit")) {
    return new Error(
      "GitHub API rate limit exceeded. Add a GitHub token in Repo Intake or set GITHUB_TOKEN in .env.local."
    );
  }

  return new Error(`GitHub API error ${status}: ${text.slice(0, 300)}`);
}

async function fetchGitHubJson<T>(url: string, githubToken?: string): Promise<T> {
  const response = await fetch(url, {
    headers: githubHeaders(githubToken),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw normalizeGitHubError(response.status, text);
  }

  return (await response.json()) as T;
}

export function parseGitHubRepoUrl(repoUrl: string): RepoRef {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    throw new Error("Invalid repo URL.");
  }

  if (url.hostname !== "github.com") {
    throw new Error("Only github.com repositories are supported in MVP.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Repo URL must include owner and repository name.");
  }

  const owner = parts[0] ?? "";
  const name = (parts[1] ?? "").replace(/\.git$/, "");
  if (!owner || !name) {
    throw new Error("Invalid GitHub repository path.");
  }

  return { owner, name };
}

function normalizedContentPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function reasonForPath(path: string): string | undefined {
  const base = path.split("/").pop();
  if (!base) return undefined;
  const exact = IMPORTANT_FILES.get(base);
  if (exact) return exact;
  if (CONFIG_FILE_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
    return "config signal";
  }
  return undefined;
}

function sourceExtension(path: string): string {
  const base = path.split("/").pop() ?? path;
  const idx = base.lastIndexOf(".");
  if (idx < 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).toLowerCase();
}

function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.has(sourceExtension(path));
}

async function fetchFileContent(
  owner: string,
  name: string,
  path: string,
  ref: string,
  githubToken?: string
): Promise<{ content: string; size: number } | undefined> {
  const encodedPath = normalizedContentPath(path);
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;

  const response = await fetch(url, {
    headers: githubHeaders(githubToken),
    cache: "no-store"
  });

  if (!response.ok) {
    return undefined;
  }

  const json = (await response.json()) as {
    type?: string;
    size?: number;
    content?: string;
    encoding?: string;
  };

  if (json.type !== "file" || typeof json.size !== "number") {
    return undefined;
  }

  if (json.size > LIMITS.maxFileBytes) {
    return {
      size: json.size,
      content: "[file omitted due to size limit]"
    };
  }

  if (!json.content || json.encoding !== "base64") {
    return undefined;
  }

  const decoded = Buffer.from(json.content, "base64").toString("utf8");
  return {
    size: json.size,
    content: decoded
  };
}

function buildLanguageBreakdown(languages: Record<string, number>): RepoSnapshot["languages"] {
  const total = Object.values(languages).reduce((sum, value) => sum + value, 0);
  if (!total) return [];

  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, bytes, share: Number((bytes / total).toFixed(4)) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12);
}

export async function buildRepoSnapshot(
  repoUrl: string,
  branch: string | undefined,
  scanMode: ScanMode,
  githubToken?: string
): Promise<RepoSnapshot> {
  const { owner, name } = parseGitHubRepoUrl(repoUrl);
  const repo = await fetchGitHubJson<GitHubRepoResponse>(
    `https://api.github.com/repos/${owner}/${name}`,
    githubToken
  );

  if (repo.private) {
    throw new Error("Private repositories are out of MVP scope.");
  }

  if (repo.size > LIMITS.maxRepoKb) {
    throw new Error(
      `Repository too large (${repo.size} KB). Limit is ${LIMITS.maxRepoKb} KB. Adjust MAX_REPO_KB to override.`
    );
  }

  const selectedBranch = branch || repo.default_branch;

  const treeResponse = await fetchGitHubJson<{ tree: GitHubTreeItem[] }>(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${encodeURIComponent(selectedBranch)}?recursive=1`,
    githubToken
  );

  const fileTree: RepoTreeNode[] = treeResponse.tree.slice(0, LIMITS.maxTreeItems).map((item) => ({
    path: item.path,
    type: item.type,
    size: item.size
  }));

  const blobItems = treeResponse.tree.filter((item) => item.type === "blob");

  const exactCandidates = blobItems
    .filter((item) => reasonForPath(item.path))
    .map((item) => ({
      path: item.path,
      size: item.size ?? 0,
      reason: reasonForPath(item.path) as string
    }));

  // Determine depth strategy: when the repo has fewer source files than
  // quickTopFiles, deep mode shifts to per-file depth (line-level analysis)
  // instead of broader file-count sampling.
  const allSourceBlobs = blobItems.filter((item) => isSourceFile(item.path));
  const isSmallRepo = allSourceBlobs.length < LIMITS.quickTopFiles;
  const depthStrategy: DepthStrategy =
    scanMode === "deep" && isSmallRepo ? "per-file" : "file-count";

  let sourceCandidates: Array<{ path: string; size: number; reason: string }>;
  if (depthStrategy === "per-file") {
    // Small repo + deep mode: select ALL source files for per-file depth
    sourceCandidates = allSourceBlobs
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .map((item) => ({
        path: item.path,
        size: item.size ?? 0,
        reason: "per-file depth sample"
      }));
  } else {
    sourceCandidates = allSourceBlobs
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, scanMode === "quick" ? LIMITS.quickTopFiles : LIMITS.deepTopFiles)
      .map((item) => ({
        path: item.path,
        size: item.size ?? 0,
        reason: "large source sample"
      }));
  }

  const combined = [...exactCandidates, ...sourceCandidates]
    .filter((item, index, arr) => arr.findIndex((x) => x.path === item.path) === index)
    .slice(0, LIMITS.maxContentsFiles);

  // Per-file depth mode: increase per-file byte budget for deeper line-level analysis
  const effectiveMaxFileBytes = depthStrategy === "per-file"
    ? LIMITS.maxFileBytes * 2
    : LIMITS.maxFileBytes;

  const selectedFiles: SelectedFile[] = [];
  let skippedBinaryFiles = 0;
  let skippedScriptFiles = 0;
  let tokenEstimate = 0;

  for (const candidate of combined) {
    if (isBinaryFile(candidate.path)) {
      skippedBinaryFiles += 1;
      continue;
    }

    if (isScriptFile(candidate.path)) {
      skippedScriptFiles += 1;
      continue;
    }

    const fetched = await fetchFileContent(owner, name, candidate.path, selectedBranch, githubToken);
    if (!fetched) continue;

    const content = safeSnippet(fetched.content, effectiveMaxFileBytes);
    const projectedTokens = tokenEstimate + estimateTokens(content);
    if (projectedTokens > LIMITS.maxSnapshotTokens) {
      break;
    }

    tokenEstimate = projectedTokens;

    selectedFiles.push({
      path: candidate.path,
      size: fetched.size,
      reason: candidate.reason,
      content,
      truncated: fetched.content !== content
    });
  }

  const languages = await fetchGitHubJson<Record<string, number>>(
    `https://api.github.com/repos/${owner}/${name}/languages`,
    githubToken
  );

  return {
    version: MODEL_VERSION,
    repo: {
      url: repoUrl,
      owner,
      name,
      branch: selectedBranch,
      defaultBranch: repo.default_branch,
      sizeKb: repo.size,
      stars: repo.stargazers_count,
      openIssues: repo.open_issues_count,
      description: repo.description ?? undefined,
      language: repo.language ?? undefined
    },
    metadata: {
      scanMode,
      depthStrategy,
      fetchedAt: new Date().toISOString(),
      totalFiles: blobItems.length,
      selectedFiles: selectedFiles.length,
      skippedBinaryFiles,
      skippedScriptFiles,
      tokenEstimate
    },
    languages: buildLanguageBreakdown(languages),
    fileTree,
    files: selectedFiles
  };
}
