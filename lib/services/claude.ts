import { z, ZodTypeAny } from "zod";
import { ANTHROPIC_API_BASE, ANTHROPIC_KEY, ANTHROPIC_MODEL } from "@/lib/services/config";

const RETRY_COUNT = 2;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function extractJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function normalizeCommonSchemaDrift(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCommonSchemaDrift(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeCommonSchemaDrift(raw);
      if ((key === "type" || key === "from" || key === "to") && Array.isArray(normalized)) {
        output[key] = normalized[0];
      } else {
        output[key] = normalized;
      }
    }
    return output;
  }

  return value;
}

function parseAndValidate<TSchema extends z.ZodTypeAny>(
  candidate: string,
  schema: TSchema
): z.output<TSchema> {
  const parsed = JSON.parse(candidate);
  const firstAttempt = schema.safeParse(parsed);
  if (firstAttempt.success) {
    return firstAttempt.data;
  }

  const normalized = normalizeCommonSchemaDrift(parsed);
  return schema.parse(normalized);
}

async function callAnthropic(prompt: string): Promise<string> {
  if (!ANTHROPIC_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system:
        "You are a strict JSON API. Return only valid JSON. Do not include markdown fences, comments, or prose.",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = data.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic response did not contain text content.");
  }

  return text;
}

export async function callClaudeJson<TSchema extends z.ZodTypeAny>(
  prompt: string,
  schema: TSchema,
  fallback: () => z.output<TSchema>,
  retries = RETRY_COUNT
): Promise<z.output<TSchema>> {
  const safeFallback = (): z.output<TSchema> => {
    const value = fallback();
    return schema.parse(value);
  };

  if (!ANTHROPIC_KEY) {
    return safeFallback();
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const raw = await callAnthropic(prompt);
      const candidate = extractJsonCandidate(raw);
      return parseAndValidate(candidate, schema);
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(`Claude JSON call failed, using fallback: ${errorMessage(lastError)}`);
  return safeFallback();
}

export function schemaAsJson(schema: ZodTypeAny): string {
  return JSON.stringify(zodToShape(schema), null, 2);
}

function zodToShape(schema: ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      output[key] = zodToShape(value as ZodTypeAny);
    }
    return output;
  }

  if (schema instanceof z.ZodArray) {
    return [zodToShape(schema.element as ZodTypeAny)];
  }

  if (schema instanceof z.ZodEnum) {
    return schema.options;
  }

  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodRecord) {
    return { "<key>": zodToShape(schema._def.valueType as ZodTypeAny) };
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToShape(schema.unwrap() as ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToShape(schema.removeDefault() as ZodTypeAny);
  }

  return "unknown";
}
