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

function repoSnapshotSummary(snapshot: RepoSnapshot): string {
  const treeSample = snapshot.fileTree.slice(0, 200).map((item) => `${item.type}:${item.path}`);
  const fileSamples = snapshot.files.map((file) => ({
    path: file.path,
    reason: file.reason,
    content: file.content.slice(0, 4_000)
  }));

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

function fallbackIntent(snapshot: RepoSnapshot, architecture: ArchitectureModel): IntentSpec {
  const readme = snapshot.files.find((file) => /readme/i.test(file.path))?.content;

  return {
    version: MODEL_VERSION,
    system_purpose:
      readme?.slice(0, 240) ??
      "System processes repository logic and exposes functionality through layered components.",
    core_features: [
      "Repository analysis and system decomposition",
      "Component-level interaction mapping",
      "Stack inference and confidence reporting"
    ],
    user_flows: [
      "User submits a repository URL.",
      "System samples source files and detects architecture.",
      "User reviews architecture and generates executable plan."
    ],
    business_rules: [
      "Only public repositories are processed in MVP.",
      "Repository code is never executed.",
      "Large or binary files are excluded from analysis."
    ],
    data_contracts: [
      "Inputs include repo URL, optional branch, and scan mode.",
      "Pipeline outputs typed JSON artifacts for stack, architecture, and intent."
    ],
    invariants: [
      "Analysis runs server-side only.",
      "Artifacts are versioned and schema validated."
    ],
    assumptions: [
      "Sampled files represent most system behavior.",
      "Primary dependency manifests are present in repo root."
    ],
    unknowns: [
      "Undocumented runtime jobs/background workers.",
      "Unseen integrations outside sampled files."
    ],
    confidenceBySection: {
      system_purpose: 0.7,
      core_features: 0.75,
      user_flows: 0.72,
      data_contracts: 0.64,
      invariants: 0.8,
      assumptions: 0.55,
      unknowns: 0.58
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
    model = await callClaudeJson(prompt, architectureModelSchema, fallback);
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
    "Task: extract behavioral intent spec from architecture and source summary.",
    "Output schema:",
    schemaAsJson(intentSpecSchema),
    "Rules:",
    "- use concise, concrete statements",
    "- include assumptions and unknowns",
    "- no prose outside JSON",
    "Architecture model:",
    JSON.stringify(architecture, null, 2),
    "Repository summary:",
    repoSnapshotSummary(snapshot)
  ].join("\n\n");

  const fallback = () => fallbackIntent(snapshot, architecture);
  let intent: IntentSpec;
  try {
    intent = await callClaudeJson(prompt, intentSpecSchema, fallback);
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
    intent = await callClaudeJson(prompt, intentSpecSchema, fallback);
  } catch (error) {
    console.warn(`Stack swap rewrite failed, using fallback: ${errorMessage(error)}`);
    intent = fallback();
  }

  return {
    ...intent,
    version: MODEL_VERSION
  };
}
