# Plan: Draftboard Implementation Blueprint

## TL;DR
- Goal: Draftboard is a Next.js 15 full-stack team collaboration platform with tRPC API, NextAuth credentials authentication, Prisma + PostgreSQL persistence, Cloudflare R2 storage, and Lexical rich-text editing. Users post designs and ideas to a reverse-chronological feed with projects, threaded comments, reactions, mentions, notifications, and Discord/Slack webhooks.
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

- Next.js Application (Full-stack web application serving frontend and API routes) -> Next.js 15, React 19, TypeScript
- tRPC API Layer (Type-safe API layer handling business logic and data operations) -> tRPC v11, React Query, Zod
- Authentication System (User authentication and session management) -> NextAuth.js v5, JWT, bcryptjs
- PostgreSQL Database (Primary data store for all application data) -> PostgreSQL, Prisma ORM, Prisma Client
- Cloudflare R2 Storage (Object storage for media files and attachments) -> Cloudflare R2, AWS SDK S3 Client, Presigned URLs
- Rich Text Editor (Interactive content editor with rich formatting capabilities) -> Lexical, Markdown, Custom plugins
- Notification System (Manages user notifications for comments, reactions, and mentions) -> TypeScript, Prisma, React Query
- Webhook Integrations (External notification delivery to Discord and Slack) -> Discord Webhooks, Slack Webhooks, HTTP POST

## Phase 2: Design
### Requirements and Constraints
- All routes except /signin, /signup, /invite/[token], /reset-password/[token], /deactivated require authenticated session; redirect to /signin if unauthenticated
- Deactivated users redirect to /deactivated on all protected routes; check session.user.deactivatedAt in middleware
- tRPC procedures throw UNAUTHORIZED if session invalid, FORBIDDEN if insufficient role, NOT_FOUND if resource missing or user lacks access
- File uploads: client requests presigned POST URL from tRPC, uploads directly to R2, then sends URL to server for attachment record creation
- Draft auto-save: debounce editor onChange by 30s, call draft.upsert mutation with user ID, editor JSON, attachment IDs, project IDs
- Infinite scroll: fetch next page when IntersectionObserver detects sentinel element, append to existing list, update cursor
- Notifications: mark as read on click, link to post detail with comment anchor, show unread count badge in top nav
- Comment threading: allow replies only to top-level comments (parentCommentId null), reject replies to replies (2-level max)
- Reaction deduplication: unique constraint on (userId, postId, emoji) and (userId, commentId, emoji); toggle reaction if already exists
- Mention parsing: extract @mentions from Lexical editor JSON, validate user IDs exist, create MENTION notifications excluding self
- Webhook delivery: on post publish, if discordWebhookUrl or slackWebhookUrl configured, POST JSON payload with post data; log errors, do not block post creation
- Search: debounce input by 300ms, query via tRPC, show results grouped by type (posts, projects, users), limit 20 per type

### Route Blueprints (Layout + Interaction Fidelity)
### `/`
- Purpose: Main feed displaying posts in list or grid view with infinite scroll and project filters.
- Layout: Sticky top header with view-mode toggle (list/grid) and compose button. Content area streams post cards. Floating action menu bottom-right for quick compose. Empty state when no posts.
- Components: TopNav, FeedViewToggle, PostCard, InfiniteScroll, FloatingActionMenu, EmptyState
- Functionality logic: Fetch paginated posts via tRPC with cursor-based infinite scroll | Filter by project if query param present | Exclude hideFromHome posts | Require active session | Show skeleton loaders during fetch

### `/compose`
- Purpose: Create new post with rich-text editor, attachments, mentions, and project assignment.
- Layout: Sticky top header with publish/save-draft actions. Main editor area with Lexical instance. Right sidebar for project picker, attachment upload zone, and post settings. Auto-save draft every 30s.
- Components: StickyHeader, LexicalEditor, AttachmentUploader, ProjectPicker, DraftAutoSave, PublishButton
- Functionality logic: Validate content not empty before publish | Upload attachments to R2, store URLs in draft | Parse @mentions from editor state, validate user IDs | Create post with attachments, project relations, and mention notifications | Delete draft on successful publish

