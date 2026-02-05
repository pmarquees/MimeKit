import { z } from "zod";
import {
  ArchitectureModel,
  ExecutablePlan,
  executablePlanSchema,
  IntentSpec,
  MODEL_VERSION,
  RepoSnapshot,
  StackFingerprint,
  TargetAgent
} from "@/lib/models";
import { callClaudeJson, schemaAsJson } from "@/lib/services/claude";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const structuredPlanSchema = executablePlanSchema.shape.structured;

type StructuredPlan = z.infer<typeof structuredPlanSchema>;
type RoutePlan = StructuredPlan["routeMap"][number];

type DesignSystemPlan = StructuredPlan["designSystem"];

function topNames(values: { name: string }[]): string[] {
  return values.slice(0, 3).map((item) => item.name);
}

function safeList(items: string[]): string[] {
  return items.length ? items : ["No explicit items detected; define during implementation with documented assumptions."];
}

function parsePackageDeps(snapshot: RepoSnapshot): Record<string, string> {
  const file = snapshot.files.find((item) => item.path.endsWith("package.json"));
  if (!file) return {};

  try {
    const json = JSON.parse(file.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      ...(json.dependencies ?? {}),
      ...(json.devDependencies ?? {})
    };
  } catch {
    return {};
  }
}

function collectStyleSource(snapshot: RepoSnapshot): string {
  const styleFiles = snapshot.files.filter((file) => {
    const path = file.path.toLowerCase();
    return (
      path.endsWith(".css") ||
      path.endsWith(".scss") ||
      path.endsWith(".sass") ||
      path.endsWith(".less") ||
      path.includes("tailwind") ||
      path.includes("theme") ||
      path.includes("globals.css")
    );
  });

  return styleFiles.map((file) => file.content).join("\n");
}

function detectDominantHexColors(snapshot: RepoSnapshot): string[] {
  const text = collectStyleSource(snapshot);
  if (!text) return [];

  const matches = text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const counts = new Map<string, number>();
  for (const value of matches) {
    const key = value.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex]) => hex);
}

function detectRadiusSignals(snapshot: RepoSnapshot): string[] {
  const text = collectStyleSource(snapshot);
  if (!text) return [];

  const cssRadius = text.match(/border-radius\s*:\s*([^;]+);/gi) ?? [];
  const tailwindRadius = text.match(/rounded-(none|sm|md|lg|xl|2xl|3xl|full)/g) ?? [];
  const values = new Set<string>();

  for (const rule of cssRadius) {
    const value = rule.split(":")[1]?.replace(";", "").trim();
    if (value) values.add(value);
  }
  for (const token of tailwindRadius) {
    values.add(token);
  }

  return [...values].slice(0, 8);
}

function detectTypographySignals(snapshot: RepoSnapshot): string[] {
  const text = collectStyleSource(snapshot);
  if (!text) return [];

  const matches = text.match(/font-family\s*:\s*([^;]+);/gi) ?? [];
  const values = new Set<string>();
  for (const rule of matches) {
    const value = rule.split(":")[1]?.replace(";", "").trim();
    if (value) values.add(value);
  }

  return [...values].slice(0, 5);
}

function normalizeRouteSegments(raw: string): string {
  const parts = raw.split("/").filter(Boolean);
  const filtered = parts.filter((segment) => {
    if (!segment) return false;
    if (segment.startsWith("(") && segment.endsWith(")")) return false;
    if (segment.startsWith("@")) return false;
    return true;
  });

  return `/${filtered.join("/")}`.replace(/\/+/g, "/") || "/";
}

function routeLayoutForPath(path: string): string {
  const lower = path.toLowerCase();
  if (path === "/") {
    return "Primary shell layout with top navigation, summary hero area, and action-focused content blocks.";
  }
  if (lower.includes("dashboard") || lower.includes("admin")) {
    return "Dense dashboard layout with stats rail, filter controls, and data grid/table body.";
  }
  if (lower.includes("setting") || lower.includes("profile")) {
    return "Two-column settings layout with section navigation and form-heavy detail panel.";
  }
  if (path.includes("[") || lower.includes("detail") || lower.includes("item")) {
    return "Detail layout with context header, segmented content sections, and related actions sidebar.";
  }
  if (lower.includes("auth") || lower.includes("login") || lower.includes("sign")) {
    return "Narrow auth layout centered on form card, validation messaging, and alternate auth providers.";
  }
  return "Standard page layout with title/actions header, main content region, and contextual feedback area.";
}

