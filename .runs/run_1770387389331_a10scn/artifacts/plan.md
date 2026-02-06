# Plan: Draftboard Implementation Blueprint

## TL;DR
- Goal: # Draftboard
**Draftboard** is a shared space for teams to post designs, ideas, and work in progress. In distributed teams, meaningful work too often disappears into Slack threads or gets buried inside Figma, making it harder to learn from each other and keep ideas flowing. Draftboard brings that work back into the open with a lightweight, social feed that’s easy to deploy, pleasant to use, and flexible enough to fit into existing workflows.
- Recommended approach: incremental implementation aligned to existing architecture boundaries and route-level layout fidelity.
- This plan is intentionally concise on context and verbose on implementation details, design fidelity, and UI behavior.

## Phase 1: Initial Understanding
### Repository Context
- Repository: `hrescak/Draftboard`
- Branch analyzed: `main`
- Scan mode: `deep` | sampled files: 38 | token estimate: 82273
- Target agent: `claude-code`

### Key Files Inspected
- `README.md` - project readme
- `package.json` - dependency manifest
- `src/app/(main)/admin/settings/page.tsx` - large source sample
- `src/app/(main)/projects/[id]/edit/page.tsx` - large source sample
- `src/app/(main)/admin/users/page.tsx` - large source sample
- `src/app/(main)/compose/page.tsx` - large source sample
- `src/server/api/routers/post.ts` - large source sample
- `src/server/api/routers/user.ts` - large source sample
- `src/server/api/routers/comment.ts` - large source sample
- `tsconfig.json` - config signal

### Confirmed Stack + Architecture Signals
- Frontend: Next.js, React
- Backend: Not detected
- Database: Prisma
- Auth: NextAuth
- Infrastructure: Not detected
- Language: TypeScript, CSS, MDX

- Next.js Application (Frontend framework and SSR runtime) -> Next.js 15, React 19, TypeScript
- tRPC API Layer (Type-safe API layer between client and server) -> tRPC v11, React Query, Zod validation
- Authentication Layer (User authentication and session management) -> NextAuth.js v5, JWT, Credentials provider
- PostgreSQL Database (Primary data store) -> PostgreSQL, Prisma ORM, Prisma Client
- Rich Text Editor (Content editing and composition) -> Lexical, Markdown, Custom plugins
- Cloudflare R2 Storage (File and media storage) -> Cloudflare R2, AWS SDK S3, Presigned URLs
- UI Component Library (Shared user interface components) -> shadcn/ui, Radix UI, Tailwind CSS v4
- Post Management Router (Handles post CRUD operations and feed queries) -> tRPC, Prisma, Zod schemas

## Phase 2: Design
### Requirements and Constraints
- Authentication required for protected routes.
- Session secrets must be configured for production.
- External storage service required for file uploads.
- Database connection must be configured.
- User input validated before persistence.
- Application state managed server-side with typed API boundaries.
- Schema migrations applied before deployment.
- Target agent is claude-code; output should be directly executable by that agent.
- Do not introduce out-of-scope features or unsupported infrastructure assumptions.
- Maintain compatibility with detected stack unless explicitly swapped.
- Prefer deterministic implementation details over vague placeholders.

### Route Blueprints (Layout + Interaction Fidelity)
### `/`
- Purpose: Entry point for navigation and primary workflow kickoff.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: TopNav, HeroOverview, PrimaryActionCluster
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/admin/settings`
- Purpose: User or application settings management.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: Loader2, Card, CardHeader, CardTitle, CardDescription
- Functionality logic: User manages account settings. | Admin manages site configuration and users.

### `/admin/users`
- Purpose: Administrative management and configuration.
- Layout: Include floating action/command menu fixed to bottom-right with elevated surface, quick actions, and compact trigger.
- Components: ResetLinkData, Card, CardContent, Loader2, CardHeader, FloatingActionMenu, DialogOrSheet
- Functionality logic: Admin manages site configuration and users. | Primary create/action flow must be reachable from floating menu without disrupting current reading context.

### `/compose`
- Purpose: Content creation and editing workflow.
- Layout: Use sticky top header for context, filters, and primary page actions.
- Components: PostEditorData, Date, NodeJS, HTMLDivElement, Loader2, StickyHeader
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/projects/[id]/edit`
- Purpose: Supports user flow: User edits existing content.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: SerializedEditorState, ProjectUrl, Loader2, Button, Link, ContextHeader, DetailPanels
- Functionality logic: User edits existing content. | User browses and manages projects.

