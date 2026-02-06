# Plan: Draftboard Implementation Blueprint

## TL;DR
- Goal: Draftboard is an internal design sharing platform for distributed teams. It provides a lightweight social feed where team members can post designs, work in progress, and ideas with rich media attachments, organize work into projects, collaborate through comments and reactions, and keep track of activity through notifications.
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

- Next.js Application (Full-stack framework serving React UI and API routes) -> Next.js 15, React 19, TypeScript
- tRPC API Layer (Type-safe API layer handling all backend operations) -> tRPC v11, React Query, Zod validation
- NextAuth Authentication (Manages user authentication and session handling) -> NextAuth v5, JWT sessions, Credentials provider
- Prisma ORM (Database abstraction and query layer) -> Prisma v6, PostgreSQL
- PostgreSQL Database (Primary data store for users, posts, projects, comments, reactions, notifications) -> PostgreSQL, Prisma Postgres
- Cloudflare R2 Storage (Object storage for file uploads (images, videos, attachments)) -> Cloudflare R2, AWS SDK S3 client, Presigned URLs
- Lexical Rich Text Editor (Rich content editor with markdown, mentions, media attachments) -> Lexical, Custom plugins, Custom nodes (Mention, Emoji, Attachment, Image)
- Webhook Notifications (External notifications to Discord/Slack for new posts) -> Discord webhooks, Slack webhooks, HTTP POST

## Phase 2: Design
### Requirements and Constraints
- Registration requires valid invite token except for first user who automatically becomes Owner
- Only one Owner role exists; Owner and Admin users can access admin panel
- Users must be authenticated to access any main application routes; unauthenticated users redirect to sign-in
- Deactivated users cannot sign in and are redirected to deactivated page
- Comments can only nest 2 levels deep: top-level comments can have replies, but replies cannot have replies
- Users can only delete their own posts and comments
- Users can only edit their own posts and user profile
- Admin and Owner roles can manage all users except Owner role cannot be changed
- Invite tokens are single-use per settings record; regenerating invalidates previous token
- Password reset tokens expire after 24 hours
- Notifications are created for comment author when post receives comment, for parent comment author on replies, for post author on reactions, and for mentioned users in post or comment content
- Notifications are marked as read when user views notification page

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
- Functionality logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | User updates profile settings including display name and avatar image via settings page | Only one Owner role exists; Owner and Admin users can access admin panel | Admin and Owner roles can manage all users except Owner role cannot be changed

### `/admin/users`
- Purpose: Administrative management and configuration.
- Layout: Include floating action/command menu fixed to bottom-right with elevated surface, quick actions, and compact trigger.
- Components: ResetLinkData, Card, CardContent, Loader2, CardHeader, FloatingActionMenu, DialogOrSheet
- Functionality logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | User signs in with email and password, landing on chronological feed of posts from all users | Only one Owner role exists; Owner and Admin users can access admin panel | Users must be authenticated to access any main application routes; unauthenticated users redirect to sign-in | Primary create/action flow must be reachable from floating menu without disrupting current reading context.

### `/compose`
- Purpose: Content creation and editing workflow.
- Layout: Use sticky top header for context, filters, and primary page actions.
- Components: PostEditorData, Date, NodeJS, HTMLDivElement, Loader2, StickyHeader
- Functionality logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes

### `/projects/[id]/edit`
- Purpose: Supports user flow: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: SerializedEditorState, ProjectUrl, Loader2, Button, Link, ContextHeader, DetailPanels
- Functionality logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Draft is automatically saved every 1.5 seconds while composing; user can resume editing drafts from navigation menu | Users can only edit their own posts and user profile | Lexical editor state is stored as JSON in database for posts, comments, and project descriptions

### `/deactivated`
- Purpose: Displays account status restriction.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: Deactivated users cannot sign in and are redirected to deactivated page

### `/invite/[token]`
- Purpose: Processes team or user invitation.
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | Admin regenerates invite token to create new invite link and invalidate previous link | Registration requires valid invite token except for first user who automatically becomes Owner | Invite tokens are single-use per settings record; regenerating invalidates previous token

