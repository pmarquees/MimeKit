import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import {
  HarnessContext,
  RepoSnapshot,
  SelectedFile,
  RepoTreeNode,
  ScanMode,
  MODEL_VERSION
} from "@/lib/models";
import { LIMITS, GITHUB_TOKEN } from "@/lib/services/config";
import { HARNESS } from "@/lib/services/config";
import {
  estimateTokens,
  isBinaryFile,
  isScriptFile,
  safeSnippet
} from "@/lib/services/sanitize";
import { writeArtifact } from "@/lib/services/workspace";

// ---------------------------------------------------------------------------
// Ignore rules
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache"
]);

function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function isLockFile(name: string): boolean {
  return name.endsWith(".lock") || name === "package-lock.json" || name === "yarn.lock" || name === "pnpm-lock.yaml";
}

// ---------------------------------------------------------------------------
// File selection (mirrors github-intake.ts heuristics)
// ---------------------------------------------------------------------------

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
  ["README.txt", "project readme"],
  ["CONTRIBUTING.md", "contributing guide"],
  ["AGENTS.MD", "agent instructions"],
  ["AGENTS.md", "agent instructions"]
]);

// Files matched by relative path (supports nested paths like prisma/schema.prisma)
const IMPORTANT_PATHS = new Map<string, string>([
  ["prisma/schema.prisma", "database schema"],
  ["schema.prisma", "database schema"],
  ["drizzle.config.ts", "database config"],
  ["drizzle.config.js", "database config"],
  ["src/app/globals.css", "global styles"],
  ["app/globals.css", "global styles"],
  ["src/styles/globals.css", "global styles"],
  ["styles/globals.css", "global styles"]
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
  "ts", "tsx", "js", "jsx", "py", "go", "rs",
  "java", "kt", "rb", "php", "swift", "scala", "cs"
]);