### `/deactivated`
- Purpose: Displays account status restriction.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/invite/[token]`
- Purpose: Processes team or user invitation.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/notifications`
- Purpose: Displays activity notifications and updates.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: User views activity notifications.

### `/post/[id]`
- Purpose: Supports user flow: User views and interacts with posts.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User views and interacts with posts.

### `/post/[id]/edit`
- Purpose: Supports user flow: User views and interacts with posts.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User views and interacts with posts. | User edits existing content.

### `/projects`
- Purpose: Supports user flow: User browses and manages projects.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: User browses and manages projects.

### `/projects/[id]`
- Purpose: Supports user flow: User browses and manages projects.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User browses and manages projects.

### Module + Interface Implementation Plan
#### Modules
- Next.js Application
- tRPC API Layer
- Authentication Layer
- PostgreSQL Database
- Rich Text Editor
- Cloudflare R2 Storage
- UI Component Library
- Post Management Router
- Comment Management Router
- Project Management Router

#### Functionality logic
- Feature logic: Feed
- Feature logic: Rich Editor
- Feature logic: Attachments
- Feature logic: Projects
- Feature logic: Comments
- Feature logic: Reactions
- Feature logic: Notifications
- Feature logic: Search
- Feature logic: Webhooks
- Feature logic: Admin
- Feature logic: Dark Mode
- Feature logic: Mobile PWA

#### Interfaces
- nextjs_app -> trpc_api (request)
- nextjs_app -> auth_layer (request)
- nextjs_app -> ui_components (data)
- nextjs_app -> lexical_editor (data)
- trpc_api -> post_router (request)
- trpc_api -> comment_router (request)
- trpc_api -> project_router (request)
- trpc_api -> user_router (request)
- trpc_api -> draft_system (request)
- trpc_api -> search_system (request)

### Data + Database Design
#### Data Models (Priority Set)
- Data models defined in Prisma schema with typed client generation.
- API contracts enforced via tRPC procedures with Zod validation.
- Cloudflare R2 Storage manages persistent state via Cloudflare R2, AWS SDK S3.

#### Database design
- Relational design: identify core entities from contracts, normalize to stable table boundaries, and enforce foreign keys + unique constraints.
- Use migration tooling with forward-only migrations and seed data for local/dev parity.
- Map contract to stored model: Data models defined in Prisma schema with typed client generation.
- Map contract to stored model: API contracts enforced via tRPC procedures with Zod validation.
- Map contract to stored model: Cloudflare R2 Storage manages persistent state via Cloudflare R2, AWS SDK S3.

### Design System (Detailed, Implementable)
#### Visual Direction
- Design system for Next.js: high-clarity technical workspace with strong hierarchy, restrained accents, and explicit state feedback.

#### Color Tokens (Use Exact Hex)
- Background: `#0F0E0D`
- Surface: `#1A1918` | Surface Alt: `#262422`
- Text: `#F3F4F6` | Muted Text: `#9CA3AF`
- Border: `#374151`
- Primary: `#3B82F6` | Primary Hover: `#2563EB`
- Accent: `#14B8A6`
- Semantic: success `#22C55E`, warning `#F59E0B`, danger `#EF4444`

