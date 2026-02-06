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

function markdownBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function markdownNumbers(items: string[]): string {
  return items.map((item, index) => {
    // Strip leading "N. " if Claude already numbered the step
    const cleaned = item.replace(/^\d+\.\s*/, "");
    return `${index + 1}. ${cleaned}`;
  }).join("\n");
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function sanitizeOverview(text: string): string {
  // Strip HTML tags
  let cleaned = text.replace(/<[^>]+>/g, "");
  // Strip markdown image syntax ![alt](url)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Collapse multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // Trim leading whitespace and headings that are just "#"
  cleaned = cleaned
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^#+\s*$/.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
  // Truncate at sentence boundary
  if (cleaned.length > 500) {
    const truncated = cleaned.slice(0, 500);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastNewline = truncated.lastIndexOf("\n\n");
    const cutAt = Math.max(lastPeriod, lastNewline);
    if (cutAt > 200) {
      cleaned = truncated.slice(0, cutAt + 1).trim();
    } else {
      const lastSpace = truncated.lastIndexOf(" ");
      cleaned = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim() + "...";
    }
  }
  return cleaned;
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

// ---------------------------------------------------------------------------
// Stack platform detection
// ---------------------------------------------------------------------------

function isNativeMobileStack(stack: StackFingerprint): boolean {
  const frontendNames = stack.frontend.map((item) => item.name.toLowerCase());
  const languageNames = stack.language.map((item) => item.name.toLowerCase());
  const infraNames = stack.infra.map((item) => item.name.toLowerCase());

  const hasSwiftUI = frontendNames.includes("swiftui");
  const hasUIKit = frontendNames.includes("uikit");
  const hasApplePlatform = frontendNames.includes("apple platform");
  const hasSwiftLang = languageNames.includes("swift");
  const hasXcode = infraNames.includes("xcode project");
  const hasSPM = infraNames.includes("swift package manager");

  // Strong signal: SwiftUI or UIKit detected as frontend framework
  if (hasSwiftUI || hasUIKit) return true;

  // Medium signal: Swift language + Apple platform or Xcode project
  if (hasSwiftLang && (hasApplePlatform || hasXcode || hasSPM)) return true;

  return false;
}

function isSwiftUIStack(stack: StackFingerprint): boolean {
  return stack.frontend.some((item) => item.name.toLowerCase() === "swiftui");
}

// ---------------------------------------------------------------------------
// SwiftUI style detection helpers
// ---------------------------------------------------------------------------

function collectSwiftSource(snapshot: RepoSnapshot): string {
  const swiftFiles = snapshot.files.filter((file) => file.path.endsWith(".swift"));
  return swiftFiles.map((file) => file.content).join("\n");
}

function detectSwiftUIColorSignals(snapshot: RepoSnapshot): string[] {
  const text = collectSwiftSource(snapshot);
  if (!text) return [];

  // Detect Color literals and asset catalog references
  const colorLiterals = text.match(/Color\(\s*(?:red|"[^"]+"|\.[\w]+)/g) ?? [];
  const assetColors = text.match(/Color\("([^"]+)"\)/g) ?? [];
  const systemColors = text.match(/Color\.(\w+)/g) ?? [];

  const values = new Set<string>();
  for (const c of [...colorLiterals, ...assetColors, ...systemColors]) {
    values.add(c);
    if (values.size >= 8) break;
  }

  return [...values];
}

function detectSwiftUIFontSignals(snapshot: RepoSnapshot): string[] {
  const text = collectSwiftSource(snapshot);
  if (!text) return [];

  const fontMatches = text.match(/\.font\(\s*\.(\w+)/g) ?? [];
  const customFonts = text.match(/Font\.custom\("([^"]+)"/g) ?? [];
  const values = new Set<string>();
  for (const f of [...fontMatches, ...customFonts]) {
    values.add(f);
    if (values.size >= 6) break;
  }

  return [...values];
}

function detectSwiftUIPatternSignals(snapshot: RepoSnapshot): {
  hasNavigationStack: boolean;
  hasTabView: boolean;
  hasSheet: boolean;
  hasFullScreenCover: boolean;
  hasToolbar: boolean;
  hasSearchable: boolean;
  hasSwiftData: boolean;
  hasCoreData: boolean;
  hasAsyncImage: boolean;
  hasAnimation: boolean;
} {
  const text = collectSwiftSource(snapshot);
  return {
    hasNavigationStack: /\bNavigationStack\b|\bNavigationView\b/.test(text),
    hasTabView: /\bTabView\b/.test(text),
    hasSheet: /\.sheet\b/.test(text),
    hasFullScreenCover: /\.fullScreenCover\b/.test(text),
    hasToolbar: /\.toolbar\b/.test(text),
    hasSearchable: /\.searchable\b/.test(text),
    hasSwiftData: /\bimport\s+SwiftData\b|\b@Model\b/.test(text),
    hasCoreData: /\bimport\s+CoreData\b|\bNSManagedObject\b/.test(text),
    hasAsyncImage: /\bAsyncImage\b/.test(text),
    hasAnimation: /\.animation\b|\.withAnimation\b|\.transition\b/.test(text)
  };
}

// ---------------------------------------------------------------------------
// Route / layout helpers
// ---------------------------------------------------------------------------

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

type RouteContext = {
  path: string;
  sourcePath?: string;
  sourceContent?: string;
};

type RouteSignals = {
  hasFloatingMenu: boolean;
  hasSidebar: boolean;
  hasStickyHeader: boolean;
  hasDialogOrSheet: boolean;
  hasCommandPalette: boolean;
  hasDataGridOrTable: boolean;
  hasChart: boolean;
};

function normalizeSegment(segment: string): string {
  return segment.replace(/^\[|\]$/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function routeSegments(path: string): string[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean);
}

function hasRouteSegment(path: string, variants: string[]): boolean {
  const segments = routeSegments(path);
  const normalized = variants.map((item) => normalizeSegment(item));
  return normalized.some((variant) => segments.includes(variant));
}

function routeSignalsFromContent(content?: string): RouteSignals {
  const source = content ?? "";
  return {
    hasFloatingMenu:
      /fixed[^"'\n]*\bbottom-\d+/i.test(source) ||
      /fixed[^"'\n]*\bright-\d+/i.test(source) ||
      /\b(floating|speed\s*dial|fab)\b/i.test(source) ||
      /\b(DropdownMenu|Popover)\b/.test(source),
    hasSidebar: /<aside\b/i.test(source) || /\b(sidebar|side-nav|drawer)\b/i.test(source) || /\bw-(64|72|80)\b/.test(source),
    hasStickyHeader: /\bsticky\s+top-0\b/.test(source) || /<header\b/i.test(source) || /\b(navbar|topbar)\b/i.test(source),
    hasDialogOrSheet: /\b(Dialog|Sheet|Drawer|Modal)\b/.test(source),
    hasCommandPalette: /\b(Command|SearchDialog|CommandDialog)\b/.test(source),
    hasDataGridOrTable: /\b(table|data\s*grid|DataTable|Table)\b/i.test(source),
    hasChart: /\b(Recharts|Chart|LineChart|BarChart|PieChart)\b/.test(source)
  };
}

function extractComponentNames(content?: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(/<([A-Z][A-Za-z0-9]+)/g);
  const names = new Set<string>();
  for (const match of matches) {
    const name = match[1];
    if (["Fragment", "Suspense", "ErrorBoundary", "Provider"].includes(name)) continue;
    names.add(name);
    if (names.size >= 8) break;
  }
  return [...names];
}

function appRouteFromFilePath(path: string, prefix: "app/" | "src/app/"): string {
  const relative = path.slice(prefix.length);
  const routePart = relative.replace(/(^|\/)page\.(tsx|ts|jsx|js|mdx)$/, "");
  return normalizeRouteSegments(routePart);
}

function pagesRouteFromFilePath(path: string): string {
  const routePath = path
    .replace(/^pages\//, "")
    .replace(/\.(tsx|ts|jsx|js)$/, "")
    .replace(/\/index$/, "")
    .replace(/^index$/, "");
  return normalizeRouteSegments(routePath);
}

function collectRouteContexts(snapshot: RepoSnapshot): RouteContext[] {
  const contexts = new Map<string, RouteContext>();
  const sampleByPath = new Map(snapshot.files.map((file) => [file.path, file.content]));

  const upsert = (routePath: string, sourcePath: string): void => {
    const existing = contexts.get(routePath);
    if (existing) {
      if (!existing.sourcePath) {
        existing.sourcePath = sourcePath;
      }
      if (!existing.sourceContent && sampleByPath.has(sourcePath)) {
        existing.sourceContent = sampleByPath.get(sourcePath);
      }
      return;
    }

    contexts.set(routePath, {
      path: routePath,
      sourcePath,
      sourceContent: sampleByPath.get(sourcePath)
    });
  };

  for (const item of snapshot.fileTree) {
    const filePath = item.path;
    if (item.type !== "blob") continue;

    if (filePath.startsWith("app/") && /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/.test(filePath)) {
      upsert(appRouteFromFilePath(filePath, "app/"), filePath);
      continue;
    }

    if (filePath.startsWith("src/app/") && /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/.test(filePath)) {
      upsert(appRouteFromFilePath(filePath, "src/app/"), filePath);
      continue;
    }

    if (filePath.startsWith("pages/") && /\.(tsx|ts|jsx|js)$/.test(filePath)) {
      if (filePath.includes("/api/")) continue;
      const filename = filePath.split("/").pop() ?? "";
      if (filename.startsWith("_")) continue;
      upsert(pagesRouteFromFilePath(filePath), filePath);
    }
  }

  if (!contexts.size) {
    contexts.set("/", { path: "/" });
  }

  return [...contexts.values()]
    .sort((a, b) => {
      if (a.path === "/") return -1;
      if (b.path === "/") return 1;
      const aInspected = a.sourceContent ? 0 : 1;
      const bInspected = b.sourceContent ? 0 : 1;
      if (aInspected !== bInspected) return aInspected - bInspected;
      return a.path.localeCompare(b.path);
    })
    .slice(0, 14);
}

function routeLayoutForPath(path: string, sourceContent?: string): string {
  const signals = routeSignalsFromContent(sourceContent);
  const hints: string[] = [];

  if (signals.hasSidebar) {
    hints.push("Split shell with persistent side navigation and independent main-content scrolling.");
  }
  if (signals.hasFloatingMenu) {
    hints.push(
      "Include floating action/command menu fixed to bottom-right with elevated surface, quick actions, and compact trigger."
    );
  }
  if (signals.hasStickyHeader) {
    hints.push("Use sticky top header for context, filters, and primary page actions.");
  }
  if (signals.hasCommandPalette) {
    hints.push("Support keyboard-first command surface (Cmd/Ctrl+K) with overlay search/navigation.");
  }

  if (hasRouteSegment(path, ["analytics", "dashboard", "report"])) {
    hints.push("Analytics-oriented content stack: KPI strip, filter controls, and dense chart/table region.");
  }
  if (path.includes("[") || hasRouteSegment(path, ["post", "project", "profile", "detail"])) {
    hints.push("Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.");
  }
  if (hasRouteSegment(path, ["auth", "login", "signin", "signup"])) {
    hints.push("Constrained-width auth card with explicit validation, recovery, and identity-provider actions.");
  }
  if (!hints.length) {
    hints.push("Top action bar + content-first body with contextual controls and explicit empty/loading/error states.");
  }

  return hints.slice(0, 3).join(" ");
}

function routePurposeForPath(path: string, intent: IntentSpec): string {
  if (path === "/") return "Entry point for navigation and primary workflow kickoff.";
  if (hasRouteSegment(path, ["auth", "login", "signin", "signup"])) {
    return "Handles authentication, session initialization, and access transitions.";
  }
  if (hasRouteSegment(path, ["dashboard", "analytics", "report"])) {
    return "Provides operational overview and status monitoring for key system outputs.";
  }
  if (hasRouteSegment(path, ["api"])) {
    return "Exposes server interface for structured requests and domain operations.";
  }
  if (hasRouteSegment(path, ["compose", "new", "create"])) {
    return "Content creation and editing workflow.";
  }
  if (hasRouteSegment(path, ["notification", "notifications"])) {
    return "Displays activity notifications and updates.";
  }
  if (hasRouteSegment(path, ["setting", "settings"])) {
    return "User or application settings management.";
  }
  if (hasRouteSegment(path, ["admin"])) {
    return "Administrative management and configuration.";
  }
  if (hasRouteSegment(path, ["invite"])) {
    return "Processes team or user invitation.";
  }
  if (hasRouteSegment(path, ["deactivated", "disabled", "banned"])) {
    return "Displays account status restriction.";
  }
  if (hasRouteSegment(path, ["search"])) {
    return "Search interface for finding content.";
  }
  if (hasRouteSegment(path, ["profile", "user"])) {
    return "Displays user profile and activity.";
  }
  if (hasRouteSegment(path, ["reset", "forgot", "password"])) {
    return "Account recovery and password management.";
  }

  // Try to match a relevant user flow from intent
  const segments = path.split("/").filter(Boolean).map((s) => s.replace(/^\[|\]$/g, "").toLowerCase());
  for (const flow of intent.user_flows) {
    const flowLower = flow.toLowerCase();
    if (segments.some((seg) => seg.length > 2 && flowLower.includes(seg))) {
      return `Supports user flow: ${flow}`;
    }
  }

  // Detail route (dynamic segment)
  if (path.includes("[")) {
    return "Detail view for a specific resource.";
  }

  return "Supports primary application workflow.";
}

function routeComponentsForPath(path: string, sourceContent?: string): string[] {
  const signals = routeSignalsFromContent(sourceContent);
  const fromFile = extractComponentNames(sourceContent);
  const structural: string[] = [];

  if (signals.hasStickyHeader) structural.push("StickyHeader");
  if (signals.hasSidebar) structural.push("SideNavigation");
  if (signals.hasFloatingMenu) structural.push("FloatingActionMenu");
  if (signals.hasCommandPalette) structural.push("CommandPalette");
  if (signals.hasDialogOrSheet) structural.push("DialogOrSheet");
  if (signals.hasDataGridOrTable) structural.push("DataTable");
  if (signals.hasChart) structural.push("AnalyticsChart");

  if (path === "/") {
    structural.push("TopNav", "HeroOverview", "PrimaryActionCluster");
  }
  if (hasRouteSegment(path, ["dashboard", "analytics"])) {
    structural.push("KPIGrid", "FilterBar");
  }
  if (hasRouteSegment(path, ["auth", "login", "signin", "signup"])) {
    structural.push("AuthForm", "ValidationMessage");
  }
  if (hasRouteSegment(path, ["setting", "profile"])) {
    structural.push("SectionTabs", "EditableForm");
  }
  if (path.includes("[")) {
    structural.push("ContextHeader", "DetailPanels");
  }

  const components = unique([...fromFile.slice(0, 5), ...structural]).slice(0, 8);
  if (components.length) return components;
  return ["PageHeader", "PrimaryContent", "ActionControls", "FeedbackState"];
}

function routeLogicForPath(path: string, intent: IntentSpec, sourceContent?: string): string[] {
  const keywords = routeSegments(path);
  const signals = routeSignalsFromContent(sourceContent);

  const matchedRules = intent.business_rules.filter((rule) =>
    keywords.some((keyword) => keyword.length > 2 && rule.toLowerCase().includes(keyword))
  );

  const matchedFlows = intent.user_flows.filter((flow) =>
    keywords.some((keyword) => keyword.length > 2 && flow.toLowerCase().includes(keyword))
  );

  const layoutAwareLogic: string[] = [];
  if (signals.hasFloatingMenu) {
    layoutAwareLogic.push(
      "Primary create/action flow must be reachable from floating menu without disrupting current reading context."
    );
  }
  if (signals.hasCommandPalette) {
    layoutAwareLogic.push("Keyboard command flow should mirror visible navigation and action affordances.");
  }
  if (signals.hasDataGridOrTable) {
    layoutAwareLogic.push("Table/list interactions should preserve sort/filter state in URL or persisted view state.");
  }

  return safeList([...matchedFlows.slice(0, 2), ...matchedRules.slice(0, 2), ...layoutAwareLogic]).slice(0, 5);
}

function inferRouteMap(snapshot: RepoSnapshot, intent: IntentSpec): RoutePlan[] {
  const contexts = collectRouteContexts(snapshot);
  return contexts.map((route) => ({
    path: route.path,
    purpose: routePurposeForPath(route.path, intent),
    layout: routeLayoutForPath(route.path, route.sourceContent),
    components: routeComponentsForPath(route.path, route.sourceContent),
    logic: routeLogicForPath(route.path, intent, route.sourceContent)
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

function inferSwiftUIDesignSystem(snapshot: RepoSnapshot, stack: StackFingerprint): DesignSystemPlan {
  const colorSignals = detectSwiftUIColorSignals(snapshot);
  const fontSignals = detectSwiftUIFontSignals(snapshot);
  const patterns = detectSwiftUIPatternSignals(snapshot);
  const isSwiftUI = isSwiftUIStack(stack);

  const framework = isSwiftUI ? "SwiftUI" : "UIKit";

  const colorPalette = colorSignals.length
    ? [
        `Detected color references: ${colorSignals.slice(0, 4).join(", ")}.`,
        "Promote detected colors into an AppColors enum or Color extension with semantic naming (primary, accent, surface, onSurface).",
        "Define semantic color tokens for success, warning, danger, and muted text states using Color asset catalog or extension."
      ]
    : [
        "Define AppColors enum or Color extension: primary, accent, surface, onSurface, background, border.",
        "Add semantic tokens: success, warning, danger, info, textMuted, textStrong.",
        "Support dark/light mode via asset catalog color sets or environment-based Color switching."
      ];

  const typography = fontSignals.length
    ? [
        `Detected font usage: ${fontSignals.slice(0, 4).join(", ")}.`,
        "Normalize into AppTypography enum: title, headline, body, callout, caption, footnote.",
        "Keep dynamic type support; use relativeTo: parameter for custom fonts."
      ]
    : [
        "Use system font hierarchy: .largeTitle, .title, .headline, .body, .callout, .caption, .footnote.",
        "Define AppTypography extension for app-specific overrides (custom typeface, weight, tracking).",
        "Ensure Dynamic Type support; never use fixed font sizes without .dynamicTypeSize range."
      ];

  const radiusSystem = [
    "Define AppRadius constants: xs=4, sm=8, md=12, lg=16, xl=24.",
    "Use RoundedRectangle(cornerRadius:) with radius tokens; avoid raw numeric literals.",
    "Containers and cards use md/lg; buttons use sm/md; full-pill uses Capsule()."
  ];

  const pageLayoutPatterns: string[] = [];
  if (patterns.hasNavigationStack) {
    pageLayoutPatterns.push("NavigationStack as root shell with path-based navigation and typed navigation destinations.");
  }
  if (patterns.hasTabView) {
    pageLayoutPatterns.push("TabView for top-level app sections with distinct tab items and badge support.");
  }
  if (patterns.hasToolbar) {
    pageLayoutPatterns.push("Toolbar placement for navigation bar actions (.topBarTrailing, .topBarLeading, .bottomBar).");
  }
  if (!pageLayoutPatterns.length) {
    pageLayoutPatterns.push(
      isSwiftUI
        ? "NavigationStack + TabView shell pattern for primary navigation with typed destinations."
        : "UINavigationController + UITabBarController shell pattern for primary navigation."
    );
  }
  pageLayoutPatterns.push(
    "Define screen-level templates: list screen, detail screen, form screen, settings screen.",
    "Use GeometryReader sparingly; prefer adaptive layout with ViewThatFits and Layout protocol."
  );

  const styleLanguage = [
    `Distinct ${framework}-native aesthetic: platform-standard controls with refined visual hierarchy.`,
    "Use layered materials (ultraThinMaterial, regularMaterial) for depth instead of custom shadows.",
    "Drive styling from reusable ViewModifiers and shared AppStyle constants, not per-view literals."
  ];

  const components = [
    `App shell (${patterns.hasTabView ? "TabView" : "NavigationStack"} root with navigation destinations)`,
    "Button styles (PrimaryButtonStyle, SecondaryButtonStyle, DestructiveButtonStyle with loading state)",
    "Form controls (TextField styles, Picker, Toggle, validated input with @FocusState)",
    "List/detail primitives (custom row styles, section headers, swipe actions)",
    "Feedback surfaces (alert, confirmationDialog, toast overlay, empty/loading/error state views)",
    "Sheet and fullScreenCover patterns with detent configuration and dismissal behavior"
  ];

  if (patterns.hasSearchable) {
    components.push("Searchable modifier integration with suggestions and search scopes");
  }
  if (patterns.hasAsyncImage) {
    components.push("AsyncImage wrapper with placeholder, loading, and error phase handling");
  }

  const motion: string[] = [];
  if (patterns.hasAnimation) {
    motion.push("Detected animation usage; keep transitions purposeful and aligned to system spring curves.");
  }
  motion.push(
    "Use .spring() for interactive transitions and .easeInOut for content appearance.",
    "Apply matchedGeometryEffect for hero transitions between list and detail views.",
    "Honor UIAccessibility.isReduceMotionEnabled; gate decorative animations behind it."
  );

  const distinctiveTraits = [
    "Consistent corner-radius and material treatment makes the interface feel integrated.",
    "System + custom typography pairing for brand identity within platform conventions.",
    "Signature card/surface layering and status badge treatment repeated across screens."
  ];

  const statesAndFeedback = [
    "Define interactive states via ButtonStyle (pressed/disabled) and custom view modifiers",
    "Use ProgressView with .task for async loading; show skeleton placeholders for content regions",
    "Display actionable error views with retry action and error description",
    "Include haptic feedback (UIImpactFeedbackGenerator) for significant state changes"
  ];

  return {
    visualDirection: `Design system for ${framework}: platform-native ${framework} app with strong hierarchy, refined materials, and explicit state feedback.`,
    styleLanguage,
    colorPalette,
    typography,
    radiusSystem,
    pageLayoutPatterns,
    components,
    motion,
    distinctiveTraits,
    statesAndFeedback
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
    designSystem: isNativeMobileStack(stack)
      ? inferSwiftUIDesignSystem(snapshot, stack)
      : inferDesignSystem(snapshot, stack),
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

function renderRoutePlanMarkdown(routeMap: StructuredPlan["routeMap"]): string {
  return routeMap
    .map(
      (route) =>
        [
          `### \`${route.path}\``,
          `- Purpose: ${route.purpose}`,
          `- Layout: ${route.layout}`,
          `- Components: ${route.components.join(", ")}`,
          `- Functionality logic: ${route.logic.join(" | ")}`
        ].join("\n")
    )
    .join("\n\n");
}

type VisualTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
};

type RadiusScale = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
};

type UiPatternSignals = {
  hasFloatingMenu: boolean;
  hasSidebar: boolean;
  hasTopNav: boolean;
  hasGlassSurface: boolean;
  hasCommandPalette: boolean;
  hasAnimationSignals: boolean;
  prefersDark: boolean;
};

function snapshotSourceText(snapshot: RepoSnapshot): string {
  return snapshot.files.map((file) => file.content).join("\n");
}

function detectUiPatternSignals(snapshot: RepoSnapshot): UiPatternSignals {
  const text = snapshotSourceText(snapshot);
  return {
    hasFloatingMenu:
      /fixed[^"'\n]*\bbottom-\d+/i.test(text) ||
      /fixed[^"'\n]*\bright-\d+/i.test(text) ||
      /\b(floating|speed\s*dial|fab)\b/i.test(text) ||
      /\b(DropdownMenu|Popover)\b/.test(text),
    hasSidebar: /<aside\b/i.test(text) || /\b(sidebar|side-nav|drawer)\b/i.test(text) || /\bw-(64|72|80)\b/.test(text),
    hasTopNav: /\b(sticky\s+top-0|navbar|topbar)\b/i.test(text) || /<header\b/i.test(text),
    hasGlassSurface: /\bbackdrop-blur\b/.test(text) || /bg-(white|black)\/\d{1,3}/.test(text),
    hasCommandPalette: /\b(Command|SearchDialog|CommandDialog)\b/.test(text),
    hasAnimationSignals: /\banimate-|transition-|duration-\d+\b/.test(text),
    prefersDark: /\bdark:|data-theme=["']dark["']|bg-(slate|zinc|neutral|gray)-9\d{2}/.test(text)
  };
}

function normalizeHex(input: string): string | null {
  const raw = input.trim().toUpperCase();
  if (!/^#[0-9A-F]{3,8}$/.test(raw)) return null;
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  if (raw.length >= 7) return raw.slice(0, 7);
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex) ?? "#000000";
  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNeutralTone(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b) < 16;
}

function pickVisualTokens(snapshot: RepoSnapshot): VisualTokens {
  const ui = detectUiPatternSignals(snapshot);
  const detected = unique(detectDominantHexColors(snapshot).map((value) => normalizeHex(value) ?? "").filter(Boolean));
  const accents = detected.filter((hex) => !isNeutralTone(hex));
  const neutrals = detected.filter((hex) => isNeutralTone(hex));

  const darkDefaults: VisualTokens = {
    bg: "#0B0F14",
    surface: "#111827",
    surfaceAlt: "#1F2937",
    text: "#F3F4F6",
    textMuted: "#9CA3AF",
    border: "#374151",
    primary: "#3B82F6",
    primaryHover: "#2563EB",
    accent: "#14B8A6",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444"
  };

  const lightDefaults: VisualTokens = {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceAlt: "#EEF2F7",
    text: "#111827",
    textMuted: "#6B7280",
    border: "#D1D5DB",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    accent: "#0EA5E9",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626"
  };

  const fallback = ui.prefersDark ? darkDefaults : lightDefaults;
  const primary = accents[0] ?? fallback.primary;
  const accent = accents[1] ?? fallback.accent;

  const neutralByLum = [...neutrals].sort((a, b) => luminance(a) - luminance(b));
  const bg = neutralByLum[0] ?? fallback.bg;
  const surface = neutralByLum[Math.min(1, neutralByLum.length - 1)] ?? fallback.surface;
  const surfaceAlt = neutralByLum[Math.min(2, neutralByLum.length - 1)] ?? fallback.surfaceAlt;

  return {
    ...fallback,
    bg,
    surface,
    surfaceAlt,
    primary,
    accent
  };
}

function pickRadiusScale(snapshot: RepoSnapshot): RadiusScale {
  const parsed = detectRadiusSignals(snapshot)
    .map((value) => {
      const match = value.match(/(\d+(?:\.\d+)?)px/);
      return match ? Number.parseFloat(match[1]) : null;
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (parsed.length >= 4) {
    return {
      sm: Math.round(parsed[0]),
      md: Math.round(parsed[1]),
      lg: Math.round(parsed[2]),
      xl: Math.round(parsed[3])
    };
  }

  return { sm: 8, md: 12, lg: 16, xl: 24 };
}

function designCssBlueprint(tokens: VisualTokens, radii: RadiusScale, ui: UiPatternSignals): string {
  const shellLayout = ui.hasSidebar
    ? `.app-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100vh; }\n.app-sidebar { position: sticky; top: 0; height: 100vh; border-right: 1px solid var(--color-border); background: var(--color-surface); }`
    : `.app-shell { min-height: 100vh; background: var(--color-bg); }\n.app-header { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--color-border); background: var(--color-surface); }`;

  const floatingMenu = ui.hasFloatingMenu
    ? `.floating-menu { position: fixed; right: 24px; bottom: 24px; display: flex; gap: 8px; padding: 10px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18); }`
    : `.action-cluster { display: inline-flex; gap: 8px; align-items: center; }`;

  return [
    "```css",
    ":root {",
    `  --color-bg: ${tokens.bg};`,
    `  --color-surface: ${tokens.surface};`,
    `  --color-surface-alt: ${tokens.surfaceAlt};`,
    `  --color-text: ${tokens.text};`,
    `  --color-text-muted: ${tokens.textMuted};`,
    `  --color-border: ${tokens.border};`,
    `  --color-primary: ${tokens.primary};`,
    `  --color-primary-hover: ${tokens.primaryHover};`,
    `  --color-accent: ${tokens.accent};`,
    `  --color-success: ${tokens.success};`,
    `  --color-warning: ${tokens.warning};`,
    `  --color-danger: ${tokens.danger};`,
    `  --radius-sm: ${radii.sm}px;`,
    `  --radius-md: ${radii.md}px;`,
    `  --radius-lg: ${radii.lg}px;`,
    `  --radius-xl: ${radii.xl}px;`,
    "}",
    "",
    ".btn-primary {",
    "  border: 1px solid transparent;",
    "  background: var(--color-primary);",
    "  color: #ffffff;",
    "  border-radius: var(--radius-md);",
    "  padding: 10px 14px;",
    "  font-weight: 600;",
    "  transition: transform 120ms ease, background-color 120ms ease;",
    "}",
    ".btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); }",
    ".btn-secondary {",
    "  border: 1px solid var(--color-border);",
    "  background: var(--color-surface-alt);",
    "  color: var(--color-text);",
    "  border-radius: var(--radius-md);",
    "  padding: 10px 14px;",
    "}",
    ".btn-ghost {",
    "  border: 1px solid transparent;",
    "  background: transparent;",
    "  color: var(--color-text-muted);",
    "  border-radius: var(--radius-sm);",
    "  padding: 8px 12px;",
    "}",
    shellLayout,
    floatingMenu,
    ".surface-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }",
    ".input { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-alt); color: var(--color-text); }",
    "@keyframes menu-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }",
    "```"
  ].join("\n");
}

function designSwiftUIBlueprint(patterns: ReturnType<typeof detectSwiftUIPatternSignals>): string {
  const navShell = patterns.hasTabView
    ? [
        "struct AppShell: View {",
        "    var body: some View {",
        "        TabView {",
        '            HomeScreen().tabItem { Label("Home", systemImage: "house") }',
        '            SearchScreen().tabItem { Label("Search", systemImage: "magnifyingglass") }',
        '            ProfileScreen().tabItem { Label("Profile", systemImage: "person") }',
        "        }",
        "    }",
        "}"
      ]
    : [
        "struct AppShell: View {",
        "    var body: some View {",
        "        NavigationStack {",
        "            ContentView()",
        '                .navigationTitle("App")',
        "                .toolbar {",
        "                    ToolbarItem(placement: .topBarTrailing) {",
        '                        Button("Action", systemImage: "plus") { }',
        "                    }",
        "                }",
        "        }",
        "    }",
        "}"
      ];

  return [
    "```swift",
    "// MARK: - Color Tokens",
    "extension Color {",
    '    static let appPrimary = Color("Primary")       // Asset catalog',
    '    static let appAccent = Color("Accent")',
    '    static let appSurface = Color(.systemBackground)',
    "    static let appSurfaceAlt = Color(.secondarySystemBackground)",
    "    static let appText = Color(.label)",
    "    static let appTextMuted = Color(.secondaryLabel)",
    "    static let appBorder = Color(.separator)",
    '    static let appSuccess = Color("Success")',
    '    static let appWarning = Color("Warning")',
    '    static let appDanger = Color("Danger")',
    "}",
    "",
    "// MARK: - Radius Tokens",
    "enum AppRadius {",
    "    static let sm: CGFloat = 8",
    "    static let md: CGFloat = 12",
    "    static let lg: CGFloat = 16",
    "    static let xl: CGFloat = 24",
    "}",
    "",
    "// MARK: - Typography",
    "extension Font {",
    "    static let appTitle = Font.system(.title, weight: .bold)",
    "    static let appHeadline = Font.system(.headline, weight: .semibold)",
    "    static let appBody = Font.system(.body)",
    "    static let appCaption = Font.system(.caption)",
    "}",
    "",
    "// MARK: - Button Styles",
    "struct PrimaryButtonStyle: ButtonStyle {",
    "    func makeBody(configuration: Configuration) -> some View {",
    "        configuration.label",
    "            .font(.appHeadline)",
    "            .foregroundStyle(.white)",
    "            .padding(.horizontal, 16)",
    "            .padding(.vertical, 10)",
    "            .background(Color.appPrimary, in: RoundedRectangle(cornerRadius: AppRadius.md))",
    "            .scaleEffect(configuration.isPressed ? 0.97 : 1)",
    "            .animation(.spring(duration: 0.15), value: configuration.isPressed)",
    "    }",
    "}",
    "",
    "struct SurfaceCardModifier: ViewModifier {",
    "    func body(content: Content) -> some View {",
    "        content",
    "            .background(.appSurface, in: RoundedRectangle(cornerRadius: AppRadius.lg))",
    "            .overlay(RoundedRectangle(cornerRadius: AppRadius.lg).stroke(Color.appBorder, lineWidth: 0.5))",
    "    }",
    "}",
    "",
    "// MARK: - App Shell",
    ...navShell,
    "```"
  ].join("\n");
}

function renderSwiftUIDesignSystemMarkdown(designSystem: DesignSystemPlan, snapshot: RepoSnapshot): string {
  const patterns = detectSwiftUIPatternSignals(snapshot);

  const layoutContract: string[] = [];
  if (patterns.hasNavigationStack) {
    layoutContract.push("Preserve NavigationStack-based navigation; use typed NavigationPath for programmatic push/pop.");
  }
  if (patterns.hasTabView) {
    layoutContract.push("Preserve TabView as top-level section switcher; maintain badge support and state restoration.");
  }
  if (patterns.hasSheet) {
    layoutContract.push("Use .sheet and detent configuration for modal presentations; avoid custom overlay replacements.");
  }
  if (patterns.hasToolbar) {
    layoutContract.push("Keep toolbar-based action placement; use ToolbarItemGroup for related actions.");
  }
  if (patterns.hasSearchable) {
    layoutContract.push("Retain .searchable modifier integration with suggestions and token-based filtering.");
  }
  if (!layoutContract.length) {
    layoutContract.push("Use NavigationStack for primary navigation with platform-standard presentation patterns.");
  }

  return [
    `#### Visual Direction`,
    `- ${designSystem.visualDirection}`,
    "",
    "#### Color Tokens (SwiftUI-Native)",
    markdownBullets(designSystem.colorPalette),
    "",
    "#### Typography (Dynamic Type)",
    markdownBullets(designSystem.typography.slice(0, 3)),
    "",
    "#### Radius + Shape Tokens",
    markdownBullets(designSystem.radiusSystem),
    "",
    "#### Component Styling Contract",
    markdownBullets([
      "Primary buttons: PrimaryButtonStyle with filled background, spring-press feedback, and disabled opacity.",
      "Secondary buttons: bordered style with tint color and matching vertical rhythm.",
      "Cards and surfaces: SurfaceCardModifier with system background, thin border, and consistent corner radius.",
      "Form inputs: TextField styles with rounded border, @FocusState ring, and validation error display.",
      "Lists: custom row ViewModifier with consistent padding, separator style, and swipe actions."
    ]),
    "",
    "#### Layout + Navigation Contract",
    markdownBullets(layoutContract),
    "",
    "#### Motion + Interaction",
    markdownBullets([
      ...designSystem.motion.slice(0, 3),
      patterns.hasAnimation
        ? "Detected animation usage in source; keep spring curves consistent and gate behind reduceMotion."
        : "Use system spring curves for transitions; add haptic feedback for significant actions."
    ]),
    "",
    "#### SwiftUI Blueprint (Reference Implementation)",
    designSwiftUIBlueprint(patterns)
  ].join("\n");
}

function renderDesignSystemMarkdown(designSystem: DesignSystemPlan, snapshot: RepoSnapshot, stack?: StackFingerprint): string {
  // If this is a native mobile (iOS/Swift) project, render SwiftUI-native tokens instead of CSS
  if (stack && isNativeMobileStack(stack)) {
    return renderSwiftUIDesignSystemMarkdown(designSystem, snapshot);
  }

  const tokens = pickVisualTokens(snapshot);
  const radii = pickRadiusScale(snapshot);
  const ui = detectUiPatternSignals(snapshot);

  const layoutContract: string[] = [];
  if (ui.hasSidebar) {
    layoutContract.push("Preserve left navigation shell instead of replacing with full-height sidebar alternatives unless original uses it.");
  }
  if (ui.hasFloatingMenu) {
    layoutContract.push(
      "Preserve floating action/menu behavior (bottom-right fixed, elevated, quick-access) and avoid replacing it with static side navigation."
    );
  }
  if (ui.hasTopNav) {
    layoutContract.push("Keep sticky top navigation/action bar behavior to preserve browsing context during scroll.");
  }
  if (ui.hasCommandPalette) {
    layoutContract.push("Retain keyboard command palette entry points (Cmd/Ctrl+K) with matching action taxonomy.");
  }
  if (!layoutContract.length) {
    layoutContract.push("Keep top-level navigation and page actions visible without introducing heavy shell changes.");
  }

  return [
    `#### Visual Direction`,
    `- ${designSystem.visualDirection}`,
    "",
    "#### Color Tokens (Use Exact Hex)",
    markdownBullets([
      `Background: \`${tokens.bg}\``,
      `Surface: \`${tokens.surface}\` | Surface Alt: \`${tokens.surfaceAlt}\``,
      `Text: \`${tokens.text}\` | Muted Text: \`${tokens.textMuted}\``,
      `Border: \`${tokens.border}\``,
      `Primary: \`${tokens.primary}\` | Primary Hover: \`${tokens.primaryHover}\``,
      `Accent: \`${tokens.accent}\``,
      `Semantic: success \`${tokens.success}\`, warning \`${tokens.warning}\`, danger \`${tokens.danger}\``
    ]),
    "",
    "#### Typography + Radius",
    markdownBullets([
      ...designSystem.typography.slice(0, 3),
      `Radius scale: sm=${radii.sm}px, md=${radii.md}px, lg=${radii.lg}px, xl=${radii.xl}px`
    ]),
    "",
    "#### Button and Component Styling Contract",
    markdownBullets([
      "Primary buttons: filled style with strong contrast text, subtle lift on hover, and medium radius.",
      "Secondary buttons: bordered surface-alt background with same vertical rhythm as primary buttons.",
      "Ghost buttons: low-emphasis text style for tertiary actions without losing focus states.",
      "Cards and panels: thin border, medium-to-large radius, and restrained elevation to maintain dense information layout.",
      "Inputs: surface-alt background, explicit border, and predictable focus ring behavior."
    ]),
    "",
    "#### Layout + Positioning Contract",
    markdownBullets(layoutContract),
    "",
    "#### Motion + Interaction",
    markdownBullets([
      ...designSystem.motion.slice(0, 3),
      ui.hasAnimationSignals
        ? "Detected transition/animation signals in source; keep micro-motion concise and functional."
        : "Use short, purposeful transitions only where state change needs emphasis."
    ]),
    "",
    "#### CSS Blueprint (Reference Implementation)",
    designCssBlueprint(tokens, radii, ui)
  ].join("\n");
}

function inspectPriority(path: string): number {
  const lower = path.toLowerCase();
  if (lower.includes("readme")) return 12;
  if (lower.endsWith("package.json")) return 11;
  if (lower.includes("pyproject") || lower.includes("requirements.txt") || lower.includes("go.mod")) return 10;
  if (lower.includes("cargo.toml") || lower.includes("pom.xml") || lower.includes("build.gradle")) return 9;
  if (lower.includes("app/") && lower.includes("page.")) return 8;
  if (lower.includes("pages/")) return 7;
  if (lower.includes("api/") || lower.includes("route.")) return 6;
  if (lower.includes("dockerfile") || lower.includes("config")) return 5;
  return 1;
}

function inspectedArtifacts(snapshot: RepoSnapshot): string[] {
  const sorted = [...snapshot.files].sort((a, b) => inspectPriority(b.path) - inspectPriority(a.path));
  return sorted.slice(0, 10).map((file) => `\`${file.path}\` - ${file.reason}`);
}

function stackSummary(stack: StackFingerprint): string[] {
  return [
    `Frontend: ${topNames(stack.frontend).join(", ") || "Not detected"}`,
    `Backend: ${topNames(stack.backend).join(", ") || "Not detected"}`,
    `Database: ${topNames(stack.db).join(", ") || "Not detected"}`,
    `Auth: ${topNames(stack.auth).join(", ") || "Not detected"}`,
    `Infrastructure: ${topNames(stack.infra).join(", ") || "Not detected"}`,
    `Language: ${topNames(stack.language).join(", ") || "Not detected"}`
  ];
}

function implementationPromptBlock(
  structured: StructuredPlan,
  targetAgent: TargetAgent,
  snapshot: RepoSnapshot
): string {
  const routePromptLines = structured.routeMap
    .slice(0, 10)
    .map(
      (route) =>
        `- ${route.path}: ${route.layout} Components: ${route.components.slice(0, 4).join(", ")}. Logic: ${route.logic.join(" | ")}`
    )
    .join("\n");

  const criticalRules = safeList(unique([...structured.behaviorRules, ...structured.constraints]).slice(0, 10));

  return [
    "```markdown",
    `Implement ${snapshot.repo.owner}/${snapshot.repo.name} using this plan.`,
    `Target agent: ${targetAgent}.`,
    "",
    "## Priority Order",
    "1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).",
    "2. Preserve business behavior and data contracts with explicit validations.",
    "3. Apply the specified design tokens and component recipes consistently.",
    "",
    "## Objective",
    sanitizeOverview(structured.systemOverview),
    "",
    "## Route Fidelity Requirements",
    routePromptLines || "- /: define route layout and components.",
    "",
    "## Non-negotiable Rules",
    markdownBullets(criticalRules),
    "",
    "## Build Order",
    markdownNumbers(structured.buildSteps),
    "",
    "## Test Gates",
    markdownBullets(structured.testExpectations),
    "```"
  ].join("\n");
}

function renderPrompt(
  structured: StructuredPlan,
  targetAgent: TargetAgent,
  snapshot: RepoSnapshot,
  stack: StackFingerprint,
  architecture: ArchitectureModel,
  intent: IntentSpec
): string {
  const contextAssumptions = safeList(intent.assumptions).slice(0, 6);
  const contextUnknowns = safeList(intent.unknowns).slice(0, 6);
  const reviewRisks = unique([
    ...contextUnknowns.map((item) => `Unknown to validate: ${item}`),
    ...structured.nonGoals.map((item) => `Scope boundary: ${item}`)
  ]).slice(0, 8);

  const requirementLines = unique([...structured.behaviorRules, ...structured.constraints]).slice(0, 12);
  const trimmedModules = structured.moduleList.slice(0, 10);
  const trimmedLogic = structured.functionalityLogic.slice(0, 12);
  const trimmedInterfaces = structured.interfaces.slice(0, 10);
  const trimmedDataModels = structured.dataModels.slice(0, 8);
  const trimmedRoutes = structured.routeMap.slice(0, 12);
  const architectureSummary = architecture.components
    .slice(0, 8)
    .map((component) => `${component.name} (${component.role}) -> ${component.tech.slice(0, 3).join(", ")}`)
    .filter(Boolean);

  const cleanOverview = sanitizeOverview(structured.systemOverview);

  return [
    `# Plan: ${snapshot.repo.name} Implementation Blueprint`,
    "",
    "## TL;DR",
    markdownBullets([
      `Goal: ${cleanOverview}`,
      "Recommended approach: incremental implementation aligned to existing architecture boundaries and route-level layout fidelity.",
      "This plan is intentionally concise on context and verbose on implementation details, design fidelity, and UI behavior."
    ]),
    "",
    "## Phase 1: Initial Understanding",
    "### Repository Context",
    markdownBullets([
      `Repository: \`${snapshot.repo.owner}/${snapshot.repo.name}\``,
      `Branch analyzed: \`${snapshot.repo.branch}\``,
      `Scan mode: \`${snapshot.metadata.scanMode}\` | depth strategy: \`${snapshot.metadata.depthStrategy}\` | sampled files: ${snapshot.metadata.selectedFiles} | token estimate: ${snapshot.metadata.tokenEstimate}`,
      `Target agent: \`${targetAgent}\``
    ]),
    "",
    ...(snapshot.metadata.depthStrategy === "per-file"
      ? [
          "### Per-File Depth Analysis",
          markdownBullets([
            "Small repository detected: all source files included with increased per-file content budget.",
            "Analysis depth shifted from file-count breadth to line-level depth per file.",
            "Implementation plan should leverage complete source visibility for precise guidance: reference specific functions, types, and patterns observed in each file.",
            "Build steps should include line-level migration/refactor instructions where applicable."
          ]),
          ""
        ]
      : []),
    "### Key Files Inspected",
    markdownBullets(inspectedArtifacts(snapshot)),
    "",
    "### Confirmed Stack + Architecture Signals",
    markdownBullets(stackSummary(stack)),
    "",
    markdownBullets(architectureSummary),
    "",
    "## Phase 2: Design",
    "### Requirements and Constraints",
    markdownBullets(requirementLines),
    "",
    "### Route Blueprints (Layout + Interaction Fidelity)",
    renderRoutePlanMarkdown(trimmedRoutes),
    "",
    "### Module + Interface Implementation Plan",
    "#### Modules",
    markdownBullets(trimmedModules),
    "",
    "#### Functionality logic",
    markdownBullets(trimmedLogic),
    "",
    "#### Interfaces",
    markdownBullets(trimmedInterfaces),
    "",
    "### Data + Database Design",
    "#### Data Models (Priority Set)",
    markdownBullets(trimmedDataModels),
    "",
    "#### Database design",
    markdownBullets(structured.databaseDesign),
    "",
    "### Design System (Detailed, Implementable)",
    renderDesignSystemMarkdown(structured.designSystem, snapshot, stack),
    "",
    "## Phase 3: Review",
    "### Alignment Checklist",
    markdownBullets([
      "Each user-facing route has explicit purpose, layout, component plan, and functionality logic.",
      "Layout fidelity is preserved (floating menus, sticky headers, command palettes, shell pattern) from source signals.",
      "Behavior rules map to enforceable logic paths and interface contracts.",
      "Data contracts are reflected in data models and database/index/migration guidance.",
      "Design system tokens and distinctive UI traits are consistently applied across routes."
    ]),
    "",
    "### Assumptions to Confirm",
    markdownBullets(contextAssumptions),
    "",
    "### Risks and Edge Cases",
    markdownBullets(reviewRisks),
    "",
    "## Phase 4: Final Plan",
    "### Recommended Approach",
    markdownBullets([
      "Implement the plan as a single coherent approach (no parallel competing implementations).",
      "Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes."
    ]),
    "",
    "### Implementation Steps",
    markdownNumbers(structured.buildSteps),
    "",
    "### Testing",
    markdownBullets(structured.testExpectations),
    "",
    "### Rollout and Migration Notes",
    markdownBullets(
      unique(structured.databaseDesign)
        .filter((item) => !requirementLines.includes(item) && !trimmedDataModels.includes(item))
        .slice(0, 6)
    ),
    "",
    "## Implementation Prompt (LLM Ready)",
    implementationPromptBlock(structured, targetAgent, snapshot)
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
  const nativeMobile = isNativeMobileStack(stack);
  const designHints = nativeMobile
    ? inferSwiftUIDesignSystem(snapshot, stack)
    : inferDesignSystem(snapshot, stack);

  const prompt = [
    "Return valid JSON only.",
    "Task: compile an executable build plan prompt for a coding agent.",
    "Output schema:",
    schemaAsJson(structuredPlanSchema),
    "Rules:",
    "- keep build steps concrete, ordered, and directly executable",
    "- include route-level plan with page layout descriptions for each user-facing route; describe exact structure, positioning, and interaction surfaces",
    "- preserve source layout paradigms; if signals indicate floating menus, sticky top bars, or command overlays, reflect that explicitly instead of defaulting to generic sidebars",
    "- describe functionality logic and rule enforcement, not just feature names",
    "- if DB signals exist, include concrete schema/index/migration guidance",
    "- include a design system section with explicit style language, color tokens, radius scale, motion, and distinctive traits",
    nativeMobile
      ? "- this is a native iOS/Swift project: emit SwiftUI-native design tokens (Color extensions, Font system, ViewModifiers, ButtonStyles) instead of CSS custom properties or web-specific guidance"
      : "- include concrete UI token guidance with hex colors and component styling behavior (buttons, forms, cards, overlays) instead of generic advice",
    nativeMobile
      ? "- if the project uses SwiftUI, describe view composition patterns (NavigationStack, TabView, sheets, toolbars) instead of web layout (HTML/CSS/flexbox/grid)"
      : "- if the repository uses tailwind or shadcn, preserve utility-driven composition and component primitives in recommendations",
    "- structure detail so it can be rendered into a 4-phase plan workflow: initial understanding, design, review, and final implementation plan",
    "- include enough specificity for phase review: explicit constraints, assumptions, and actionable test criteria",
    "- keep context concise: avoid duplicating the same information across multiple sections",
    "- derive from architecture + intent + inferred route/design hints",
    "- avoid placeholders like 'as needed'",
    "- keep string values concise (1-2 sentences max); routeMap entries limited to 10, moduleList to 10, buildSteps to 10",
    "- total JSON output MUST be under 9000 tokens; if approaching limit, prioritize route detail and build steps over verbose descriptions",
    ...(snapshot.metadata.depthStrategy === "per-file"
      ? [
          "- DEPTH STRATEGY: per-file depth mode is active (small repo with all files sampled). Provide line-level implementation guidance: reference specific functions, types, and patterns from source. Build steps should be granular (per-function or per-type) rather than per-module."
        ]
      : []),
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
      depthStrategy: snapshot.metadata.depthStrategy,
      targetAgent
    })
  ].join("\n\n");

  const fallback = () => fallbackStructuredPlan(stack, architecture, intent, snapshot, targetAgent);
  let structured: StructuredPlan;
  try {
    structured = await callClaudeJson(prompt, structuredPlanSchema, fallback, 2, "compileExecutablePlan", 10000);
  } catch (error) {
    console.warn(`Plan compilation failed, using fallback: ${errorMessage(error)}`);
    structured = fallback();
  }

  return {
    version: MODEL_VERSION,
    targetAgent,
    structured,
    prompt: renderPrompt(structured, targetAgent, snapshot, stack, architecture, intent)
  };
}