### `/post/[id]`
- Purpose: Post detail with full content, attachment carousel, threaded comments, reactions, and edit/delete actions.
- Layout: Context header with post metadata (author, date, projects). Main content area with Lexical render, attachment carousel below. Comments section beneath with 2-level threading. Floating reaction bar on hover.
- Components: ContextHeader, LexicalRenderer, AttachmentCarousel, CommentThread, ReactionBar, EditDeleteMenu
- Functionality logic: Fetch post with comments, attachments, reactions via tRPC | Show edit/delete only if current user is author | Handle attachment-specific comments with coordinate metadata | Trigger COMMENT notification to post author on new comment | Trigger MENTION notifications on @mentions in comments

### `/post/[id]/edit`
- Purpose: Edit existing post content, attachments, and project assignments.
- Layout: Same as /compose but pre-populated with existing post data. Sticky header shows 'Editing post' label and update/cancel actions.
- Components: StickyHeader, LexicalEditor, AttachmentUploader, ProjectPicker, UpdateButton, CancelButton
- Functionality logic: Validate current user is post author or throw 403 | Load post data into editor state | Allow adding/removing attachments and projects | Preserve existing mention notifications, create new ones for added mentions | Update post record with new content, attachments, projects

### `/projects/[id]`
- Purpose: Project detail showing cover, description, team members, and all associated posts.
- Layout: Hero section with cover image, project name, description (Lexical render), and team member avatars. Below, filterable post feed showing only posts assigned to this project.
- Components: ProjectHero, LexicalRenderer, TeamMemberList, PostFeed, EditProjectButton
- Functionality logic: Fetch project with members and posts via tRPC | Show edit button if user is project member or admin | Filter posts by project ID | Display empty state if no posts assigned

### `/projects/new`
- Purpose: Create new project with name, description, cover image, and team member selection.
- Layout: Top action bar with create/cancel. Form with name input, Lexical editor for description, cover image uploader, and multi-select for team members.
- Components: PageHeader, FormInput, LexicalEditor, ImageUploader, TeamMemberPicker, CreateButton
- Functionality logic: Validate name is not empty | Upload cover image to R2 if provided | Create project with description JSON, cover URL, and member relations | Redirect to project detail on success

### `/notifications`
- Purpose: Notification feed showing comments, replies, mentions, and reactions with mark-as-read functionality.
- Layout: Top action bar with mark-all-read action. Grouped notification list by date. Each notification shows actor avatar, action description, and link to post/comment context.
- Components: PageHeader, MarkAllReadButton, NotificationList, NotificationItem, EmptyState
- Functionality logic: Fetch notifications via tRPC ordered by createdAt desc | Group by date (today, yesterday, older) | Mark notification as read on click | Link to post detail with comment anchor if applicable | Show unread badge count in top nav

### `/admin/users`
- Purpose: Admin user management: view users, deactivate/reactivate, promote/demote roles, generate invite links.
- Layout: Top action bar with generate-invite button. User table with columns: avatar, name, email, role, status, actions. Floating action menu for quick invite generation.
- Components: PageHeader, GenerateInviteButton, UserTable, RoleSelect, DeactivateToggle, InviteDialog, FloatingActionMenu
- Functionality logic: Require ADMIN or OWNER role via activeAdminProcedure | Fetch all users via tRPC | Allow role change for non-OWNER users | Toggle deactivatedAt timestamp to deactivate/reactivate | Generate single-use invite token tied to email

### `/admin/settings`
- Purpose: Admin site configuration: custom emoji upload, Discord/Slack webhook URLs, site-wide settings.
- Layout: Card grid with sections: Site Settings, Custom Emoji, Webhooks. Each card has form inputs and save action. Emoji section shows uploaded emoji list with delete option.
- Components: Card, CardHeader, FormInput, EmojiUploader, EmojiList, WebhookForm, SaveButton
- Functionality logic: Require ADMIN or OWNER role | Fetch site settings singleton (id: 'default') | Upload emoji images to R2, store URL and name in customEmojis JSON | Validate Discord/Slack webhook URLs are valid HTTPS | Update site settings record on save

### `/deactivated`
- Purpose: Deactivation notice page shown to deactivated users blocking access to main app.
- Layout: Centered message card with deactivation notice, support contact info, and sign-out button. No navigation header.
- Components: CenteredCard, DeactivationMessage, SignOutButton
- Functionality logic: Show only if session user has deactivatedAt timestamp | Prevent access to all other routes via middleware redirect | Allow sign-out to clear session

