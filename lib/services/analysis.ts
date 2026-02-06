import {
  architectureModelSchema,
  ArchitectureModel,
  IntentSpec,
  intentSpecSchema,
  MODEL_VERSION,
  RepoSnapshot,
  StackFingerprint
} from "@/lib/models";
import { callClaudeJson, schemaAsJson } from "@/lib/services/claude";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Token budget: prompt ~10K tokens + 8K max_tokens output = ~18K total under 30K token/min rate limit
const ARCH_SUMMARY_BUDGET = 40_000;

function repoSnapshotSummary(snapshot: RepoSnapshot): string {
  const treeSample = snapshot.fileTree.slice(0, 200).map((item) => `${item.type}:${item.path}`);

  // Estimate skeleton size without files
  const skeleton = JSON.stringify(
    {
      repo: snapshot.repo,
      metadata: snapshot.metadata,
      languages: snapshot.languages,
      treeSample,
      files: []
    },
    null,
    2
  );
  let remaining = ARCH_SUMMARY_BUDGET - skeleton.length;

  const fileSamples: Array<{ path: string; reason: string; content: string }> = [];
  for (const file of snapshot.files) {
    const content = file.content.slice(0, 4_000);
    const entrySize = JSON.stringify({ path: file.path, reason: file.reason, content }).length + 10;
    if (remaining - entrySize < 0 && fileSamples.length > 0) break;
    remaining -= entrySize;
    fileSamples.push({ path: file.path, reason: file.reason, content });
  }

  return JSON.stringify(
    {
      repo: snapshot.repo,
      metadata: snapshot.metadata,
      languages: snapshot.languages,
      treeSample,
      files: fileSamples
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Smart summary for intent extraction: prioritize high-signal files,
// condense architecture to essentials
// ---------------------------------------------------------------------------

const INTENT_FILE_PRIORITY: Array<(path: string, reason: string) => boolean> = [
  (_p, r) => r === "project readme",
  (_p, r) => r === "database schema",
  (_p, r) => r === "contributing guide" || r === "agent instructions",
  (p) => /\/(api|server|routers?)\//i.test(p),
  (_p, r) => r === "config signal",
  (_p, r) => r === "dependency manifest",
  (_p, r) => r === "global styles",
  (p) => /page\.(tsx|ts|jsx|js)$/.test(p),
  () => true // everything else
];

function prioritizeFilesForIntent(files: RepoSnapshot["files"]): RepoSnapshot["files"] {
  const buckets: Array<RepoSnapshot["files"]> = INTENT_FILE_PRIORITY.map(() => []);
  for (const file of files) {
    for (let i = 0; i < INTENT_FILE_PRIORITY.length; i++) {
      if (INTENT_FILE_PRIORITY[i](file.path, file.reason)) {
        buckets[i].push(file);
        break;
      }
    }
  }
  return buckets.flat();
}

// Budget for intent: smaller since we also embed a condensed arch summary
const INTENT_SUMMARY_BUDGET = 35_000;

function repoSnapshotForIntent(
  snapshot: RepoSnapshot,
  architecture: ArchitectureModel
): string {
  // Full file tree -- route structure is critical for intent
  const treeSample = snapshot.fileTree.slice(0, 200).map((item) => `${item.type}:${item.path}`);

  // Smart file ordering: high-signal files first
  const orderedFiles = prioritizeFilesForIntent(snapshot.files);

  // Condensed architecture: names, roles, edges -- no full tech/inputs/outputs arrays
  const archSummary = {
    components: architecture.components.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role
    })),
    edges: architecture.edges
  };

  // Budget: reserve space for metadata/tree/architecture, use remainder for file contents
  const skeleton = JSON.stringify(
    {
      repo: snapshot.repo,
      metadata: snapshot.metadata,
      languages: snapshot.languages,
      treeSample,
      files: [],
      architecture: archSummary
    },
    null,
    2
  );
  let remaining = INTENT_SUMMARY_BUDGET - skeleton.length;

  const fileSamples: Array<{ path: string; reason: string; content: string }> = [];
  for (const file of orderedFiles) {
    const content = file.content.slice(0, 4_000);
    const entrySize = JSON.stringify({ path: file.path, reason: file.reason, content }).length + 10;
    if (remaining - entrySize < 0 && fileSamples.length > 0) break;
    remaining -= entrySize;
    fileSamples.push({ path: file.path, reason: file.reason, content });
  }

  return JSON.stringify(
    {
      repo: snapshot.repo,
      metadata: snapshot.metadata,
      languages: snapshot.languages,
      treeSample,
      files: fileSamples,
      architecture: archSummary
    },
    null,
    2
  );
}

