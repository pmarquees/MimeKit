import { z } from "zod";
import {
  ArchitectureModel,
  ExecutablePlan,
  executablePlanSchema,
  IntentSpec,
  MODEL_VERSION,
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

function topNames(values: { name: string }[]): string[] {
  return values.slice(0, 3).map((item) => item.name);
}

function fallbackStructuredPlan(
  stack: StackFingerprint,
  architecture: ArchitectureModel,
  intent: IntentSpec,
  targetAgent: TargetAgent
): StructuredPlan {
  return {
    systemOverview: intent.system_purpose,
    architectureDescription: architecture.components
      .map((component) => `${component.name}: ${component.role} [${component.tech.join(", ")}]`)
      .join("\n"),
    moduleList: architecture.components.map((component) => component.name),
    interfaces: architecture.edges.map(
      (edge) => `${edge.from} -> ${edge.to} (${edge.type})`
    ),
    dataModels: intent.data_contracts,
    behaviorRules: [...intent.business_rules, ...intent.invariants],
    buildSteps: [
      "Bootstrap target repository with selected stack and strict TypeScript settings.",
      "Implement modules and interfaces from architecture model in order.",
      "Apply behavior and invariants from intent spec.",
      "Add integration points for auth, data, and external services.",
      "Write tests and run verification for core flows before finalizing output."
    ],
    testExpectations: [
      "Unit tests cover core modules and decision rules.",
      "Integration tests cover key request/data flows.",
      "Contract tests verify data schemas and error handling."
    ],
    constraints: [
      "Do not introduce out-of-scope features.",
      "Maintain compatibility with selected deployment target.",
      "Avoid changing intent unless ambiguity is explicitly resolved."
    ],
    nonGoals: [
      "No production data migration execution.",
      "No unrelated UI redesign.",
      "No custom infrastructure orchestration unless required by stack."
    ]
  };
}

function renderPrompt(structured: StructuredPlan, targetAgent: TargetAgent): string {
  const numbered = (title: string, body: string) => `${title}\n${body}\n`;
  const list = (items: string[]) => items.map((item, i) => `${i + 1}. ${item}`).join("\n");

  return [
    `Target agent: ${targetAgent}`,
    numbered("1. System overview", structured.systemOverview),
    numbered("2. Architecture description", structured.architectureDescription),
    numbered("3. Module list", list(structured.moduleList)),
    numbered("4. Interfaces", list(structured.interfaces)),
    numbered("5. Data models", list(structured.dataModels)),
    numbered("6. Behavior rules", list(structured.behaviorRules)),
    numbered("7. Build steps ordered", list(structured.buildSteps)),
    numbered("8. Test expectations", list(structured.testExpectations)),
    numbered("9. Constraints", list(structured.constraints)),
    numbered("10. Non goals", list(structured.nonGoals))
  ].join("\n");
}

export async function compileExecutablePlan(
  stack: StackFingerprint,
  architecture: ArchitectureModel,
  intent: IntentSpec,
  targetAgent: TargetAgent
): Promise<ExecutablePlan> {
  const prompt = [
    "Return valid JSON only.",
    "Task: compile an executable build plan prompt for a coding agent.",
    "Output schema:",
    schemaAsJson(structuredPlanSchema),
    "Rules:",
    "- keep build steps concrete and ordered",
    "- derive from architecture + intent",
    "- include constraints and non-goals",
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
      targetAgent
    })
  ].join("\n\n");

  const fallback = () => fallbackStructuredPlan(stack, architecture, intent, targetAgent);
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
