import { z } from "zod";

export const MODEL_VERSION = "1.0.0";

export const scanModeSchema = z.enum(["quick", "deep"]);
export type ScanMode = z.infer<typeof scanModeSchema>;

export const targetAgentSchema = z.enum(["claude-code", "codex", "generic"]);
export type TargetAgent = z.infer<typeof targetAgentSchema>;

export const repoTreeNodeSchema = z.object({
  path: z.string(),
  type: z.enum(["blob", "tree"]),
  size: z.number().optional()
});
export type RepoTreeNode = z.infer<typeof repoTreeNodeSchema>;

export const selectedFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  reason: z.string(),
  content: z.string(),
  truncated: z.boolean().default(false)
});
export type SelectedFile = z.infer<typeof selectedFileSchema>;

export const repoSnapshotSchema = z.object({
  version: z.string(),
  repo: z.object({
    url: z.string().url(),
    owner: z.string(),
    name: z.string(),
    branch: z.string(),
    defaultBranch: z.string(),
    sizeKb: z.number(),
    stars: z.number(),
    openIssues: z.number(),
    description: z.string().optional(),
    language: z.string().optional()
  }),
  metadata: z.object({
    scanMode: scanModeSchema,
    fetchedAt: z.string(),
    totalFiles: z.number(),
    selectedFiles: z.number(),
    skippedBinaryFiles: z.number(),
    skippedScriptFiles: z.number(),
    tokenEstimate: z.number()
  }),
  languages: z.array(
    z.object({
      name: z.string(),
      bytes: z.number(),
      share: z.number()
    })
  ),
  fileTree: z.array(repoTreeNodeSchema),
  files: z.array(selectedFileSchema)
});
export type RepoSnapshot = z.infer<typeof repoSnapshotSchema>;

export const stackCategorySchema = z.enum([
  "frontend",
  "backend",
  "db",
  "auth",
  "infra",
  "language"
]);
export type StackCategory = z.infer<typeof stackCategorySchema>;

export const stackItemSchema = z.object({
  category: stackCategorySchema,
  name: z.string(),
  version: z.string().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([])
});
export type StackItem = z.infer<typeof stackItemSchema>;

export const stackFingerprintSchema = z.object({
  version: z.string(),
  frontend: z.array(stackItemSchema),
  backend: z.array(stackItemSchema),
  db: z.array(stackItemSchema),
  auth: z.array(stackItemSchema),
  infra: z.array(stackItemSchema),
  language: z.array(stackItemSchema),
  lowConfidenceFindings: z.array(z.string()).default([])
});
export type StackFingerprint = z.infer<typeof stackFingerprintSchema>;

export const architectureComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  tech: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional()
});
export type ArchitectureComponent = z.infer<typeof architectureComponentSchema>;

const architectureEdgeTypeSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").toLowerCase();
  }
  return String(value ?? "").toLowerCase();
}, z.enum(["request", "data", "event"]));

export const architectureEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: architectureEdgeTypeSchema
});
export type ArchitectureEdge = z.infer<typeof architectureEdgeSchema>;

export const architectureModelSchema = z.object({
  version: z.string(),
  components: z.array(architectureComponentSchema),
  edges: z.array(architectureEdgeSchema)
});
export type ArchitectureModel = z.infer<typeof architectureModelSchema>;

export const intentSpecSchema = z.object({
  version: z.string(),
  system_purpose: z.string(),
  core_features: z.array(z.string()),
  user_flows: z.array(z.string()),
  business_rules: z.array(z.string()),
  data_contracts: z.array(z.string()),
  invariants: z.array(z.string()),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
  confidenceBySection: z.record(z.string(), z.number().min(0).max(1)).default({})
});
export type IntentSpec = z.infer<typeof intentSpecSchema>;

export const executablePlanSchema = z.object({
  version: z.string(),
  targetAgent: targetAgentSchema,
  structured: z.object({
    systemOverview: z.string(),
    architectureDescription: z.string(),
    moduleList: z.array(z.string()),
    interfaces: z.array(z.string()),
    dataModels: z.array(z.string()),
    behaviorRules: z.array(z.string()),
    buildSteps: z.array(z.string()),
    testExpectations: z.array(z.string()),
    constraints: z.array(z.string()),
    nonGoals: z.array(z.string())
  }),
  prompt: z.string()
});
export type ExecutablePlan = z.infer<typeof executablePlanSchema>;

export const techRegistryEntrySchema = z.object({
  key: z.string(),
  category: stackCategorySchema,
  alternatives: z.array(z.string()),
  compatibilityNotes: z.array(z.string()),
  transformationHints: z.array(z.string())
});
export type TechRegistryEntry = z.infer<typeof techRegistryEntrySchema>;

export const techRegistrySchema = z.object({
  version: z.string(),
  entries: z.array(techRegistryEntrySchema)
});
export type TechRegistry = z.infer<typeof techRegistrySchema>;

export const runResultSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  snapshot: repoSnapshotSchema,
  stack: stackFingerprintSchema,
  architecture: architectureModelSchema,
  intent: intentSpecSchema,
  plan: executablePlanSchema,
  stages: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["pending", "running", "done", "error"]),
      startedAt: z.string().optional(),
      finishedAt: z.string().optional(),
      error: z.string().optional()
    })
  )
});
export type RunResult = z.infer<typeof runResultSchema>;

export const analyzeRequestSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().optional(),
  scanMode: scanModeSchema.default("quick")
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export const stackSwapRequestSchema = z.object({
  runId: z.string(),
  category: stackCategorySchema,
  current: z.string(),
  replacement: z.string()
});
export type StackSwapRequest = z.infer<typeof stackSwapRequestSchema>;

export const recompileRequestSchema = z.object({
  runId: z.string(),
  intent: intentSpecSchema,
  targetAgent: targetAgentSchema
});
export type RecompileRequest = z.infer<typeof recompileRequestSchema>;
