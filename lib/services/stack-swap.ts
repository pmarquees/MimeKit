import { techRegistry } from "@/lib/data/tech-registry";
import {
  ArchitectureModel,
  IntentSpec,
  RunResult,
  StackCategory,
  StackFingerprint,
  TargetAgent
} from "@/lib/models";
import { compileExecutablePlan } from "@/lib/services/prompt-compiler";
import { rewriteIntentForStackSwap } from "@/lib/services/analysis";

function lower(input: string): string {
  return input.toLowerCase();
}

function swapStackCategory(
  stack: StackFingerprint,
  category: StackCategory,
  current: string,
  replacement: string
): StackFingerprint {
  const next = structuredClone(stack);
  const bucket = next[category];

  const idx = bucket.findIndex((item) => lower(item.name) === lower(current));
  if (idx >= 0) {
    bucket[idx] = {
      ...bucket[idx],
      name: replacement,
      confidence: Math.max(0.55, bucket[idx].confidence - 0.05),
      evidence: [...bucket[idx].evidence, `manual stack swap ${current} -> ${replacement}`]
    };
  } else {
    bucket.unshift({
      category,
      name: replacement,
      confidence: 0.58,
      evidence: [`manual stack swap inserted for ${category}`]
    });
  }

  return next;
}

function rewriteArchitectureTech(
  architecture: ArchitectureModel,
  category: StackCategory,
  current: string,
  replacement: string
): ArchitectureModel {
  const next = structuredClone(architecture);

  for (const component of next.components) {
    const role = component.role.toLowerCase();
    const touchesCategory =
      (category === "frontend" && role.includes("client")) ||
      (category === "backend" && (role.includes("api") || role.includes("application"))) ||
      (category === "db" && role.includes("persist")) ||
      (category === "auth" && role.includes("identity")) ||
      (category === "infra" && role.includes("runtime"));

    component.tech = component.tech.map((tech) =>
      lower(tech) === lower(current) || touchesCategory ? replacement : tech
    );
  }

  return next;
}

export async function applyStackSwap(
  run: RunResult,
  request: {
    category: StackCategory;
    current: string;
    replacement: string;
    targetAgent: TargetAgent;
  }
): Promise<RunResult> {
  const entry = techRegistry.entries.find(
    (item) => lower(item.key) === lower(request.current) || item.alternatives.map(lower).includes(lower(request.current))
  );

  const nextStack = swapStackCategory(run.stack, request.category, request.current, request.replacement);
  const nextArchitecture = rewriteArchitectureTech(
    run.architecture,
    request.category,
    request.current,
    request.replacement
  );

  const nextIntent: IntentSpec = await rewriteIntentForStackSwap(
    run.snapshot,
    nextArchitecture,
    run.intent,
    {
      category: request.category,
      from: request.current,
      to: request.replacement,
      hints: entry?.transformationHints ?? []
    }
  );

  const nextPlan = await compileExecutablePlan(
    nextStack,
    nextArchitecture,
    nextIntent,
    run.snapshot,
    request.targetAgent
  );

  return {
    ...run,
    stack: nextStack,
    architecture: nextArchitecture,
    intent: nextIntent,
    plan: nextPlan
  };
}