### `/notifications`
- Purpose: Displays activity notifications and updates.
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: When user publishes post, system extracts @mentions from content and creates mention notifications for referenced users | Notifications are created for comment author when post receives comment, for parent comment author on replies, for post author on reactions, and for mentioned users in post or comment content | Notifications are marked as read when user views notification page

### `/post/[id]`
- Purpose: Supports user flow: User signs in with email and password, landing on chronological feed of posts from all users
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User signs in with email and password, landing on chronological feed of posts from all users | User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Users can only delete their own posts and comments | Users can only edit their own posts and user profile

### `/post/[id]/edit`
- Purpose: Supports user flow: User signs in with email and password, landing on chronological feed of posts from all users
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User signs in with email and password, landing on chronological feed of posts from all users | User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Users can only delete their own posts and comments | Users can only edit their own posts and user profile

### `/projects`
- Purpose: Supports user flow: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes
- Layout: Top action bar + content-first body with contextual controls and explicit empty/loading/error states.
- Components: PageHeader, PrimaryContent, ActionControls, FeedbackState
- Functionality logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | User uses Cmd+K or Ctrl+K to open search command palette, searches for posts/projects/users, and navigates to results

### `/projects/[id]`
- Purpose: Supports user flow: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes
- Layout: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail.
- Components: ContextHeader, DetailPanels
- Functionality logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | User uses Cmd+K or Ctrl+K to open search command palette, searches for posts/projects/users, and navigates to results

### Module + Interface Implementation Plan
#### Modules
- Next.js Application
- tRPC API Layer
- NextAuth Authentication
- Prisma ORM
- PostgreSQL Database
- Cloudflare R2 Storage
- Lexical Rich Text Editor
- Webhook Notifications
- Component Library
- Global Search

#### Functionality logic
- Feature logic: Reverse chronological feed with list and grid view modes for browsing posts
- Feature logic: Rich text editor with markdown shortcuts, @mentions, slash commands, drag-and-drop, and automatic draft saving
- Feature logic: Multi-format attachments including images, videos, files, Figma links, and Loom recordings with carousel viewer
- Feature logic: Project organization with cover images, descriptions, team members, and related URLs
- Feature logic: Threaded comments with 2-level depth and attachment-specific commenting with coordinate markers
- Feature logic: Reaction system with predefined reactions (like, wow, cool) and custom emoji support
- Feature logic: Real-time notifications for comments, replies, mentions, and reactions
- Feature logic: Full-text search across posts, projects, and users via command palette
- Feature logic: Optional webhook integrations to Discord and Slack for new post notifications
- Feature logic: Admin panel for user management, invite link generation, and site settings
- Feature logic: Light and dark theme support with warm creative aesthetic
- Feature logic: Progressive Web App with mobile optimization for iOS and Android

#### Interfaces
- nextjs_app -> trpc_api (request)
- nextjs_app -> nextauth (request)
- nextjs_app -> ui_components (request)
- nextjs_app -> lexical_editor (request)
- trpc_api -> prisma_orm (request)
- trpc_api -> cloudflare_r2 (request)
- trpc_api -> webhook_integrations (event)
- trpc_api -> nextauth (request)
- nextauth -> prisma_orm (request)
- prisma_orm -> postgresql_db (data)