function fallbackArchitecture(snapshot: RepoSnapshot, stack: StackFingerprint): ArchitectureModel {
  const frontend = stack.frontend[0]?.name ?? "Frontend";
  const backend = stack.backend[0]?.name ?? "Backend";
  const db = stack.db[0]?.name ?? "Data Store";
  const auth = stack.auth[0]?.name ?? "Auth Service";

  const components = [
    {
      id: "frontend",
      name: frontend,
      role: "Client UI layer",
      tech: [frontend],
      inputs: ["HTTP response", "user interactions"],
      outputs: ["API requests"],
      confidence: 0.65
    },
    {
      id: "backend",
      name: backend,
      role: "Application/API layer",
      tech: [backend],
      inputs: ["API requests"],
      outputs: ["Business responses", "Data queries"],
      confidence: 0.62
    },
    {
      id: "database",
      name: db,
      role: "Persistence layer",
      tech: [db],
      inputs: ["Data queries"],
      outputs: ["Stored records"],
      confidence: 0.58
    },
    {
      id: "auth",
      name: auth,
      role: "Identity and access",
      tech: [auth],
      inputs: ["Auth requests"],
      outputs: ["Tokens/claims"],
      confidence: 0.56
    }
  ];

  return {
    version: MODEL_VERSION,
    components,
    edges: [
      { from: "frontend", to: "backend", type: "request" },
      { from: "backend", to: "database", type: "data" },
      { from: "frontend", to: "auth", type: "request" },
      { from: "auth", to: "backend", type: "event" }
    ]
  };
}

// ---------------------------------------------------------------------------
// Helpers for fallback intent extraction from snapshot signals
// ---------------------------------------------------------------------------

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Find last sentence boundary before maxLen
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n\n");
  const cutAt = Math.max(lastPeriod, lastNewline);
  if (cutAt > maxLen * 0.4) return truncated.slice(0, cutAt + 1).trim();
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace).trim() + "..." : truncated.trim() + "...";
}

function extractReadmeDescription(readme: string): string {
  const cleaned = stripHtml(readme);
  // Skip markdown image lines and empty lines at the start
  const lines = cleaned.split("\n").filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("![")) return false;
    if (trimmed.startsWith("#") && trimmed.length < 4) return false;
    return true;
  });
  const joined = lines.join("\n");
  return truncateAtSentence(joined, 500);
}