#### Typography + Radius
- Define primary UI font token for body/labels and secondary mono token for technical metadata.
- Define heading scale tokens (h1-h6) with explicit size/line-height/weight.
- Define caption/label/helper text tokens to keep hierarchy consistent.
- Radius scale: sm=8px, md=12px, lg=16px, xl=24px

#### Button and Component Styling Contract
- Primary buttons: filled style with strong contrast text, subtle lift on hover, and medium radius.
- Secondary buttons: bordered surface-alt background with same vertical rhythm as primary buttons.
- Ghost buttons: low-emphasis text style for tertiary actions without losing focus states.
- Cards and panels: thin border, medium-to-large radius, and restrained elevation to maintain dense information layout.
- Inputs: surface-alt background, explicit border, and predictable focus ring behavior.

#### Layout + Positioning Contract
- Preserve left navigation shell instead of replacing with full-height sidebar alternatives unless original uses it.
- Preserve floating action/menu behavior (bottom-right fixed, elevated, quick-access) and avoid replacing it with static side navigation.
- Keep sticky top navigation/action bar behavior to preserve browsing context during scroll.
- Retain keyboard command palette entry points (Cmd/Ctrl+K) with matching action taxonomy.

#### Motion + Interaction
- Define motion tokens (fast/standard/slow) and apply consistently across hover, modal, and sheet interactions.
- Use spring-like easing for major surfaces and short eased fades for micro feedback.
- Honor reduced-motion preference and keep transitions informative, not ornamental.
- Detected transition/animation signals in source; keep micro-motion concise and functional.

#### CSS Blueprint (Reference Implementation)
```css
:root {
  --color-bg: #0F0E0D;
  --color-surface: #1A1918;
  --color-surface-alt: #262422;
  --color-text: #F3F4F6;
  --color-text-muted: #9CA3AF;
  --color-border: #374151;
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-accent: #14B8A6;
  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
}

.btn-primary {
  border: 1px solid transparent;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-weight: 600;
  transition: transform 120ms ease, background-color 120ms ease;
}
.btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); }
.btn-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}
.btn-ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
.app-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100vh; }
.app-sidebar { position: sticky; top: 0; height: 100vh; border-right: 1px solid var(--color-border); background: var(--color-surface); }
.floating-menu { position: fixed; right: 24px; bottom: 24px; display: flex; gap: 8px; padding: 10px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18); }
.surface-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.input { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-alt); color: var(--color-text); }
@keyframes menu-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
```

## Phase 3: Review
### Alignment Checklist
- Each user-facing route has explicit purpose, layout, component plan, and functionality logic.
- Layout fidelity is preserved (floating menus, sticky headers, command palettes, shell pattern) from source signals.
- Behavior rules map to enforceable logic paths and interface contracts.
- Data contracts are reflected in data models and database/index/migration guidance.
- Design system tokens and distinctive UI traits are consistently applied across routes.

### Assumptions to Confirm
- Sampled files represent primary system behavior.
- Dependency manifests are present in repo root.

### Risks and Edge Cases
- Unknown to validate: Background jobs or scheduled tasks not visible in sampled files.
- Unknown to validate: Third-party integrations outside sampled scope.
- Scope boundary: No production migration execution against live user data.
- Scope boundary: No major UX redesign outside defined design system scope.
- Scope boundary: No hidden background jobs/services without explicit architecture updates.

## Phase 4: Final Plan
### Recommended Approach
- Implement the plan as a single coherent approach (no parallel competing implementations).
- Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes.

### Implementation Steps
1. Scaffold target repo and baseline tooling (lint/typecheck/test) before feature work.
2. Implement route-level layouts and navigation shell according to route map.
3. Build modules and interfaces in architecture dependency order.
4. Implement functionality logic and rule enforcement with explicit service boundaries.
5. Apply data models + database design, including migrations/schema/index definitions when applicable.
6. Implement design system tokens/components and align all pages to shared patterns.
7. Add tests for routes, services, contracts, and critical edge-case behaviors.
8. Run validation (typecheck/lint/tests) and fix regressions before completion.

