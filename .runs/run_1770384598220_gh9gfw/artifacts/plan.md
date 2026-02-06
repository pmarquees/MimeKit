# Plan: Draftboard Implementation Blueprint

## TL;DR
- Goal: <img width="1280" height="640" alt="Draftboard logo" src="https://github.com/user-attachments/assets/b68e931a-915b-4fe3-8894-bed44a6668cb" />


# Draftboard

**Draftboard** is a shared space for teams to post designs, ideas, and work in pro
- Recommended approach: incremental implementation aligned to existing architecture boundaries and route-level layout fidelity.
- This plan is intentionally concise on context and verbose on implementation details, design fidelity, and UI behavior.

## Phase 1: Initial Understanding
### Repository Context
- Repository: `hrescak/Draftboard`
- Branch analyzed: `main`
- Scan mode: `quick` | sampled files: 14 | token estimate: 37229
- Target agent: `claude-code`

### Key Files Inspected
- `README.md` - project readme
- `package.json` - dependency manifest
- `src/app/(main)/admin/settings/page.tsx` - large source sample
- `src/server/api/routers/post.ts` - large source sample
- `tsconfig.json` - config signal
- `.env.example` - config signal
- `src/components/layout/main-nav.tsx` - large source sample
- `src/components/editor/nodes/AttachmentNode.tsx` - large source sample
- `src/components/ui/DesignTokens.stories.tsx` - large source sample
- `src/components/editor/plugins/SlashCommandPlugin.tsx` - large source sample

### Confirmed Stack + Architecture Signals
- Frontend: Next.js, React
- Backend: Not detected
- Database: Prisma
- Auth: NextAuth
- Infrastructure: Not detected
- Language: TypeScript, CSS, MDX

- Next.js (Client UI layer) -> Next.js
- Backend (Application/API layer) -> Backend
- Prisma (Persistence layer) -> Prisma
- NextAuth (Identity and access) -> NextAuth

## Phase 2: Design
### Requirements and Constraints
- Only public repositories are processed in MVP.
- Repository code is never executed.
- Large or binary files are excluded from analysis.
- Analysis runs server-side only.
- Artifacts are versioned and schema validated.
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
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: Loader2, Card, CardHeader, CardTitle, CardDescription
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/admin/users`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/compose`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/deactivated`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/invite/[token]`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/notifications`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/post/[id]`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/post/[id]/edit`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/projects`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/projects/[id]`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### `/projects/[id]/edit`
- Purpose: Supports user flow: User submits a repository URL.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: No explicit items detected; define during implementation with documented assumptions.

### Module + Interface Implementation Plan
#### Modules
- Next.js
- Backend
- Prisma
- NextAuth

#### Functionality logic
- Feature logic: Repository analysis and system decomposition
- Feature logic: Component-level interaction mapping
- Feature logic: Stack inference and confidence reporting
- Flow execution: User submits a repository URL.
- Flow execution: System samples source files and detects architecture.
- Flow execution: User reviews architecture and generates executable plan.
- Rule enforcement: Only public repositories are processed in MVP.
- Rule enforcement: Repository code is never executed.
- Rule enforcement: Large or binary files are excluded from analysis.

#### Interfaces
- frontend -> backend (request)
- backend -> database (data)
- frontend -> auth (request)
- auth -> backend (event)

### Data + Database Design
#### Data Models (Priority Set)
- Inputs include repo URL, optional branch, and scan mode.
- Pipeline outputs typed JSON artifacts for stack, architecture, and intent.

#### Database design
- Relational design: identify core entities from contracts, normalize to stable table boundaries, and enforce foreign keys + unique constraints.
- Use migration tooling with forward-only migrations and seed data for local/dev parity.
- Map contract to stored model: Inputs include repo URL, optional branch, and scan mode.
- Map contract to stored model: Pipeline outputs typed JSON artifacts for stack, architecture, and intent.

### Design System (Detailed, Implementable)
#### Visual Direction
- Design system for Next.js: high-clarity technical workspace with strong hierarchy, restrained accents, and explicit state feedback.

#### Color Tokens (Use Exact Hex)
- Background: `#F8FAFC`
- Surface: `#FFFFFF` | Surface Alt: `#EEF2F7`
- Text: `#111827` | Muted Text: `#6B7280`
- Border: `#D1D5DB`
- Primary: `#2563EB` | Primary Hover: `#1D4ED8`
- Accent: `#0EA5E9`
- Semantic: success `#16A34A`, warning `#D97706`, danger `#DC2626`

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
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-alt: #EEF2F7;
  --color-text: #111827;
  --color-text-muted: #6B7280;
  --color-border: #D1D5DB;
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-accent: #0EA5E9;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
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
- Sampled files represent most system behavior.
- Primary dependency manifests are present in repo root.

### Risks and Edge Cases
- Unknown to validate: Undocumented runtime jobs/background workers.
- Unknown to validate: Unseen integrations outside sampled files.
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
- Map contract to stored model: Inputs include repo URL, optional branch, and scan mode.
- Map contract to stored model: Pipeline outputs typed JSON artifacts for stack, architecture, and intent.
- Target agent is claude-code; output should be directly executable by that agent.
- Do not introduce out-of-scope features or unsupported infrastructure assumptions.
- Maintain compatibility with detected stack unless explicitly swapped.
- Prefer deterministic implementation details over vague placeholders.

## Implementation Prompt (LLM Ready)
```markdown
Implement hrescak/Draftboard using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
<img width="1280" height="640" alt="Draftboard logo" src="https://github.com/user-attachments/assets/b68e931a-915b-4fe3-8894-bed44a6668cb" />


# Draftboard

**Draftboard** is a shared space for teams to post designs, ideas, and work in pro

## Route Fidelity Requirements
- /: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: TopNav, HeroOverview, PrimaryActionCluster. Logic: No explicit items detected; define during implementation with documented assumptions.
- /admin/settings: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: Loader2, Card, CardHeader, CardTitle. Logic: No explicit items detected; define during implementation with documented assumptions.
- /admin/users: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.
- /compose: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.
- /deactivated: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.
- /invite/[token]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: No explicit items detected; define during implementation with documented assumptions.
- /notifications: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.
- /post/[id]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: No explicit items detected; define during implementation with documented assumptions.
- /post/[id]/edit: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: No explicit items detected; define during implementation with documented assumptions.
- /projects: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: No explicit items detected; define during implementation with documented assumptions.

## Non-negotiable Rules
- Only public repositories are processed in MVP.
- Repository code is never executed.
- Large or binary files are excluded from analysis.
- Analysis runs server-side only.
- Artifacts are versioned and schema validated.
- Target agent is claude-code; output should be directly executable by that agent.
- Do not introduce out-of-scope features or unsupported infrastructure assumptions.
- Maintain compatibility with detected stack unless explicitly swapped.
- Prefer deterministic implementation details over vague placeholders.

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