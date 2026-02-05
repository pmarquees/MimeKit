# MimicKit

MimicKit is a Next.js App Router TypeScript app that analyzes public GitHub repositories and generates:

- architecture model
- detected stack map
- behavioral intent spec
- executable build prompt (Claude Code / Codex / generic)
- stack swap rewrites without full re-analysis

## Stack

- Next.js App Router
- TypeScript
- API routes (server-side pipeline)
- Zod schema validation
- Optional Anthropic Claude API integration
- No database (in-memory run cache)

## Environment

Copy `.env.example` to `.env.local` and configure:

- `ANTHROPIC_API_KEY` for live Claude extraction/rewrite/plan compilation
- `GITHUB_TOKEN` optional, improves GitHub API rate limits (server default)
- `GITHUB_ID` + `GITHUB_SECRET` for GitHub OAuth sign-in
- `NEXTAUTH_SECRET` for secure auth sessions
- `NEXTAUTH_URL` (`http://localhost:3000` in local)

## GitHub OAuth Setup

1. Create a GitHub OAuth App.
2. Set callback URL to `http://localhost:3000/api/auth/callback/github`.
3. Put client id/secret in `.env.local` as `GITHUB_ID` and `GITHUB_SECRET`.
4. Generate a random value for `NEXTAUTH_SECRET`.
5. Restart dev server and click `Sign In with GitHub` on intake page.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## MVP Scope Notes

- Public GitHub repositories only
- No repository code execution
- Prompt/file safety filters and size limits enforced
- Stack swap rewrites intent + plan without rerunning full repo intake

## Prompts

This section documents the prompt templates currently used in production code.

Source files:

- `lib/services/claude.ts` (shared Claude system prompt + retry/fallback behavior)
- `lib/services/analysis.ts` (architecture, intent, stack-swap rewrite prompts)
- `lib/services/prompt-compiler.ts` (plan compilation prompt)

### Shared Claude System Prompt

All Claude JSON calls are sent with this system instruction:

```text
You are a strict JSON API. Return only valid JSON. Do not include markdown fences, comments, or prose.
```

### Architecture Extraction Prompt

Defined in `extractArchitecture(...)` (`lib/services/analysis.ts`):

```text
Return valid JSON only.

Task: extract architecture model for this repository summary.

Output schema:
<ARCHITECTURE_MODEL_SCHEMA_JSON>

Rules:
- components[] must include id, name, role, tech[], inputs[], outputs[]
- edges[] must use type in {request,data,event}
- no prose outside JSON

Repository summary:
<REPO_SNAPSHOT_SUMMARY>

Detected stack:
<STACK_JSON>
```

### Intent Extraction Prompt

Defined in `extractIntent(...)` (`lib/services/analysis.ts`):

```text
Return valid JSON only.

Task: extract behavioral intent spec from architecture and source summary.

Output schema:
<INTENT_SPEC_SCHEMA_JSON>

Rules:
- use concise, concrete statements
- include assumptions and unknowns
- no prose outside JSON

Architecture model:
<ARCHITECTURE_MODEL_JSON>

Repository summary:
<REPO_SNAPSHOT_SUMMARY>
```

### Stack Swap Intent Rewrite Prompt

Defined in `rewriteIntentForStackSwap(...)` (`lib/services/analysis.ts`):

```text
Return valid JSON only.

Task: rewrite intent spec after tech stack swap.

Rewrite only impacted modules/interfaces/behavior.

Output schema:
<INTENT_SPEC_SCHEMA_JSON>

Swap descriptor:
<SWAP_DESCRIPTOR_JSON>

Architecture model:
<ARCHITECTURE_MODEL_JSON>

Existing intent:
<PREVIOUS_INTENT_JSON>

Repository summary:
<REPO_SNAPSHOT_SUMMARY>
```

### Executable Plan Compilation Prompt

Defined in `compileExecutablePlan(...)` (`lib/services/prompt-compiler.ts`):

```text
Return valid JSON only.

Task: compile an executable build plan prompt for a coding agent.

Output schema:
<STRUCTURED_PLAN_SCHEMA_JSON>

Rules:
- keep build steps concrete, ordered, and directly executable
- include route-level plan with detailed page layout descriptions for each user-facing route, DO NOT forget to read, parse, understand the layout and describe in detail how the page is structured and how the components are laid out
- describe functionality logic and rule enforcement, not just feature names
- if DB signals exist, include concrete schema/index/migration guidance
- include a design system section with explicit style language, color tokens, radius scale, motion, and distinctive traits
- include concrete UI token guidance (colors, radius, typography) instead of generic advice, if the repository uses tailwind or shadcn extract the specs
- structure detail so it can be rendered into a 4-phase plan workflow: initial understanding, design, review, and final implementation plan
- include enough specificity for phase review: explicit constraints, assumptions, and actionable test criteria
- derive from architecture + intent + inferred route/design hints
- avoid placeholders like 'as needed'

Artifacts:
<PLAN_ARTIFACTS_JSON>
```

### Runtime Behavior Notes

- Each prompt is validated against a Zod schema.
- If `ANTHROPIC_API_KEY` is missing, MimicKit uses deterministic fallback generators.
- Claude JSON parsing attempts schema drift normalization (for common fields like `type`, `from`, `to`).
- Failed Claude calls retry (`RETRY_COUNT = 2`) before falling back.