### Testing
- Unit tests cover route handlers, core business logic, and validation paths.
- Integration tests cover critical user flows and module interactions.
- Contract tests verify API/data model compatibility and error envelopes.
- UI tests validate key layouts, navigation, and state-feedback behavior.

### Rollout and Migration Notes
- Relational design: identify core entities from contracts, normalize to stable table boundaries, and enforce foreign keys + unique constraints.
- Use migration tooling with forward-only migrations and seed data for local/dev parity.
- Map contract to stored model: Data models defined in Prisma schema with typed client generation.
- Map contract to stored model: API contracts enforced via tRPC procedures with Zod validation.
- Map contract to stored model: Cloudflare R2 Storage manages persistent state via Cloudflare R2, AWS SDK S3.

## Implementation Prompt (LLM Ready)
```markdown
Implement hrescak/Draftboard using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
# Draftboard
**Draftboard** is a shared space for teams to post designs, ideas, and work in progress. In distributed teams, meaningful work too often disappears into Slack threads or gets buried inside Figma, making it harder to learn from each other and keep ideas flowing. Draftboard brings that work back into the open with a lightweight, social feed that’s easy to deploy, pleasant to use, and flexible enough to fit into existing workflows.

## Route Fidelity Requirements
- /: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: TopNav, HeroOverview, PrimaryActionCluster. Logic: No explicit items detected; define during implementation with documented assumptions.
- /admin/settings: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: Loader2, Card, CardHeader, CardTitle. Logic: User manages account settings. | Admin manages site configuration and users.
- /admin/users: Include floating action/command menu fixed to bottom-right with elevated surface, quick actions, and compact trigger. Components: ResetLinkData, Card, CardContent, Loader2. Logic: Admin manages site configuration and users. | Primary create/action flow must be reachable from floating menu without disrupting current reading context.
- /compose: Use sticky top header for context, filters, and primary page actions. Components: PostEditorData, Date, NodeJS, HTMLDivElement. Logic: No explicit items detected; define during implementation with documented assumptions.
- /projects/[id]/edit: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: SerializedEditorState, ProjectUrl, Loader2, Button. Logic: User edits existing content. | User browses and manages projects.
- /deactivated: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.
- /invite/[token]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: No explicit items detected; define during implementation with documented assumptions.
- /notifications: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: User views activity notifications.
- /post/[id]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: User views and interacts with posts.
- /post/[id]/edit: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: User views and interacts with posts. | User edits existing content.

## Non-negotiable Rules
- Authentication required for protected routes.
- Session secrets must be configured for production.
- External storage service required for file uploads.
- Database connection must be configured.
- User input validated before persistence.
- Application state managed server-side with typed API boundaries.
- Schema migrations applied before deployment.
- Target agent is claude-code; output should be directly executable by that agent.
- Do not introduce out-of-scope features or unsupported infrastructure assumptions.
- Maintain compatibility with detected stack unless explicitly swapped.

## Build Order
1. Scaffold target repo and baseline tooling (lint/typecheck/test) before feature work.
2. Implement route-level layouts and navigation shell according to route map.
3. Build modules and interfaces in architecture dependency order.
4. Implement functionality logic and rule enforcement with explicit service boundaries.
5. Apply data models + database design, including migrations/schema/index definitions when applicable.
6. Implement design system tokens/components and align all pages to shared patterns.
7. Add tests for routes, services, contracts, and critical edge-case behaviors.
8. Run validation (typecheck/lint/tests) and fix regressions before completion.

## Test Gates
- Unit tests cover route handlers, core business logic, and validation paths.
- Integration tests cover critical user flows and module interactions.
- Contract tests verify API/data model compatibility and error envelopes.
- UI tests validate key layouts, navigation, and state-feedback behavior.
```