### Data + Database Design
#### Data Models (Priority Set)
- User: id (cuid), email (unique), passwordHash, displayName, avatarUrl (nullable), role (MEMBER|ADMIN|OWNER), deactivated (boolean), createdAt, updatedAt
- Post: id (cuid), title (nullable), content (JSON/Lexical), liveUrl (nullable), hideFromHome (boolean), authorId, createdAt, updatedAt; relations: author (User), attachments (Attachment[]), comments (Comment[]), reactions (Reaction[]), projects (PostProject[])
- Attachment: id (cuid), postId, type (IMAGE|VIDEO|FILE|FIGMA|LOOM), url, filename, mimeType, size, width (nullable), height (nullable), thumbnailUrl (nullable), metadata (JSON), order, createdAt; relations: post (Post), comments (Comment[])
- Project: id (cuid), name, description (JSON/Lexical), coverUrl (nullable), createdAt, updatedAt, createdById; relations: posts (PostProject[]), urls (ProjectUrl[]), members (ProjectMember[])
- Comment: id (cuid), content (JSON/Lexical), authorId, postId, parentId (nullable), attachmentId (nullable), coordinates (JSON nullable), createdAt, updatedAt; relations: author (User), post (Post), parent (Comment), replies (Comment[]), attachment (Attachment)
- Reaction: id (cuid), type (like|wow|cool or custom emoji key), userId, postId (nullable), commentId (nullable), createdAt; relations: user (User), post (Post), comment (Comment)
- Notification: id (cuid), type (COMMENT|COMMENT_REPLY|REACTION_POST|REACTION_COMMENT|MENTION), userId, actorId, postId (nullable), commentId (nullable), read (boolean), createdAt; relations: user (User), actor (User), post (Post), comment (Comment)
- Draft: id (cuid), title (nullable), content (JSON/Lexical), liveUrl (nullable), firstImageUrl (nullable), preview (nullable), authorId, createdAt, updatedAt; relations: author (User)

#### Database design
- Relational design: identify core entities from contracts, normalize to stable table boundaries, and enforce foreign keys + unique constraints.
- Use migration tooling with forward-only migrations and seed data for local/dev parity.
- Map contract to stored model: User: id (cuid), email (unique), passwordHash, displayName, avatarUrl (nullable), role (MEMBER|ADMIN|OWNER), deactivated (boolean), createdAt, updatedAt
- Map contract to stored model: Post: id (cuid), title (nullable), content (JSON/Lexical), liveUrl (nullable), hideFromHome (boolean), authorId, createdAt, updatedAt; relations: author (User), attachments (Attachment[]), comments (Comment[]), reactions (Reaction[]), projects (PostProject[])
- Map contract to stored model: Attachment: id (cuid), postId, type (IMAGE|VIDEO|FILE|FIGMA|LOOM), url, filename, mimeType, size, width (nullable), height (nullable), thumbnailUrl (nullable), metadata (JSON), order, createdAt; relations: post (Post), comments (Comment[])
- Map contract to stored model: Project: id (cuid), name, description (JSON/Lexical), coverUrl (nullable), createdAt, updatedAt, createdById; relations: posts (PostProject[]), urls (ProjectUrl[]), members (ProjectMember[])

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
- Users have stable email addresses for authentication
- Cloudflare R2 is configured with CORS to allow browser uploads
- PostgreSQL database supports JSON columns for Lexical editor states
- Invite token distribution happens through secure out-of-band channels
- Network connectivity is available for R2 uploads and signed URL generation
- Users understand threaded comment depth limitation of 2 levels

### Risks and Edge Cases
- Unknown to validate: Maximum expected number of concurrent users and scaling requirements
- Unknown to validate: Target file size limits for image, video, and general file uploads
- Unknown to validate: Performance characteristics of full-text search at scale without dedicated search engine
- Unknown to validate: Rate limiting strategy for API endpoints and file uploads
- Unknown to validate: Backup and disaster recovery procedures for PostgreSQL and R2 data
- Unknown to validate: Content moderation policies and tools for inappropriate posts or comments
- Scope boundary: No production migration execution against live user data.
- Scope boundary: No major UX redesign outside defined design system scope.

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
- Map contract to stored model: User: id (cuid), email (unique), passwordHash, displayName, avatarUrl (nullable), role (MEMBER|ADMIN|OWNER), deactivated (boolean), createdAt, updatedAt
- Map contract to stored model: Post: id (cuid), title (nullable), content (JSON/Lexical), liveUrl (nullable), hideFromHome (boolean), authorId, createdAt, updatedAt; relations: author (User), attachments (Attachment[]), comments (Comment[]), reactions (Reaction[]), projects (PostProject[])
- Map contract to stored model: Attachment: id (cuid), postId, type (IMAGE|VIDEO|FILE|FIGMA|LOOM), url, filename, mimeType, size, width (nullable), height (nullable), thumbnailUrl (nullable), metadata (JSON), order, createdAt; relations: post (Post), comments (Comment[])
- Map contract to stored model: Project: id (cuid), name, description (JSON/Lexical), coverUrl (nullable), createdAt, updatedAt, createdById; relations: posts (PostProject[]), urls (ProjectUrl[]), members (ProjectMember[])

