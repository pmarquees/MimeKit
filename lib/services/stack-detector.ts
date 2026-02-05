import { MODEL_VERSION, RepoSnapshot, StackCategory, StackFingerprint, StackItem } from "@/lib/models";

type Finding = {
  category: StackCategory;
  name: string;
  version?: string;
  evidence: string;
  confidenceBoost: number;
};

function fileByName(snapshot: RepoSnapshot, filename: string): string | undefined {
  const hit = snapshot.files.find((file) => file.path.endsWith(filename));
  return hit?.content;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function parseDependenciesFromPackageJson(content: string): Record<string, string> {
  const json = safeJsonParse(content);
  if (!json || typeof json !== "object") return {};

  const data = json as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return {
    ...(data.dependencies ?? {}),
    ...(data.devDependencies ?? {})
  };
}

function maybeVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^[^0-9]*/, "") || value;
}

function buildItem(finding: Finding, count: number): StackItem {
  const confidence = Math.max(0.35, Math.min(0.99, 0.45 + count * 0.15 + finding.confidenceBoost));
  return {
    category: finding.category,
    name: finding.name,
    version: finding.version,
    confidence: Number(confidence.toFixed(2)),
    evidence: [finding.evidence]
  };
}

function mergeFindings(findings: Finding[]): Record<StackCategory, StackItem[]> {
  const grouped = new Map<string, StackItem>();

  for (const finding of findings) {
    const key = `${finding.category}:${finding.name.toLowerCase()}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, buildItem(finding, 1));
      continue;
    }

    existing.evidence.push(finding.evidence);
    existing.confidence = Math.min(0.99, Number((existing.confidence + 0.1).toFixed(2)));
    if (!existing.version && finding.version) {
      existing.version = finding.version;
    }
  }

  const output: Record<StackCategory, StackItem[]> = {
    frontend: [],
    backend: [],
    db: [],
    auth: [],
    infra: [],
    language: []
  };

  for (const item of grouped.values()) {
    output[item.category].push(item);
  }

  for (const category of Object.keys(output) as StackCategory[]) {
    output[category].sort((a, b) => b.confidence - a.confidence);
  }

  return output;
}

function detectFromPackageJson(content: string): Finding[] {
  const deps = parseDependenciesFromPackageJson(content);
  const findings: Finding[] = [];
  const has = (name: string) => deps[name] !== undefined;

  if (has("next")) {
    findings.push({
      category: "frontend",
      name: "Next.js",
      version: maybeVersion(deps.next),
      evidence: "package.json: dependency next",
      confidenceBoost: 0.25
    });
  }

  if (has("react")) {
    findings.push({
      category: "frontend",
      name: "React",
      version: maybeVersion(deps.react),
      evidence: "package.json: dependency react",
      confidenceBoost: 0.2
    });
  }

  if (has("express")) {
    findings.push({
      category: "backend",
      name: "Express",
      version: maybeVersion(deps.express),
      evidence: "package.json: dependency express",
      confidenceBoost: 0.22
    });
  }

  if (has("fastify")) {
    findings.push({
      category: "backend",
      name: "Fastify",
      version: maybeVersion(deps.fastify),
      evidence: "package.json: dependency fastify",
      confidenceBoost: 0.18
    });
  }

  if (has("mongoose")) {
    findings.push({
      category: "db",
      name: "MongoDB",
      version: maybeVersion(deps.mongoose),
      evidence: "package.json: dependency mongoose",
      confidenceBoost: 0.24
    });
  }

  if (has("pg") || has("postgres")) {
    findings.push({
      category: "db",
      name: "PostgreSQL",
      version: maybeVersion(deps.pg ?? deps.postgres),
      evidence: "package.json: dependency pg/postgres",
      confidenceBoost: 0.2
    });
  }

  if (has("prisma")) {
    findings.push({
      category: "db",
      name: "Prisma",
      version: maybeVersion(deps.prisma),
      evidence: "package.json: dependency prisma",
      confidenceBoost: 0.2
    });
  }

  if (has("firebase") || has("firebase-admin")) {
    findings.push({
      category: "auth",
      name: "Firebase",
      version: maybeVersion(deps.firebase ?? deps["firebase-admin"]),
      evidence: "package.json: dependency firebase/firebase-admin",
      confidenceBoost: 0.23
    });
  }

  if (has("next-auth") || has("@clerk/nextjs") || has("auth0")) {
    findings.push({
      category: "auth",
      name: has("next-auth") ? "NextAuth" : has("@clerk/nextjs") ? "Clerk" : "Auth0",
      version: maybeVersion(deps["next-auth"] ?? deps["@clerk/nextjs"] ?? deps.auth0),
      evidence: "package.json: auth dependency",
      confidenceBoost: 0.18
    });
  }

  return findings;
}

function detectFromRequirements(content: string): Finding[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
  const findings: Finding[] = [];

  const includes = (pkg: string) => lines.some((line) => line.startsWith(pkg));

  if (includes("django")) {
    findings.push({
      category: "backend",
      name: "Django",
      evidence: "requirements.txt: django",
      confidenceBoost: 0.25
    });
  }
  if (includes("fastapi")) {
    findings.push({
      category: "backend",
      name: "FastAPI",
      evidence: "requirements.txt: fastapi",
      confidenceBoost: 0.25
    });
  }
  if (includes("flask")) {
    findings.push({
      category: "backend",
      name: "Flask",
      evidence: "requirements.txt: flask",
      confidenceBoost: 0.22
    });
  }
  if (includes("sqlalchemy")) {
    findings.push({
      category: "db",
      name: "SQLAlchemy",
      evidence: "requirements.txt: sqlalchemy",
      confidenceBoost: 0.18
    });
  }

  return findings;
}

function detectFromPyProject(content: string): Finding[] {
  const lowered = content.toLowerCase();
  const findings: Finding[] = [];

  if (lowered.includes("django")) {
    findings.push({
      category: "backend",
      name: "Django",
      evidence: "pyproject.toml contains django",
      confidenceBoost: 0.22
    });
  }

  if (lowered.includes("fastapi")) {
    findings.push({
      category: "backend",
      name: "FastAPI",
      evidence: "pyproject.toml contains fastapi",
      confidenceBoost: 0.22
    });
  }

  return findings;
}

function detectFromGoMod(content: string): Finding[] {
  const lowered = content.toLowerCase();
  const findings: Finding[] = [];

  if (lowered.includes("gin-gonic/gin")) {
    findings.push({
      category: "backend",
      name: "Gin",
      evidence: "go.mod contains gin-gonic/gin",
      confidenceBoost: 0.23
    });
  }

  if (lowered.includes("gorm.io/gorm")) {
    findings.push({
      category: "db",
      name: "GORM",
      evidence: "go.mod contains gorm.io/gorm",
      confidenceBoost: 0.18
    });
  }

  return findings;
}

function detectFromCargo(content: string): Finding[] {
  const lowered = content.toLowerCase();
  const findings: Finding[] = [];

  if (lowered.includes("actix-web")) {
    findings.push({
      category: "backend",
      name: "Actix",
      evidence: "Cargo.toml contains actix-web",
      confidenceBoost: 0.21
    });
  }

  if (lowered.includes("diesel")) {
    findings.push({
      category: "db",
      name: "Diesel",
      evidence: "Cargo.toml contains diesel",
      confidenceBoost: 0.17
    });
  }

  return findings;
}

function detectFromJavaFiles(content: string, fileName: string): Finding[] {
  const lowered = content.toLowerCase();
  const findings: Finding[] = [];

  if (fileName.endsWith("pom.xml") && lowered.includes("spring-boot")) {
    findings.push({
      category: "backend",
      name: "Spring Boot",
      evidence: "pom.xml contains spring-boot",
      confidenceBoost: 0.25
    });
  }

  if (fileName.endsWith("build.gradle") && lowered.includes("org.springframework.boot")) {
    findings.push({
      category: "backend",
      name: "Spring Boot",
      evidence: "build.gradle contains org.springframework.boot",
      confidenceBoost: 0.25
    });
  }

  return findings;
}

function detectFromDockerfile(content: string): Finding[] {
  const lowered = content.toLowerCase();
  const findings: Finding[] = [];

  if (lowered.includes("node:")) {
    findings.push({
      category: "infra",
      name: "Node Runtime",
      evidence: "Dockerfile FROM node",
      confidenceBoost: 0.15
    });
  }

  if (lowered.includes("python:")) {
    findings.push({
      category: "infra",
      name: "Python Runtime",
      evidence: "Dockerfile FROM python",
      confidenceBoost: 0.15
    });
  }

  return findings;
}

function detectLanguageFindings(snapshot: RepoSnapshot): Finding[] {
  return snapshot.languages.slice(0, 3).map((lang) => ({
    category: "language",
    name: lang.name,
    evidence: `GitHub languages API (${lang.share * 100}% share)` ,
    confidenceBoost: 0.16
  }));
}

export function detectStack(snapshot: RepoSnapshot): StackFingerprint {
  const findings: Finding[] = [];

  for (const file of snapshot.files) {
    if (file.path.endsWith("package.json")) {
      findings.push(...detectFromPackageJson(file.content));
    } else if (file.path.endsWith("requirements.txt")) {
      findings.push(...detectFromRequirements(file.content));
    } else if (file.path.endsWith("pyproject.toml")) {
      findings.push(...detectFromPyProject(file.content));
    } else if (file.path.endsWith("go.mod")) {
      findings.push(...detectFromGoMod(file.content));
    } else if (file.path.endsWith("Cargo.toml")) {
      findings.push(...detectFromCargo(file.content));
    } else if (file.path.endsWith("pom.xml") || file.path.endsWith("build.gradle")) {
      findings.push(...detectFromJavaFiles(file.content, file.path));
    } else if (file.path.endsWith("Dockerfile")) {
      findings.push(...detectFromDockerfile(file.content));
    }
  }

  findings.push(...detectLanguageFindings(snapshot));

  const merged = mergeFindings(findings);

  const lowConfidenceFindings = [
    ...merged.frontend,
    ...merged.backend,
    ...merged.db,
    ...merged.auth,
    ...merged.infra,
    ...merged.language
  ]
    .filter((item) => item.confidence <= 0.55)
    .map((item) => `${item.category}:${item.name}`);

  return {
    version: MODEL_VERSION,
    frontend: merged.frontend,
    backend: merged.backend,
    db: merged.db,
    auth: merged.auth,
    infra: merged.infra,
    language: merged.language,
    lowConfidenceFindings
  };
}