### Module + Interface Implementation Plan
#### Modules
- src/server/api/routers/post.ts - tRPC procedures for post CRUD, feed pagination, draft management
- src/server/api/routers/project.ts - tRPC procedures for project CRUD, member management
- src/server/api/routers/comment.ts - tRPC procedures for comment creation, threading, attachment comments
- src/server/api/routers/reaction.ts - tRPC procedures for reaction creation, deletion, listing
- src/server/api/routers/notification.ts - tRPC procedures for notification fetching, marking read
- src/server/api/routers/user.ts - tRPC procedures for user profile, role management, deactivation
- src/server/api/routers/admin.ts - tRPC procedures for admin actions: invite generation, site settings
- src/server/api/routers/search.ts - tRPC procedures for full-text search across posts, projects, users
- src/components/editor/lexical-editor.tsx - Lexical editor with plugins: mentions, slash commands, markdown shortcuts, drag-drop
- src/lib/storage.ts - R2 client wrapper for presigned URL generation, file upload, deletion

#### Functionality logic
- activeUserProcedure middleware: verify session exists and user.deactivatedAt is null, else throw UNAUTHORIZED
- activeAdminProcedure middleware: verify user role is ADMIN or OWNER, else throw FORBIDDEN
- Post creation: parse editor JSON for @mentions, create MENTION notifications excluding self, trigger Discord/Slack webhooks if enabled
- Comment creation: create COMMENT notification to post author, or COMMENT_REPLY to parent comment author, exclude self-notifications
- Reaction creation: create REACTION_POST or REACTION_COMMENT notification to content author, exclude self
- Attachment upload: generate presigned POST URL for R2, client uploads directly, server saves attachment record with URL and metadata
- Draft auto-save: debounce editor changes by 30s, call tRPC mutation to upsert draft record with editor JSON and attachment IDs
- Infinite scroll: use cursor-based pagination with post.id, fetch next page when sentinel element enters viewport
- Search: full-text query against post.title, post.content (cast to text), project.name, user.displayName with ILIKE or PostgreSQL FTS
- Invite generation: create invite token with email, expiration timestamp, single-use flag; validate email uniqueness before creating user

#### Interfaces
- tRPC router exports: postRouter, projectRouter, commentRouter, reactionRouter, notificationRouter, userRouter, adminRouter, searchRouter
- NextAuth callbacks: jwt callback to include user.id, user.role, user.deactivatedAt; session callback to expose user object
- Prisma client singleton export for server-side queries with connection pooling
- R2 storage interface: uploadFile(file, key), getPresignedUrl(key, expiresIn), deleteFile(key)
- Lexical editor props: initialState, onChange, onMentionSearch, onSlashCommand, placeholder
- Attachment metadata JSON schemas: ImageMetadata { width, height, thumbnailUrl }, FigmaMetadata { fileKey, nodeId }, LoomMetadata { videoId }
- Notification type discriminated union: CommentNotification, MentionNotification, ReactionNotification with type-specific fields
- Search result union: PostResult, ProjectResult, UserResult with shared fields (id, type, title, snippet)

### Data + Database Design
#### Data Models (Priority Set)
- User: id (cuid), email (unique), passwordHash, displayName, avatarUrl, role (MEMBER|ADMIN|OWNER), deactivatedAt (nullable), createdAt, updatedAt
- Post: id (cuid), authorId (FK User), title (nullable), content (JSON), liveUrl (nullable), hideFromHome (boolean), createdAt, updatedAt
- Project: id (cuid), name, description (JSON), coverUrl (nullable), createdAt, updatedAt
- Attachment: id (cuid), postId (FK Post), url, filename, mimeType, size, order, type (IMAGE|VIDEO|FILE|FIGMA|LOOM), metadata (JSON), width (nullable), height (nullable), thumbnailUrl (nullable), createdAt
- Comment: id (cuid), postId (FK Post), authorId (FK User), attachmentId (nullable FK Attachment), parentCommentId (nullable FK Comment), content (JSON), coordinates (nullable JSON), createdAt, updatedAt
- Reaction: id (cuid), userId (FK User), postId (nullable FK Post), commentId (nullable FK Comment), emoji, createdAt; unique constraint on (userId, postId, emoji) and (userId, commentId, emoji)
- Notification: id (cuid), type (COMMENT|COMMENT_REPLY|REACTION_POST|REACTION_COMMENT|MENTION), userId (FK User), actorId (FK User), postId (FK Post), commentId (nullable FK Comment), read (boolean), createdAt
- ProjectMember: id (cuid), projectId (FK Project), userId (FK User), createdAt; unique constraint on (projectId, userId)

