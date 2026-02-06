import { describe, it, expect } from "vitest";
import { analyzeRequestSchema } from "@/lib/models";

describe("API safety boundary", () => {
  it("rejects payload with repoPath field at schema level", () => {
    // The schema only allows repoUrl, branch, scanMode, githubToken
    // Any extra fields are stripped by zod, but the route handler
    // explicitly checks for local path fields before parsing
    const body = {
      repoPath: "/etc/passwd",
      scanMode: "quick"
    };
    const result = analyzeRequestSchema.safeParse(body);
    // Should fail because repoUrl is required
    expect(result.success).toBe(false);
  });

  it("accepts valid GitHub URL payload", () => {
    const body = {
      repoUrl: "https://github.com/vercel/next.js",
      scanMode: "quick"
    };
    const result = analyzeRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("rejects non-URL repoUrl", () => {
    const body = {
      repoUrl: "/local/path",
      scanMode: "quick"
    };
    const result = analyzeRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("rejects missing repoUrl", () => {
    const body = {
      scanMode: "quick"
    };
    const result = analyzeRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
  });
});