function routePurposeForPath(path: string, intent: IntentSpec): string {
  const lower = path.toLowerCase();
  if (path === "/") return "Entry point for navigation and core task initiation.";
  if (lower.includes("auth") || lower.includes("login") || lower.includes("sign")) {
    return "Handles authentication, session initiation, and access control transitions.";
  }
  if (lower.includes("dashboard")) {
    return "Provides operational overview and status monitoring for key system outputs.";
  }
  if (lower.includes("api")) {
    return "Exposes server interface for structured requests and domain operations.";
  }

  const firstFlow = intent.user_flows[0];
  if (firstFlow) {
    return `Supports user flow: ${firstFlow}`;
  }

  return "Supports primary business flow inferred from system intent.";
}

function routeComponentsForPath(path: string): string[] {
  const lower = path.toLowerCase();
  if (path === "/") {
    return ["Top nav", "hero/overview block", "primary CTA group", "summary cards"];
  }
  if (lower.includes("dashboard")) {
    return ["KPI cards", "filter bar", "table/grid", "activity timeline"];
  }
  if (lower.includes("auth") || lower.includes("login") || lower.includes("sign")) {
    return ["Auth form", "field validation", "submit controls", "fallback/error messaging"];
  }
  if (lower.includes("setting") || lower.includes("profile")) {
    return ["Section tabs", "editable forms", "save/cancel actions", "success/error alerts"];
  }
  if (path.includes("[")) {
    return ["Context header", "detail panels", "related records", "secondary actions"];
  }
  return ["Page header", "content section", "interactive controls", "feedback states"];
}

function routeLogicForPath(path: string, intent: IntentSpec): string[] {
  const keywords = path
    .toLowerCase()
    .replace(/[^a-z0-9/]/g, "")
    .split("/")
    .filter(Boolean);

  const matchedRules = intent.business_rules.filter((rule) =>
    keywords.some((keyword) => keyword.length > 2 && rule.toLowerCase().includes(keyword))
  );

  const matchedFlows = intent.user_flows.filter((flow) =>
    keywords.some((keyword) => keyword.length > 2 && flow.toLowerCase().includes(keyword))
  );

  return safeList([...matchedFlows.slice(0, 2), ...matchedRules.slice(0, 2)]);
}