#### Database design
- Add indexes: User(email), Post(authorId, createdAt), Comment(postId, authorId, parentCommentId), Notification(userId, read, createdAt), Reaction(postId), Reaction(commentId), ProjectMember(projectId, userId)
- Enable PostgreSQL full-text search extensions if using native FTS; alternatively use ILIKE on text-cast JSON fields
- Set cascade deletes: User cascade to Post, Comment, Reaction, Notification (as actor), Draft; Post cascade to Attachment, Comment, Reaction, Notification; Project cascade to ProjectMember
- Use cuid for all primary keys to avoid enumeration and ensure globally unique identifiers
- Store Lexical editor state as JSONB for efficient querying and indexing
- Store attachment metadata as JSONB with type-specific schemas validated in application layer
- Add unique constraints: User(email), Reaction(userId, postId, emoji), Reaction(userId, commentId, emoji), ProjectMember(projectId, userId), InviteToken(token), PasswordResetToken(token)
- Add check constraints: Comment.parentCommentId must reference comment with null parentCommentId (2-level threading); Reaction must have exactly one of postId or commentId not null

### Design System (Detailed, Implementable)
#### Visual Direction
- High-clarity technical workspace with strong hierarchy, restrained accents, subtle layered surfaces, and explicit state feedback. Mono + UI typography pairing for technical identity.

#### Color Tokens (Use Exact Hex)
- Background: `#0F0E0D`
- Surface: `#1A1918` | Surface Alt: `#262422`
- Text: `#F3F4F6` | Muted Text: `#9CA3AF`
- Border: `#374151`
- Primary: `#3B82F6` | Primary Hover: `#2563EB`
- Accent: `#14B8A6`
- Semantic: success `#22C55E`, warning `#F59E0B`, danger `#EF4444`

#### Typography + Radius
- Primary UI: Inter or system-ui, 14px body, 16px large body, 12px caption
- Mono: 'JetBrains Mono' or 'Fira Code', 13px for metadata/timestamps
- Heading scale: h1 32px/bold, h2 24px/semibold, h3 20px/semibold, h4 18px/medium, h5 16px/medium, h6 14px/medium
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
- Fast: 100ms for micro-interactions (hover, focus)
- Standard: 200ms for component state changes (modal open, dropdown)
- Slow: 300ms for page transitions, large surface movements
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
- PostgreSQL database is available and properly configured
- Cloudflare R2 bucket is configured with appropriate CORS settings for file uploads
- NEXTAUTH_SECRET is securely generated and kept private
- NEXTAUTH_URL matches the deployment domain
- Webhook URLs for Discord/Slack are valid and active if configured
- Users have modern browsers supporting Progressive Web App features

### Risks and Edge Cases
- Unknown to validate: Maximum file size limits for R2 uploads are not explicitly documented
- Unknown to validate: Rate limiting strategy for API endpoints is not visible
- Unknown to validate: Email delivery mechanism for password reset tokens is not implemented
- Unknown to validate: Actual webhook retry logic and error handling not detailed
- Unknown to validate: Image processing pipeline for thumbnails not fully specified
- Unknown to validate: Search indexing strategy and performance characteristics unclear
- Scope boundary: Real-time collaboration or multiplayer editing in Lexical editor
- Scope boundary: Native mobile apps beyond Progressive Web App capabilities

## Phase 4: Final Plan
### Recommended Approach
- Implement the plan as a single coherent approach (no parallel competing implementations).
- Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes.

