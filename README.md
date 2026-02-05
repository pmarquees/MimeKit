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