function inferRouteMap(snapshot: RepoSnapshot, intent: IntentSpec): RoutePlan[] {
  const routePaths = new Set<string>();

  for (const item of snapshot.fileTree) {
    const path = item.path;

    if (path.startsWith("app/") && /\/page\.(tsx|ts|jsx|js|mdx)$/.test(path)) {
      const routePath = path
        .replace(/^app\//, "")
        .replace(/\/page\.(tsx|ts|jsx|js|mdx)$/, "");
      routePaths.add(normalizeRouteSegments(routePath));
    }

    if (path.startsWith("src/app/") && /\/page\.(tsx|ts|jsx|js|mdx)$/.test(path)) {
      const routePath = path
        .replace(/^src\/app\//, "")
        .replace(/\/page\.(tsx|ts|jsx|js|mdx)$/, "");
      routePaths.add(normalizeRouteSegments(routePath));
    }

    if (path.startsWith("pages/") && /\.(tsx|ts|jsx|js)$/.test(path)) {
      if (path.includes("/api/")) continue;
      const filename = path.split("/").pop() ?? "";
      if (filename.startsWith("_")) continue;

      const routePath = path
        .replace(/^pages\//, "")
        .replace(/\.(tsx|ts|jsx|js)$/, "")
        .replace(/\/index$/, "");
      routePaths.add(normalizeRouteSegments(routePath));
    }
  }

  if (!routePaths.size) {
    routePaths.add("/");
  }

  return [...routePaths]
    .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
    .slice(0, 20)
    .map((path) => ({
      path,
      purpose: routePurposeForPath(path, intent),
      layout: routeLayoutForPath(path),
      components: routeComponentsForPath(path),
      logic: routeLogicForPath(path, intent)
    }));
}

function inferFunctionalityLogic(intent: IntentSpec): string[] {
  const featureLogic = intent.core_features.map((feature) => `Feature logic: ${feature}`);
  const flowLogic = intent.user_flows.map((flow) => `Flow execution: ${flow}`);
  const guardLogic = intent.business_rules.map((rule) => `Rule enforcement: ${rule}`);
  return safeList([...featureLogic, ...flowLogic, ...guardLogic].slice(0, 18));
}

function inferDatabaseDesign(stack: StackFingerprint, intent: IntentSpec): string[] {
  const dbNames = topNames(stack.db);
  if (!dbNames.length) {
    return [
      "No explicit database detected from sampled files. Implement repository interfaces and document persistence assumptions.",
      "Keep data contracts versioned and isolate storage behind service boundaries."
    ];
  }

  const details: string[] = [];

  for (const name of dbNames) {
    const lower = name.toLowerCase();
    if (lower.includes("mongo")) {
      details.push(
        "MongoDB design: define collections per aggregate, enforce schema validation, and create indexes for high-frequency query fields."
      );
      details.push("Adopt explicit document versioning and migration scripts for backward-compatible schema changes.");
    } else if (lower.includes("postgres") || lower.includes("mysql") || lower.includes("sql") || lower.includes("prisma")) {
      details.push(
        "Relational design: identify core entities from contracts, normalize to stable table boundaries, and enforce foreign keys + unique constraints."
      );
      details.push("Use migration tooling with forward-only migrations and seed data for local/dev parity.");
    } else if (lower.includes("dynamo")) {
      details.push(
        "DynamoDB design: model access patterns first, define partition/sort keys, and precompute GSIs for query-heavy views."
      );
      details.push("Keep item shapes explicit and track TTL/archival behavior for event-like records.");
    } else {
      details.push(`Database design for ${name}: define canonical entity boundaries, keys, and lifecycle/migration strategy.`);
    }
  }

  const contractHints = intent.data_contracts.slice(0, 4).map((contract) => `Map contract to stored model: ${contract}`);
  return safeList([...details, ...contractHints]);
}

function inferDesignSystem(snapshot: RepoSnapshot, stack: StackFingerprint): DesignSystemPlan {
  const deps = parsePackageDeps(snapshot);
  const depNames = Object.keys(deps).map((name) => name.toLowerCase());
  const has = (needle: string) => depNames.some((name) => name.includes(needle));
  const detectedColors = detectDominantHexColors(snapshot);
  const detectedRadii = detectRadiusSignals(snapshot);
  const detectedTypography = detectTypographySignals(snapshot);

  const frontend = topNames(stack.frontend)[0] ?? "web framework";

  const colorPalette = has("tailwind")
    ? [
        detectedColors[0]
          ? `Primary token family should be anchored to detected color ${detectedColors[0]} and harmonized variants.`
          : "Define primary token family with 50-900 scale and contrast-safe on-primary text color.",
        detectedColors[1]
          ? `Secondary accent can derive from ${detectedColors[1]} for highlights and interaction emphasis.`
          : "Define secondary accent token family for highlights, badges, and callouts.",
        "Define semantic tokens for success, warning, danger, info, surfaces, text, and border states."
      ]
    : [
        detectedColors[0]
          ? `Set --color-primary around ${detectedColors[0]} with hover/active variants.`
          : "Set --color-primary plus hover/active variants and explicit contrast pairings.",
        detectedColors[1]
          ? `Set --color-accent around ${detectedColors[1]} for secondary emphasis surfaces.`
          : "Set --color-accent for secondary emphasis and supporting highlights.",
        "Define neutral scale tokens (--surface-0..3, --text-strong/muted, --border-default/strong)."
      ];

  const typography = detectedTypography.length
    ? [
        `Detected typography families: ${detectedTypography.join(" | ")}.`,
        "Promote one primary UI family and one secondary mono/technical family into explicit tokens.",
        "Define heading/body/caption scales with fixed line-height and weight mappings."
      ]
    : [
        "Define primary UI font token for body/labels and secondary mono token for technical metadata.",
        "Define heading scale tokens (h1-h6) with explicit size/line-height/weight.",
        "Define caption/label/helper text tokens to keep hierarchy consistent."
      ];

  const radiusSystem = detectedRadii.length
    ? [
        `Detected corner-radius signals: ${detectedRadii.join(", ")}.`,
        "Normalize into radius tokens (r-xs/r-sm/r-md/r-lg/r-xl) and map components to one token each.",
        "Use larger radii only for modal/sheet/special cards; keep dense controls tighter."
      ]
    : [
        "Define radius scale: r-xs=4px, r-sm=8px, r-md=12px, r-lg=16px, r-xl=24px.",
        "Apply r-sm for controls, r-md for cards/panels, r-lg+ for modal and sheet surfaces.",
        "Keep radius usage intentional to preserve distinctive but consistent UI character."
      ];

  const pageLayoutPatterns = [
    "Define route-level layout templates: shell page, dense workspace page, detail page, form/settings page.",
    "Specify page zones: title/actions header, primary content region, side context rail, feedback strip.",
    "Set responsive breakpoints and max-width/grid behavior per template."
  ];

  const styleLanguage = [
    "Distinct technical-workbench aesthetic: high information density with disciplined spacing and strong hierarchy.",
    "Use subtle layered surfaces, crisp borders, and restrained accent bursts for emphasis.",
    "Drive styling from reusable tokens/utilities, not one-off per-page values."
  ];

  const components = [
    "App shell (header + navigation + workspace regions)",
    "Button variants (primary, ghost, destructive, loading)",
    "Form controls (input/select/textarea with validation states)",
    "Data display primitives (cards, tables, badges, confidence indicators)",
    "Feedback surfaces (toasts, inline errors, empty/loading/skeleton states)",
    "Modal and bottom-sheet patterns with motion + dismissal behavior"
  ];

  if (has("radix") || has("shadcn") || has("headless")) {
    components.push("Headless composable primitives with app-level styling tokens");
  }
  if (has("material") || has("@mui")) {
    components.push("Theme-driven component variants aligned with Material tokens");
  }

  return {
    visualDirection: `Design system for ${frontend}: high-clarity technical workspace with strong hierarchy, restrained accents, and explicit state feedback.`,
    styleLanguage,
    colorPalette,
    typography,
    radiusSystem,
    pageLayoutPatterns,
    components,
    motion: [
      "Define motion tokens (fast/standard/slow) and apply consistently across hover, modal, and sheet interactions.",
      "Use spring-like easing for major surfaces and short eased fades for micro feedback.",
      "Honor reduced-motion preference and keep transitions informative, not ornamental."
    ],
    distinctiveTraits: [
      "Consistent corner-radius and border treatment makes the interface recognizable.",
      "Mono + UI typography pairing for technical identity and legibility.",
      "Signature panel layering and status/confidence visual treatment repeated across routes."
    ],
    statesAndFeedback: [
      "Define hover/focus/active/disabled states for all interactive elements",
      "Use non-blocking progress indicators for long-running analysis operations",
      "Display actionable error messages with cause and next step",
      "Include success and completion confirmations for compile/export/swap flows"
    ]
  };
}

function fallbackStructuredPlan(
  stack: StackFingerprint,
  architecture: ArchitectureModel,
  intent: IntentSpec,
  snapshot: RepoSnapshot,
  targetAgent: TargetAgent
): StructuredPlan {
  const routeMap = inferRouteMap(snapshot, intent);
  return {
    systemOverview: intent.system_purpose,
    architectureDescription: architecture.components
      .map((component) => `${component.name}: ${component.role} [${component.tech.join(", ")}]`)
      .join("\n"),
    routeMap,
    moduleList: architecture.components.map((component) => component.name),
    functionalityLogic: inferFunctionalityLogic(intent),
    interfaces: architecture.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.type})`),
    dataModels: safeList(intent.data_contracts),
    databaseDesign: inferDatabaseDesign(stack, intent),
    designSystem: inferDesignSystem(snapshot, stack),
    behaviorRules: safeList([...intent.business_rules, ...intent.invariants]),
    buildSteps: [
      "Scaffold target repo and baseline tooling (lint/typecheck/test) before feature work.",
      "Implement route-level layouts and navigation shell according to route map.",
      "Build modules and interfaces in architecture dependency order.",
      "Implement functionality logic and rule enforcement with explicit service boundaries.",
      "Apply data models + database design, including migrations/schema/index definitions when applicable.",
      "Implement design system tokens/components and align all pages to shared patterns.",
      "Add tests for routes, services, contracts, and critical edge-case behaviors.",
      "Run validation (typecheck/lint/tests) and fix regressions before completion."
    ],
    testExpectations: [
      "Unit tests cover route handlers, core business logic, and validation paths.",
      "Integration tests cover critical user flows and module interactions.",
      "Contract tests verify API/data model compatibility and error envelopes.",
      "UI tests validate key layouts, navigation, and state-feedback behavior."
    ],
    constraints: [
      `Target agent is ${targetAgent}; output should be directly executable by that agent.`,
      "Do not introduce out-of-scope features or unsupported infrastructure assumptions.",
      "Maintain compatibility with detected stack unless explicitly swapped.",
      "Prefer deterministic implementation details over vague placeholders."
    ],
    nonGoals: [
      "No production migration execution against live user data.",
      "No major UX redesign outside defined design system scope.",
      "No hidden background jobs/services without explicit architecture updates."
    ]
  };
}

function renderRouteMap(routeMap: StructuredPlan["routeMap"]): string {
  return routeMap
    .map(
      (route, index) =>
        `${index + 1}. ${route.path} | Purpose: ${route.purpose} | Layout: ${route.layout} | Components: ${route.components.join(", ")} | Logic: ${route.logic.join(" ; ")}`
    )
    .join("\n");
}

function renderDesignSystem(designSystem: DesignSystemPlan): string {
  return [
    `Visual direction: ${designSystem.visualDirection}`,
    `Style language: ${designSystem.styleLanguage.join(" | ")}`,
    `Color palette: ${designSystem.colorPalette.join(" | ")}`,
    `Typography: ${designSystem.typography.join(" | ")}`,
    `Radius system: ${designSystem.radiusSystem.join(" | ")}`,
    `Page layout patterns: ${designSystem.pageLayoutPatterns.join(" | ")}`,
    `Components: ${designSystem.components.join(" | ")}`,
    `Motion: ${designSystem.motion.join(" | ")}`,
    `Distinctive traits: ${designSystem.distinctiveTraits.join(" | ")}`,
    `States and feedback: ${designSystem.statesAndFeedback.join(" | ")}`
  ].join("\n");
}

function renderPrompt(structured: StructuredPlan, targetAgent: TargetAgent): string {
  const numbered = (title: string, body: string) => `${title}\n${body}\n`;
  const list = (items: string[]) => items.map((item, i) => `${i + 1}. ${item}`).join("\n");

  return [
    `Target agent: ${targetAgent}`,
    numbered("1. System overview", structured.systemOverview),
    numbered("2. Architecture description", structured.architectureDescription),
    numbered("3. Route and page layout map", renderRouteMap(structured.routeMap)),
    numbered("4. Module list", list(structured.moduleList)),
    numbered("5. Functionality logic", list(structured.functionalityLogic)),
    numbered("6. Interfaces", list(structured.interfaces)),
    numbered("7. Data models", list(structured.dataModels)),
    numbered("8. Database design", list(structured.databaseDesign)),
    numbered("9. Design system", renderDesignSystem(structured.designSystem)),
    numbered("10. Behavior rules", list(structured.behaviorRules)),
    numbered("11. Build steps ordered", list(structured.buildSteps)),
    numbered("12. Test expectations", list(structured.testExpectations)),
    numbered("13. Constraints", list(structured.constraints)),
    numbered("14. Non goals", list(structured.nonGoals))
  ].join("\n");
}

export async function compileExecutablePlan(
  stack: StackFingerprint,
  architecture: ArchitectureModel,
  intent: IntentSpec,
  snapshot: RepoSnapshot,
  targetAgent: TargetAgent
): Promise<ExecutablePlan> {
  const routeHints = inferRouteMap(snapshot, intent);
  const designHints = inferDesignSystem(snapshot, stack);

  const prompt = [
    "Return valid JSON only.",
    "Task: compile an executable build plan prompt for a coding agent.",
    "Output schema:",
    schemaAsJson(structuredPlanSchema),
    "Rules:",
    "- keep build steps concrete, ordered, and directly executable",
    "- include route-level plan with page layout descriptions for each user-facing route",
    "- describe functionality logic and rule enforcement, not just feature names",
    "- if DB signals exist, include concrete schema/index/migration guidance",
    "- include a design system section with explicit style language, color tokens, radius scale, motion, and distinctive traits",
    "- include concrete UI token guidance (colors, radius, typography) instead of generic advice",
    "- derive from architecture + intent + inferred route/design hints",
    "- avoid placeholders like 'as needed'",
    "Artifacts:",
    JSON.stringify({
      stack: {
        frontend: topNames(stack.frontend),
        backend: topNames(stack.backend),
        db: topNames(stack.db),
        auth: topNames(stack.auth),
        infra: topNames(stack.infra)
      },
      architecture,
      intent,
      routeHints,
      designHints,
      targetAgent
    })
  ].join("\n\n");

  const fallback = () => fallbackStructuredPlan(stack, architecture, intent, snapshot, targetAgent);
  let structured: StructuredPlan;
  try {
    structured = await callClaudeJson(prompt, structuredPlanSchema, fallback);
  } catch (error) {
    console.warn(`Plan compilation failed, using fallback: ${errorMessage(error)}`);
    structured = fallback();
  }

  return {
    version: MODEL_VERSION,
    targetAgent,
    structured,
    prompt: renderPrompt(structured, targetAgent)
  };
}