### Implementation Steps
1. 1. Initialize Next.js 15 project with TypeScript, Tailwind, App Router; install tRPC v11, NextAuth v5, Prisma, React Query, Lexical, shadcn/ui, Radix UI, cmdk, AWS SDK S3 client
2. 2. Define Prisma schema with all models (User, Post, Project, Attachment, Comment, Reaction, Notification, ProjectMember, Draft, InviteToken, PasswordResetToken, SiteSettings), indexes, constraints, and cascade rules; run migrations
3. 3. Configure NextAuth v5 with credentials provider, Prisma adapter, JWT strategy, callbacks to include user.id, user.role, user.deactivatedAt in session
4. 4. Create tRPC context with session extraction, Prisma client injection; define activeUserProcedure and activeAdminProcedure middlewares
5. 5. Implement tRPC routers: post (CRUD, feed, draft), project (CRUD, members), comment (create, thread), reaction (create, delete), notification (fetch, markRead), user (profile, role), admin (invite, settings), search (full-text query)
6. 6. Build Lexical editor component with plugins: mention autocomplete (query users via tRPC), slash commands (insert blocks), markdown shortcuts, drag-drop file upload (presigned R2 URLs), auto-save draft every 30s
7. 7. Implement R2 storage module: uploadFile (presigned POST), getPresignedUrl (GET with expiration), deleteFile; configure CORS for direct client uploads
8. 8. Build UI components using shadcn/ui + Radix primitives: Button, Input, Card, Modal, Toast, Avatar, Badge, Skeleton, CommentThread, ReactionBar, AttachmentCarousel, ProjectPicker, NotificationList, UserTable, InviteDialog
9. 9. Implement pages: / (feed with infinite scroll), /compose (editor + attachments + projects), /post/[id] (detail + comments + reactions), /projects/[id] (detail + posts), /admin/users (user table), /admin/settings (site config), /notifications (feed), /deactivated (notice)
10. 10. Add middleware: redirect unauthenticated users to /signin, redirect deactivated users to /deactivated, inject session into tRPC context; implement search command palette (Cmd+K) with cmdk; configure Discord/Slack webhook POST on post publish; add dark mode toggle with next-themes; deploy to Vercel with environment variables for DATABASE_URL, R2 credentials, NEXTAUTH_SECRET, NEXTAUTH_URL

### Testing
- Authenticated user can create post with title, content, attachments, mentions, and project assignments; verify post record, attachment records, mention notifications created
- User can edit own post but not others; verify 403 error when attempting to edit another user's post
- Comment on post creates COMMENT notification to post author; reply to comment creates COMMENT_REPLY to parent author; verify notifications exclude self
- Reaction on post creates REACTION_POST notification; reaction on comment creates REACTION_COMMENT; verify deduplication and toggle behavior
- Draft auto-saves every 30s during editing; verify draft record updates with latest content and attachment IDs; verify draft deletion on publish
- Infinite scroll loads next page when sentinel element enters viewport; verify cursor-based pagination and append behavior
- Search returns posts, projects, users matching query; verify full-text search across post.title, post.content, project.name, user.displayName
- Admin can deactivate user; verify user redirected to /deactivated on next request and cannot access protected routes
- Admin can generate invite link; verify invite token created with email, expiration; verify user creation consumes token
- Webhook POST sent to Discord/Slack on post publish if configured; verify payload includes post data and webhook URL called; verify post creation succeeds even if webhook fails
- Attachment upload: verify presigned URL generated, client uploads to R2, attachment record created with correct URL and metadata
- Comment threading: verify replies only allowed on top-level comments; verify 2-level depth enforced via validation error on reply to reply

### Rollout and Migration Notes
- Add indexes: User(email), Post(authorId, createdAt), Comment(postId, authorId, parentCommentId), Notification(userId, read, createdAt), Reaction(postId), Reaction(commentId), ProjectMember(projectId, userId)
- Enable PostgreSQL full-text search extensions if using native FTS; alternatively use ILIKE on text-cast JSON fields
- Set cascade deletes: User cascade to Post, Comment, Reaction, Notification (as actor), Draft; Post cascade to Attachment, Comment, Reaction, Notification; Project cascade to ProjectMember
- Use cuid for all primary keys to avoid enumeration and ensure globally unique identifiers
- Store Lexical editor state as JSONB for efficient querying and indexing
- Store attachment metadata as JSONB with type-specific schemas validated in application layer