function isSourceFile(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

function reasonForFile(relPath: string): string | undefined {
  const base = basename(relPath);
  const exact = IMPORTANT_FILES.get(base);
  if (exact) return exact;
  const pathMatch = IMPORTANT_PATHS.get(relPath);
  if (pathMatch) return pathMatch;
  if (CONFIG_FILE_SUFFIXES.some((suffix) => relPath.endsWith(suffix))) {
    return "config signal";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Recursive file tree walk
// ---------------------------------------------------------------------------

type FileEntry = {
  relPath: string;
  absPath: string;
  size: number;
  isDirectory: boolean;
};

async function walkDir(root: string, base = ""): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const dirEntries = await readdir(join(root, base), { withFileTypes: true });

  for (const entry of dirEntries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const absPath = join(root, relPath);

    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      entries.push({ relPath, absPath, size: 0, isDirectory: true });
      const children = await walkDir(root, relPath);
      entries.push(...children);
    } else if (entry.isFile()) {
      if (isLockFile(entry.name)) continue;
      const info = await stat(absPath);
      entries.push({ relPath, absPath, size: info.size, isDirectory: false });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// GitHub metadata enrichment (lightweight, optional)
// ---------------------------------------------------------------------------

type GitHubRepoMeta = {
  default_branch: string;
  size: number;
  stargazers_count: number;
  open_issues_count: number;
  description: string | null;
  language: string | null;
};

function resolveToken(ctx: HarnessContext): string | undefined {
  return ctx.githubToken?.trim() || GITHUB_TOKEN || undefined;
}

async function fetchGitHubMeta(
  repoUrl: string,
  token?: string
): Promise<GitHubRepoMeta | null> {
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const name = (parts[1] ?? "").replace(/\.git$/, "");
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers,
      cache: "no-store"
    });
    if (!res.ok) return null;
    return (await res.json()) as GitHubRepoMeta;
  } catch {
    return null;
  }
}

async function fetchGitHubLanguages(
  repoUrl: string,
  token?: string
): Promise<Record<string, number>> {
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return {};
    const owner = parts[0];
    const name = (parts[1] ?? "").replace(/\.git$/, "");
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/languages`, {
      headers,
      cache: "no-store"
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, number>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Local git metadata fallback
// ---------------------------------------------------------------------------

async function localGitMeta(workspacePath: string): Promise<{
  branch: string;
  defaultBranch: string;
}> {
  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(workspacePath);
    const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    return { branch, defaultBranch: branch };
  } catch {
    return { branch: "unknown", defaultBranch: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// Language breakdown from file extensions (fallback)
// ---------------------------------------------------------------------------

function buildLocalLanguageBreakdown(
  files: FileEntry[]
): RepoSnapshot["languages"] {
  const extMap: Record<string, number> = {};
  const extToLang: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
    rb: "Ruby", php: "PHP", swift: "Swift", scala: "Scala", cs: "C#",
    css: "CSS", html: "HTML", scss: "SCSS", vue: "Vue", svelte: "Svelte"
  };
  for (const f of files) {
    if (f.isDirectory) continue;
    const ext = extname(f.relPath).slice(1).toLowerCase();
    const lang = extToLang[ext];
    if (!lang) continue;
    extMap[lang] = (extMap[lang] ?? 0) + f.size;
  }
  const total = Object.values(extMap).reduce((s, v) => s + v, 0);
  if (!total) return [];
  return Object.entries(extMap)
    .map(([name, bytes]) => ({ name, bytes, share: Number((bytes / total).toFixed(4)) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12);
}

function buildLanguageBreakdown(
  languages: Record<string, number>
): RepoSnapshot["languages"] {
  const total = Object.values(languages).reduce((sum, v) => sum + v, 0);
  if (!total) return [];
  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, bytes, share: Number((bytes / total).toFixed(4)) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Main ingest stage
// ---------------------------------------------------------------------------

export async function runIngestStage(ctx: HarnessContext): Promise<RepoSnapshot> {
  const allEntries = await walkDir(ctx.workspacePath);
  const fileEntries = allEntries.filter((e) => !e.isDirectory);
  const maxFileSize = HARNESS.ingest.maxFileSizeBytes;

  // Build file tree
  const fileTree: RepoTreeNode[] = allEntries
    .slice(0, LIMITS.maxTreeItems)
    .map((e) => ({
      path: e.relPath,
      type: e.isDirectory ? "tree" as const : "blob" as const,
      size: e.isDirectory ? undefined : e.size
    }));

  // Select important files
  const exactCandidates = fileEntries
    .filter((e) => reasonForFile(e.relPath))
    .map((e) => ({ ...e, reason: reasonForFile(e.relPath) as string }));

  // Select source code samples
  const topN = ctx.scanMode === "quick" ? LIMITS.quickTopFiles : LIMITS.deepTopFiles;
  const sourceCandidates = fileEntries
    .filter((e) => isSourceFile(e.relPath))
    .sort((a, b) => b.size - a.size)
    .slice(0, topN)
    .map((e) => ({ ...e, reason: "large source sample" }));

  // Deduplicate and limit
  const seen = new Set<string>();
  const combined: Array<typeof exactCandidates[number]> = [];
  for (const c of [...exactCandidates, ...sourceCandidates]) {
    if (seen.has(c.relPath)) continue;
    seen.add(c.relPath);
    combined.push(c);
    if (combined.length >= LIMITS.maxContentsFiles) break;
  }

  // Read file contents
  const selectedFiles: SelectedFile[] = [];
  let skippedBinaryFiles = 0;
  let skippedScriptFiles = 0;
  let tokenEstimate = 0;

  for (const candidate of combined) {
    if (isBinaryFile(candidate.relPath)) {
      skippedBinaryFiles++;
      continue;
    }
    if (isScriptFile(candidate.relPath)) {
      skippedScriptFiles++;
      continue;
    }
    if (candidate.size > maxFileSize) {
      selectedFiles.push({
        path: candidate.relPath,
        size: candidate.size,
        reason: candidate.reason,
        content: "[file omitted due to size limit]",
        truncated: true
      });
      continue;
    }

    try {
      const raw = await readFile(candidate.absPath, "utf8");
      const content = safeSnippet(raw, maxFileSize);
      const projected = tokenEstimate + estimateTokens(content);
      if (projected > LIMITS.maxSnapshotTokens) break;

      tokenEstimate = projected;
      selectedFiles.push({
        path: candidate.relPath,
        size: candidate.size,
        reason: candidate.reason,
        content,
        truncated: raw !== content
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Build metadata
  let repoMeta: {
    url: string; owner: string; name: string; branch: string;
    defaultBranch: string; sizeKb: number; stars: number;
    openIssues: number; description?: string; language?: string;
  };
  let languages: RepoSnapshot["languages"];

  if (ctx.source.type === "github") {
    const token = resolveToken(ctx);
    const ghMeta = await fetchGitHubMeta(ctx.source.repoUrl, token);
    const ghLangs = await fetchGitHubLanguages(ctx.source.repoUrl, token);
    languages = buildLanguageBreakdown(ghLangs);

    const parsed = new URL(ctx.source.repoUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const owner = parts[0] ?? "";
    const name = (parts[1] ?? "").replace(/\.git$/, "");
    const gitMeta = await localGitMeta(ctx.workspacePath);

    repoMeta = {
      url: ctx.source.repoUrl,
      owner,
      name,
      branch: ctx.source.ref || gitMeta.branch,
      defaultBranch: ghMeta?.default_branch ?? gitMeta.defaultBranch,
      sizeKb: ghMeta?.size ?? 0,
      stars: ghMeta?.stargazers_count ?? 0,
      openIssues: ghMeta?.open_issues_count ?? 0,
      description: ghMeta?.description ?? undefined,
      language: ghMeta?.language ?? undefined
    };
  } else {
    // Local source
    const gitMeta = await localGitMeta(ctx.workspacePath);
    languages = buildLocalLanguageBreakdown(fileEntries);
    const dirName = basename(ctx.workspacePath);

    repoMeta = {
      url: `file://${ctx.source.repoPath}`,
      owner: "local",
      name: dirName,
      branch: ctx.source.ref || gitMeta.branch,
      defaultBranch: gitMeta.defaultBranch,
      sizeKb: Math.round(fileEntries.reduce((s, e) => s + e.size, 0) / 1024),
      stars: 0,
      openIssues: 0
    };
  }

  const snapshot: RepoSnapshot = {
    version: MODEL_VERSION,
    repo: repoMeta,
    metadata: {
      scanMode: ctx.scanMode,
      fetchedAt: new Date().toISOString(),
      totalFiles: fileEntries.length,
      selectedFiles: selectedFiles.length,
      skippedBinaryFiles,
      skippedScriptFiles,
      tokenEstimate
    },
    languages,
    fileTree,
    files: selectedFiles
  };

  await writeArtifact(ctx.artifactsPath, "ingest.json", snapshot);

  return snapshot;
}