## Implementation Prompt (LLM Ready)
```markdown
Implement hrescak/Draftboard using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
Draftboard is an internal design sharing platform for distributed teams. It provides a lightweight social feed where team members can post designs, work in progress, and ideas with rich media attachments, organize work into projects, collaborate through comments and reactions, and keep track of activity through notifications.

## Route Fidelity Requirements
- /: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: TopNav, HeroOverview, PrimaryActionCluster. Logic: No explicit items detected; define during implementation with documented assumptions.
- /admin/settings: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: Loader2, Card, CardHeader, CardTitle. Logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | User updates profile settings including display name and avatar image via settings page | Only one Owner role exists; Owner and Admin users can access admin panel | Admin and Owner roles can manage all users except Owner role cannot be changed
- /admin/users: Include floating action/command menu fixed to bottom-right with elevated surface, quick actions, and compact trigger. Components: ResetLinkData, Card, CardContent, Loader2. Logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | User signs in with email and password, landing on chronological feed of posts from all users | Only one Owner role exists; Owner and Admin users can access admin panel | Users must be authenticated to access any main application routes; unauthenticated users redirect to sign-in | Primary create/action flow must be reachable from floating menu without disrupting current reading context.
- /compose: Use sticky top header for context, filters, and primary page actions. Components: PostEditorData, Date, NodeJS, HTMLDivElement. Logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes
- /projects/[id]/edit: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: SerializedEditorState, ProjectUrl, Loader2, Button. Logic: User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Draft is automatically saved every 1.5 seconds while composing; user can resume editing drafts from navigation menu | Users can only edit their own posts and user profile | Lexical editor state is stored as JSON in database for posts, comments, and project descriptions
- /deactivated: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: Deactivated users cannot sign in and are redirected to deactivated page
- /invite/[token]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: New user receives invite link from admin, creates account with email/password, and is assigned Member role; first user automatically becomes Owner | Admin regenerates invite token to create new invite link and invalidate previous link | Registration requires valid invite token except for first user who automatically becomes Owner | Invite tokens are single-use per settings record; regenerating invalidates previous token
- /notifications: Top action bar + content-first body with contextual controls and explicit empty/loading/error states. Components: PageHeader, PrimaryContent, ActionControls, FeedbackState. Logic: When user publishes post, system extracts @mentions from content and creates mention notifications for referenced users | Notifications are created for comment author when post receives comment, for parent comment author on replies, for post author on reactions, and for mentioned users in post or comment content | Notifications are marked as read when user views notification page
- /post/[id]: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: User signs in with email and password, landing on chronological feed of posts from all users | User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Users can only delete their own posts and comments | Users can only edit their own posts and user profile
- /post/[id]/edit: Detail composition: contextual hero/header, body stream, and related actions aligned in secondary rail. Components: ContextHeader, DetailPanels. Logic: User signs in with email and password, landing on chronological feed of posts from all users | User clicks compose button to create new post, enters title and rich content with Lexical editor, drags/drops or pastes media files, @mentions team members, assigns post to projects, optionally marks as hidden from home, and publishes | Users can only delete their own posts and comments | Users can only edit their own posts and user profile

## Non-negotiable Rules
- Registration requires valid invite token except for first user who automatically becomes Owner
- Only one Owner role exists; Owner and Admin users can access admin panel
- Users must be authenticated to access any main application routes; unauthenticated users redirect to sign-in
- Deactivated users cannot sign in and are redirected to deactivated page
- Comments can only nest 2 levels deep: top-level comments can have replies, but replies cannot have replies
- Users can only delete their own posts and comments
- Users can only edit their own posts and user profile
- Admin and Owner roles can manage all users except Owner role cannot be changed
- Invite tokens are single-use per settings record; regenerating invalidates previous token
- Password reset tokens expire after 24 hours

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