function extractReadmeFeatures(readme: string): string[] {
  // Look for ## Features or ## Key Features section
  const featuresMatch = readme.match(/##\s+(?:Key\s+)?Features\s*\n([\s\S]*?)(?:\n##\s|\n$|$)/i);
  if (!featuresMatch?.[1]) return [];
  const section = featuresMatch[1];
  const bullets = section
    .split("\n")
    .filter((l) => /^\s*[-*]\s+\*?\*?/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+\*?\*?/, "").replace(/\*?\*?\s*[-—].*$/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 12);
  return bullets;
}

function deriveUserFlowsFromRoutes(snapshot: RepoSnapshot): string[] {
  const routeFiles = snapshot.fileTree
    .filter((item) => item.type === "blob" && /page\.(tsx|ts|jsx|js)$/.test(item.path))
    .map((item) => item.path);

  const flowMap: Record<string, string> = {
    compose: "User creates new content.",
    post: "User views and interacts with posts.",
    edit: "User edits existing content.",
    projects: "User browses and manages projects.",
    notifications: "User views activity notifications.",
    settings: "User manages account settings.",
    admin: "Admin manages site configuration and users.",
    invite: "User processes a team invitation.",
    "sign-in": "User signs into the application.",
    "sign-up": "User creates a new account.",
    search: "User searches for content.",
    dashboard: "User views operational overview.",
    profile: "User views or edits their profile."
  };

  const flows: string[] = [];
  const seen = new Set<string>();
  for (const route of routeFiles) {
    for (const [segment, flow] of Object.entries(flowMap)) {
      if (route.includes(segment) && !seen.has(flow)) {
        seen.add(flow);
        flows.push(flow);
      }
    }
  }
  return flows.length > 0 ? flows : ["User navigates the application and interacts with primary features."];
}

function deriveDataContracts(snapshot: RepoSnapshot, architecture: ArchitectureModel): string[] {
  const contracts: string[] = [];
  const hasPrisma = snapshot.fileTree.some((item) => item.path.endsWith("schema.prisma"));
  const hasTrpc = snapshot.fileTree.some((item) => item.path.includes("trpc") || item.path.includes("routers/"));
  const hasGraphql = snapshot.fileTree.some((item) => item.path.endsWith(".graphql") || item.path.endsWith(".gql"));

  if (hasPrisma) contracts.push("Data models defined in Prisma schema with typed client generation.");
  if (hasTrpc) contracts.push("API contracts enforced via tRPC procedures with Zod validation.");
  if (hasGraphql) contracts.push("API schema defined in GraphQL with typed resolvers.");

  for (const comp of architecture.components) {
    if (/database|storage|persistence/i.test(comp.role)) {
      contracts.push(`${comp.name} manages persistent state via ${comp.tech.slice(0, 2).join(", ")}.`);
    }
  }

  if (!contracts.length) contracts.push("Data flows through typed interfaces between architectural components.");
  return contracts.slice(0, 6);
}

function deriveBusinessRules(snapshot: RepoSnapshot): string[] {
  const rules: string[] = [];
  const hasAuth = snapshot.fileTree.some((item) =>
    item.path.includes("auth") || item.path.includes("middleware")
  );
  const hasEnvExample = snapshot.files.find((file) =>
    file.path.endsWith(".env.example")
  );

  if (hasAuth) rules.push("Authentication required for protected routes.");
  if (hasEnvExample) {
    const content = hasEnvExample.content;
    if (/SECRET|JWT|SESSION/i.test(content)) rules.push("Session secrets must be configured for production.");
    if (/S3|R2|STORAGE|BUCKET/i.test(content)) rules.push("External storage service required for file uploads.");
    if (/DATABASE|DB_URL|POSTGRES/i.test(content)) rules.push("Database connection must be configured.");
  }
  rules.push("User input validated before persistence.");
  return rules.slice(0, 6);
}

function fallbackIntent(snapshot: RepoSnapshot, architecture: ArchitectureModel): IntentSpec {
  const readme = snapshot.files.find((file) => /readme/i.test(file.path))?.content;

  const systemPurpose = readme
    ? extractReadmeDescription(readme)
    : snapshot.repo.description ?? `${snapshot.repo.name} application.`;

  const readmeFeatures = readme ? extractReadmeFeatures(readme) : [];
  const coreFeatures = readmeFeatures.length > 0
    ? readmeFeatures
    : architecture.components.slice(0, 5).map((c) => `${c.name}: ${c.role}`);

  return {
    version: MODEL_VERSION,
    system_purpose: systemPurpose,
    core_features: coreFeatures,
    user_flows: deriveUserFlowsFromRoutes(snapshot),
    business_rules: deriveBusinessRules(snapshot),
    data_contracts: deriveDataContracts(snapshot, architecture),
    invariants: [
      "Application state managed server-side with typed API boundaries.",
      "Schema migrations applied before deployment."
    ],
    assumptions: [
      "Sampled files represent primary system behavior.",
      "Dependency manifests are present in repo root."
    ],
    unknowns: [
      "Background jobs or scheduled tasks not visible in sampled files.",
      "Third-party integrations outside sampled scope."
    ],
    confidenceBySection: {
      system_purpose: readme ? 0.8 : 0.5,
      core_features: readmeFeatures.length > 0 ? 0.85 : 0.5,
      user_flows: 0.6,
      data_contracts: 0.55,
      invariants: 0.5,
      assumptions: 0.5,
      unknowns: 0.4
    }
  };
}

export async function extractArchitecture(
  snapshot: RepoSnapshot,
  stack: StackFingerprint
): Promise<ArchitectureModel> {
  const prompt = [
    "Return valid JSON only.",
    "Task: extract architecture model for this repository summary.",
    "Output schema:",
    schemaAsJson(architectureModelSchema),
    "Rules:",
    "- components[] must include id, name, role, tech[], inputs[], outputs[]",
    "- edges[] must use type in {request,data,event}",
    "- no prose outside JSON",
    "Repository summary:",
    repoSnapshotSummary(snapshot),
    "Detected stack:",
    JSON.stringify(stack, null, 2)
  ].join("\n\n");

  const fallback = () => fallbackArchitecture(snapshot, stack);
  let model: ArchitectureModel;
  try {
    model = await callClaudeJson(prompt, architectureModelSchema, fallback, 2, "extractArchitecture");
  } catch (error) {
    console.warn(`Architecture extraction failed, using fallback: ${errorMessage(error)}`);
    model = fallback();
  }

  return {
    ...model,
    version: MODEL_VERSION
  };
}

export async function extractIntent(
  snapshot: RepoSnapshot,
  architecture: ArchitectureModel
): Promise<IntentSpec> {
  const prompt = [
    "Return valid JSON only.",
    "Task: extract behavioral intent spec for the TARGET REPOSITORY described below.",
    "The system_purpose should describe what THIS application does (not the analysis tool).",
    "The core_features should list the actual features of THIS application.",
    "The user_flows should describe how users interact with THIS application.",
    "The business_rules should describe constraints and rules of THIS application.",
    "Output schema:",
    schemaAsJson(intentSpecSchema),
    "Rules:",
    "- use concise, concrete statements about the TARGET repository",
    "- system_purpose: strip HTML tags, describe the app in plain text",
    "- core_features: list actual features visible in the source code and README",
    "- user_flows: derive from routes and UI components",
    "- business_rules: derive from auth, validation, and config patterns",
    "- include assumptions and unknowns",
    "- no prose outside JSON",
    "Repository and architecture summary:",
    repoSnapshotForIntent(snapshot, architecture)
  ].join("\n\n");

  const fallback = () => fallbackIntent(snapshot, architecture);
  let intent: IntentSpec;
  try {
    intent = await callClaudeJson(prompt, intentSpecSchema, fallback, 2, "extractIntent");
  } catch (error) {
    console.warn(`Intent extraction failed, using fallback: ${errorMessage(error)}`);
    intent = fallback();
  }

  return {
    ...intent,
    version: MODEL_VERSION
  };
}

export async function rewriteIntentForStackSwap(
  snapshot: RepoSnapshot,
  architecture: ArchitectureModel,
  previousIntent: IntentSpec,
  swapDescriptor: {
    category: string;
    from: string;
    to: string;
    hints: string[];
  }
): Promise<IntentSpec> {
  const prompt = [
    "Return valid JSON only.",
    "Task: rewrite intent spec after tech stack swap.",
    "Rewrite only impacted modules/interfaces/behavior.",
    "Output schema:",
    schemaAsJson(intentSpecSchema),
    "Swap descriptor:",
    JSON.stringify(swapDescriptor, null, 2),
    "Architecture model:",
    JSON.stringify(architecture, null, 2),
    "Existing intent:",
    JSON.stringify(previousIntent, null, 2),
    "Repository summary:",
    repoSnapshotSummary(snapshot)
  ].join("\n\n");

  const fallback = () => {
    return {
      ...previousIntent,
      assumptions: [
        ...previousIntent.assumptions,
        `Tech swap applied: ${swapDescriptor.from} -> ${swapDescriptor.to}.`
      ],
      unknowns: [...previousIntent.unknowns, "Post-swap migration complexity may require manual review."]
    };
  };
  let intent: IntentSpec;
  try {
    intent = await callClaudeJson(prompt, intentSpecSchema, fallback, 2, "rewriteIntentForStackSwap");
  } catch (error) {
    console.warn(`Stack swap rewrite failed, using fallback: ${errorMessage(error)}`);
    intent = fallback();
  }

  return {
    ...intent,
    version: MODEL_VERSION
  };
}