## Implementation Prompt (LLM Ready)
```markdown
Implement hrescak/Draftboard using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
Draftboard is a Next.js 15 full-stack team collaboration platform with tRPC API, NextAuth credentials authentication, Prisma + PostgreSQL persistence, Cloudflare R2 storage, and Lexical rich-text editing. Users post designs and ideas to a reverse-chronological feed with projects, threaded comments, reactions, mentions, notifications, and Discord/Slack webhooks.

## Route Fidelity Requirements
- /: Sticky top header with view-mode toggle (list/grid) and compose button. Content area streams post cards. Floating action menu bottom-right for quick compose. Empty state when no posts. Components: TopNav, FeedViewToggle, PostCard, InfiniteScroll. Logic: Fetch paginated posts via tRPC with cursor-based infinite scroll | Filter by project if query param present | Exclude hideFromHome posts | Require active session | Show skeleton loaders during fetch
- /compose: Sticky top header with publish/save-draft actions. Main editor area with Lexical instance. Right sidebar for project picker, attachment upload zone, and post settings. Auto-save draft every 30s. Components: StickyHeader, LexicalEditor, AttachmentUploader, ProjectPicker. Logic: Validate content not empty before publish | Upload attachments to R2, store URLs in draft | Parse @mentions from editor state, validate user IDs | Create post with attachments, project relations, and mention notifications | Delete draft on successful publish
- /post/[id]: Context header with post metadata (author, date, projects). Main content area with Lexical render, attachment carousel below. Comments section beneath with 2-level threading. Floating reaction bar on hover. Components: ContextHeader, LexicalRenderer, AttachmentCarousel, CommentThread. Logic: Fetch post with comments, attachments, reactions via tRPC | Show edit/delete only if current user is author | Handle attachment-specific comments with coordinate metadata | Trigger COMMENT notification to post author on new comment | Trigger MENTION notifications on @mentions in comments
- /post/[id]/edit: Same as /compose but pre-populated with existing post data. Sticky header shows 'Editing post' label and update/cancel actions. Components: StickyHeader, LexicalEditor, AttachmentUploader, ProjectPicker. Logic: Validate current user is post author or throw 403 | Load post data into editor state | Allow adding/removing attachments and projects | Preserve existing mention notifications, create new ones for added mentions | Update post record with new content, attachments, projects
- /projects/[id]: Hero section with cover image, project name, description (Lexical render), and team member avatars. Below, filterable post feed showing only posts assigned to this project. Components: ProjectHero, LexicalRenderer, TeamMemberList, PostFeed. Logic: Fetch project with members and posts via tRPC | Show edit button if user is project member or admin | Filter posts by project ID | Display empty state if no posts assigned
- /projects/new: Top action bar with create/cancel. Form with name input, Lexical editor for description, cover image uploader, and multi-select for team members. Components: PageHeader, FormInput, LexicalEditor, ImageUploader. Logic: Validate name is not empty | Upload cover image to R2 if provided | Create project with description JSON, cover URL, and member relations | Redirect to project detail on success
- /notifications: Top action bar with mark-all-read action. Grouped notification list by date. Each notification shows actor avatar, action description, and link to post/comment context. Components: PageHeader, MarkAllReadButton, NotificationList, NotificationItem. Logic: Fetch notifications via tRPC ordered by createdAt desc | Group by date (today, yesterday, older) | Mark notification as read on click | Link to post detail with comment anchor if applicable | Show unread badge count in top nav
- /admin/users: Top action bar with generate-invite button. User table with columns: avatar, name, email, role, status, actions. Floating action menu for quick invite generation. Components: PageHeader, GenerateInviteButton, UserTable, RoleSelect. Logic: Require ADMIN or OWNER role via activeAdminProcedure | Fetch all users via tRPC | Allow role change for non-OWNER users | Toggle deactivatedAt timestamp to deactivate/reactivate | Generate single-use invite token tied to email
- /admin/settings: Card grid with sections: Site Settings, Custom Emoji, Webhooks. Each card has form inputs and save action. Emoji section shows uploaded emoji list with delete option. Components: Card, CardHeader, FormInput, EmojiUploader. Logic: Require ADMIN or OWNER role | Fetch site settings singleton (id: 'default') | Upload emoji images to R2, store URL and name in customEmojis JSON | Validate Discord/Slack webhook URLs are valid HTTPS | Update site settings record on save
- /deactivated: Centered message card with deactivation notice, support contact info, and sign-out button. No navigation header. Components: CenteredCard, DeactivationMessage, SignOutButton. Logic: Show only if session user has deactivatedAt timestamp | Prevent access to all other routes via middleware redirect | Allow sign-out to clear session

## Non-negotiable Rules
- All routes except /signin, /signup, /invite/[token], /reset-password/[token], /deactivated require authenticated session; redirect to /signin if unauthenticated
- Deactivated users redirect to /deactivated on all protected routes; check session.user.deactivatedAt in middleware
- tRPC procedures throw UNAUTHORIZED if session invalid, FORBIDDEN if insufficient role, NOT_FOUND if resource missing or user lacks access
- File uploads: client requests presigned POST URL from tRPC, uploads directly to R2, then sends URL to server for attachment record creation
- Draft auto-save: debounce editor onChange by 30s, call draft.upsert mutation with user ID, editor JSON, attachment IDs, project IDs
- Infinite scroll: fetch next page when IntersectionObserver detects sentinel element, append to existing list, update cursor
- Notifications: mark as read on click, link to post detail with comment anchor, show unread count badge in top nav
- Comment threading: allow replies only to top-level comments (parentCommentId null), reject replies to replies (2-level max)
- Reaction deduplication: unique constraint on (userId, postId, emoji) and (userId, commentId, emoji); toggle reaction if already exists
- Mention parsing: extract @mentions from Lexical editor JSON, validate user IDs exist, create MENTION notifications excluding self

## Build Order
1. 1. Initialize Next.js 15 project with TypeScript, Tailwind, App Router; install tRPC v11, NextAuth v5, Prisma, React Query, Lexical, shadcn/ui, Radix UI, cmdk, AWS SDK S3 client
2. 2. Define Prisma schema with all models (User, Post, Project, Attachment, Comment, Reaction, Notification, ProjectMember, Draft, InviteToken, PasswordResetToken, SiteSettings), indexes, constraints, and cascade rules; run migrations
3. 3. Configure NextAuth v5 with credentials provider, Prisma adapter, JWT strategy, callbacks to include user.id, user.role, user.deactivatedAt in session
4. 4. Create tRPC context with session extraction, Prisma client injection; define activeUserProcedure and activeAdminProcedure middlewares
5. 5. Implement tRPC routers: post (CRUD, feed, draft), project (CRUD, members), comment (create, thread), reaction (create, delete), notification (fetch, markRead), user (profile, role), admin (invite, settings), search (full-text query)
6. 6. Build Lexical editor component with plugins: mention autocomplete (query users via tRPC), slash commands (insert blocks), markdown shortcuts, drag-drop file upload (presigned R2 URLs), auto-save draft every 30s
7. 7. Implement R2 storage module: uploadFile (presigned POST), getPresignedUrl (GET with expiration), deleteFile; configure CORS for direct client uploads
8. 8. Build UI components using shadcn/ui + Radix primitives: Button, Input, Card, Modal, Toast, Avatar, Badge, Skeleton, CommentThread, ReactionBar, AttachmentCarousel, ProjectPicker, NotificationList, UserTable, InviteDialog
9. 9. Implement pages: / (feed with infinite scroll), /compose (editor + attachments + projects), /post/[id] (detail + comments + reactions), /projects/[id] (detail + posts), /admin/users (user table), /admin/settings (site config), /notifications (feed), /deactivated (notice)
10. 10. Add middleware: redirect unauthenticated users to /signin, redirect deactivated users to /deactivated, inject session into tRPC context; implement search command palette (Cmd+K) with cmdk; configure Discord/Slack webhook POST on post publish; add dark mode toggle with next-themes; deploy to Vercel with environment variables for DATABASE_URL, R2 credentials, NEXTAUTH_SECRET, NEXTAUTH_URL

## Test Gates
- Authenticated user can create post with title, content, attachments, mentions, and project assignments; verify post record, attachment records, mention notifications created
- User can edit own post but not others; verify 403 error when attempting to edit another user's post
- Comment on post creates COMMENT notification to post author; reply to comment creates COMMENT_REPLY to parent author; verify notifications exclude self
- Reaction on post creates REACTION_POST notification; reaction on comment creates REACTION_COMMENT; verify deduplication and toggle behavior
- Draft auto-saves every 30s during editing; verify draft record updates with latest content and attachment IDs; verify draft deletion on publish
- Infinite scroll loads next page when sentinel element enters viewport; verify cursor-based pagination and append behavior
- Search returns posts, projects, users matching query; verify full-text search across post.title, post.content, project.name, user.displayName
- Admin can deactivate user; verify user redirected to /deactivated on next request and cannot access protected routes
- Admin can generate invite link; verify invite token created with email, expiration; verify user creation consumes token
- Webhook POST sent to Discord/Slack on post publish if configured; verify payload includes post data and webhook URL called; verify post creation succeeds even if webhook fails
- Attachment upload: verify presigned URL generated, client uploads to R2, attachment record created with correct URL and metadata
- Comment threading: verify replies only allowed on top-level comments; verify 2-level depth enforced via validation error on reply to reply
```