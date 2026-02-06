# Plan: Draftboard Implementation Blueprint

## TL;DR
- Goal: Draftboard is an internal design sharing platform built on Next.js with Prisma and NextAuth. It provides a social feed for distributed teams to post designs, ideas, and work-in-progress with rich media attachments, threaded comments, reactions, and notifications. The system uses Cloudflare R2 for file storage, supports role-based access control (OWNER/ADMIN/MEMBER), and includes admin tools for user management, site configuration, and webhook integrations.
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

- Next.js (Client UI layer) -> Next.js
- Backend (Application/API layer) -> Backend
- Prisma (Persistence layer) -> Prisma
- NextAuth (Identity and access) -> NextAuth

## Phase 2: Design
### Requirements and Constraints
- First user self-registers and becomes OWNER, all subsequent registrations require valid invite token and create MEMBER role
- Admin routes (/admin/*) require role ADMIN or OWNER, redirect to / if unauthorized
- Deactivated users redirected to /deactivated on any protected route access
- Users cannot deactivate themselves, only admins can deactivate other users
- At least one OWNER or ADMIN must exist in system at all times (prevent demoting last OWNER)
- Post edit and delete actions only visible to post author
- Comment edit and delete actions only visible to comment author
- Project edit action only visible to project creator and members
- Comment threading limited to 2 levels: can reply to top-level comment but not to reply
- Notifications not sent if actor is the target entity author (e.g., user cannot notify themselves by commenting on own post)
- Mention notifications excluded if user already receiving comment/reply notification for same action
- Password reset tokens expire after 24 hours, become invalid after use

### Route Blueprints (Layout + Interaction Fidelity)
### `/`
- Purpose: Home feed displaying reverse chronological posts with optional grid/list view toggle and project filter
- Layout: Sticky top header with view mode toggle (list/grid), search trigger (Cmd+K), notification bell, profile menu, and 'New Post' action. Main content region with infinite scroll feed. Empty state shown when no posts exist. Loading skeleton during fetch. No sidebar.
- Components: StickyHeader with action cluster, FeedViewToggle (list/grid), PostCard or PostGridItem, InfiniteScrollTrigger, LoadingSkeleton, EmptyFeedState
- Functionality logic: Fetch posts ordered by createdAt DESC with cursor pagination | Filter by project if query param present | Exclude hideFromHome=true posts unless viewing project context | Show author avatar, displayName, post title, content preview, attachments, reaction counts | Click post to navigate to /post/[id] | Infinite scroll loads next page when trigger enters viewport

### `/compose`
- Purpose: Rich text editor for creating new posts with attachments and project assignment
- Layout: Sticky top header with 'Cancel' and 'Publish' actions, save status indicator. Full-width editor canvas with Lexical rich text, attachment upload zone below editor, project multi-select, 'Hide from home feed' checkbox. No sidebar. Bottom padding for comfortable editing.
- Components: StickyHeader with save status, LexicalEditor with markdown shortcuts, @mentions, slash commands, AttachmentUploadZone with drag-and-drop, AttachmentCarousel for uploaded files, ProjectMultiSelect, HideFromHomeFeedCheckbox, AutosaveDraftIndicator
- Functionality logic: Initialize Lexical editor with empty state or draft if exists | Auto-save draft to database every 2 seconds on content change | Extract @mentions from Lexical JSON and validate against users | Upload attachments to R2 via presigned URLs, store metadata in DB with order field | On publish: create Post record, create Attachment records, create PostProject junction records, trigger webhook notifications, send mention notifications | Validate title and content not empty before publish | Clear draft after successful publish

### `/post/[id]`
- Purpose: Full post detail view with attachments, threaded comments, and reactions
- Layout: Contextual header with post metadata (author avatar, displayName, createdAt, project badges) and actions (Edit if author, Delete if author). Primary content region with full Lexical-rendered content. Attachment carousel below content with coordinate-based comment indicators. Comment thread list with 2-level nesting. Reaction bar at bottom of post with built-in + custom emoji picker. Secondary rail on desktop showing project details and related posts.
- Components: ContextHeader with author info and actions, LexicalRenderer for post content, AttachmentCarousel with coordinate comment markers, ReactionBar with emoji picker, CommentThread with reply nesting, CommentComposer with Lexical editor, SecondaryRail with project context
- Functionality logic: Fetch post with author, attachments ordered by order field, projects, comments with nested replies (max 2 levels), reactions grouped by emoji | Render Lexical JSON into HTML preserving mentions, formatting, embeds | Show Edit/Delete actions only if current user is post author | For attachments: display based on type (IMAGE: img tag, VIDEO: video player, FILE: download link, FIGMA: embed iframe, LOOM: embed iframe) | Click attachment to open fullscreen viewer with coordinate comment overlay | Add reaction: upsert Reaction record, show optimistic UI, create REACTION_POST notification for post author | Add comment: create Comment record, send COMMENT notification to post author and mentioned users, send webhook if top-level | Reply to comment: create Comment with parentId, send COMMENT_REPLY notification to parent author and mentioned users | Exclude notifications if user is author of target entity | Mark related notifications as read when viewing post

### `/post/[id]/edit`
- Purpose: Edit existing post with same editor capabilities as compose
- Layout: Identical to /compose layout but pre-populated with existing post data
- Components: StickyHeader with save status and 'Cancel'/'Save' actions, LexicalEditor initialized with existing content JSON, AttachmentUploadZone with existing attachments, ProjectMultiSelect with current selections, HideFromHomeFeedCheckbox with current value
- Functionality logic: Fetch post with attachments and projects, verify current user is author, redirect if not | Initialize Lexical editor with post.content JSON | Display existing attachments with delete option | Allow adding new attachments, maintain order field sequence | On save: update Post record, upsert PostProject junctions, update/delete Attachment records | Extract new @mentions and send notifications | Do not trigger webhook on edit | Navigate back to /post/[id] after save

### `/projects`
- Purpose: Grid view of all projects with cover images and metadata
- Layout: Sticky top header with 'New Project' action. Grid of project cards (3-4 columns on desktop, 1-2 on mobile). Each card shows cover image, project name, description preview, member avatars, post count. Empty state if no projects exist.
- Components: StickyHeader with 'New Project' button, ProjectGrid, ProjectCard with cover, name, description, members, post count, EmptyProjectsState
- Functionality logic: Fetch all projects with member count, post count, cover URL | Click project card to navigate to /projects/[id] | Only show 'New Project' action to authenticated users

### `/projects/new`
- Purpose: Create new project with name, description, cover image, team members, and URLs
- Layout: Centered form card (max-width 600px) with fields stacked vertically. Header with 'Cancel' and 'Create' actions. Cover image upload at top, name input, Lexical description editor, team member multi-select, URL list with add/remove.
- Components: FormCard with header actions, CoverImageUpload with drag-and-drop, NameInput (required), LexicalEditor for description, TeamMemberMultiSelect, URLListEditor with add/remove rows
- Functionality logic: Upload cover image to R2, get presigned URL | Validate name is not empty | On create: insert Project record with createdById, create ProjectMember records for selected users with role='MEMBER', create ProjectUrl records for each URL | Navigate to /projects/[id] after creation

### `/projects/[id]`
- Purpose: Project detail page with posts feed, description, members, and URLs
- Layout: Hero header with cover image, project name, description, edit action (if creator or member). Tab navigation for 'Posts', 'Members', 'URLs'. Posts tab shows filtered feed (same as home but filtered to this project). Members tab shows avatar list with role badges. URLs tab shows clickable link list. Secondary rail on desktop with quick stats.
- Components: ProjectHero with cover, name, description, edit button, TabNavigation, PostFeed filtered by project, MemberList with avatars and roles, URLList with external link icons, SecondaryRail with stats
- Functionality logic: Fetch project with posts, members, URLs | Show edit action if current user is project creator or member | Posts tab: fetch posts where PostProject.projectId matches, apply same feed logic as home | Members tab: display ProjectMember records with user info | URLs tab: render ProjectUrl records as links | Click edit to navigate to /projects/[id]/edit

### `/projects/[id]/edit`
- Purpose: Edit project details, members, and URLs
- Layout: Same form layout as /projects/new but pre-populated with existing data
- Components: FormCard with 'Cancel'/'Save' actions, CoverImageUpload with current cover, NameInput with current name, LexicalEditor with current description, TeamMemberMultiSelect with current members, URLListEditor with current URLs
- Functionality logic: Fetch project, verify current user is creator or member, redirect if not | Pre-populate all fields with existing data | On save: update Project record, sync ProjectMember records (add/remove), sync ProjectUrl records (add/remove/update) | Navigate back to /projects/[id] after save

### `/notifications`
- Purpose: Activity feed showing comments, replies, mentions, and reactions
- Layout: Full-width list with sticky top header. Each notification item shows actor avatar, action description, timestamp, target post/comment preview. Unread notifications have accent border. Empty state if no notifications. Mark as read on view.
- Components: StickyHeader with 'Mark all read' action, NotificationList, NotificationItem with avatar, description, timestamp, preview, EmptyNotificationsState
- Functionality logic: Fetch notifications for current user ordered by createdAt DESC | Group by date (Today, Yesterday, This Week, Older) | Show actor displayName, action type (commented on, replied to, mentioned you in, reacted to), target post title or comment preview | Mark notification as read when viewed (update read=true) | Click notification to navigate to target post or comment | Polling or real-time updates to show new notifications without refresh

### `/settings`
- Purpose: User profile settings: display name and avatar upload
- Layout: Centered card (max-width 600px) with sections stacked vertically. Avatar upload with current avatar preview. Display name input. Email (read-only). Account created date (read-only). Save button at bottom.
- Components: SettingsCard, AvatarUpload with preview, DisplayNameInput, ReadOnlyEmailField, AccountMetadata, SaveButton
- Functionality logic: Fetch current user data | Upload avatar to R2, get presigned URL | Validate displayName not empty | On save: update User record (displayName, avatarUrl) | Show success toast after save

### `/admin/users`
- Purpose: Admin panel for user management: view all users, promote/demote roles, deactivate users
- Layout: Sticky top header with 'Regenerate Invite Link' action. Table with columns: Avatar, Name, Email, Role, Posts, Comments, Status, Actions. Each row has role dropdown (MEMBER/ADMIN/OWNER) and Deactivate/Activate toggle. Floating action menu in bottom-right with 'Invite User' (shows invite link dialog).
- Components: StickyHeader with invite link action, UserTable with sortable columns, UserRow with avatar, name, email, role dropdown, stats, status badge, action buttons, FloatingActionMenu with invite link dialog, RoleDropdown with MEMBER/ADMIN/OWNER, DeactivateToggle
- Functionality logic: Verify current user role is ADMIN or OWNER, redirect to / if not | Fetch all users with post count, comment count, role, deactivated status | Change role: update User.role, show optimistic UI, prevent demoting last OWNER | Deactivate user: update User.deactivated=true, prevent user from deactivating themselves | Regenerate invite link: update SiteSettings.inviteToken with new random token, show dialog with link | Show invite link in dialog with copy button

### `/admin/settings`
- Purpose: Admin panel for site-wide settings: site name, webhook URLs, custom emoji
- Layout: Card-based layout with sections: Site Settings (name), Integrations (Discord/Slack webhook URLs), Custom Emoji (upload and list). Each section has card with header, fields, and save action.
- Components: SettingsCard with section header, SiteNameInput, WebhookURLInput for Discord and Slack, CustomEmojiUpload, CustomEmojiList with delete action, SaveButton per section
- Functionality logic: Verify current user role is ADMIN or OWNER, redirect to / if not | Fetch SiteSettings (id='default'), ensure record exists | Update site name: update SiteSettings.siteName | Update webhook URLs: validate HTTPS, update SiteSettings.discordWebhookUrl and slackWebhookUrl | Upload custom emoji: upload to R2, create CustomEmoji record with name and URL | Delete custom emoji: delete CustomEmoji record, remove from R2 | Show success toast after each save

### Module + Interface Implementation Plan
#### Modules
- app/layout.tsx - Root layout with NextAuth provider, theme provider, command palette wrapper
- app/page.tsx - Home feed page with view toggle and infinite scroll
- app/compose/page.tsx - Post creation page with Lexical editor
- app/post/[id]/page.tsx - Post detail page with comments and reactions
- app/post/[id]/edit/page.tsx - Post edit page
- app/projects/page.tsx - Projects grid page
- app/projects/new/page.tsx - New project form
- app/projects/[id]/page.tsx - Project detail page with tabs
- app/projects/[id]/edit/page.tsx - Project edit form
- app/notifications/page.tsx - Notifications feed

#### Functionality logic
- Authentication: NextAuth with credentials provider, JWT sessions, password hashing with bcrypt, session checks in API routes and pages
- Authorization: Middleware checks user role (OWNER/ADMIN/MEMBER) for admin routes, post/comment author checks for edit/delete, deactivated user redirect to /deactivated
- Post creation: Lexical editor state saved as JSON, auto-save draft every 2 seconds, extract @mentions, upload attachments to R2 with presigned URLs, create Post and Attachment records in transaction, create PostProject junctions, trigger webhooks, send mention notifications
- Post editing: Load existing post, verify author, update Post record, sync attachments (add/remove), sync projects, extract new @mentions, send new notifications
- Comments: Two-level threading (parent.parentId must be null), Lexical content as JSON, optional attachmentId and coordinates for attachment-specific comments, create COMMENT or COMMENT_REPLY notifications, exclude notifications for comment author
- Reactions: Unique per user per entity (post or comment), upsert Reaction record, create REACTION_POST or REACTION_COMMENT notification, display grouped by emoji with count
- Notifications: Create on comment/reply/mention/reaction, exclude if user is target author, mark as read when viewing notification or target post, real-time updates via polling or WebSocket
- Projects: Create with name/description/cover/members/URLs, project creators and members can edit, posts can be assigned to multiple projects via PostProject junction, project feed filters posts by project
- File uploads: Generate presigned URL for R2 upload, client uploads directly to R2, server stores metadata in Attachment table with type (IMAGE/VIDEO/FILE/FIGMA/LOOM), order field for carousel sequence, presigned URLs for private access
- Search: Command palette (Cmd+K) with full-text search across posts, projects, users, search only active (non-deactivated) users, navigate to result on select
- Webhooks: On post creation, send JSON payload to Discord and Slack webhook URLs if configured, async/background job, retry on failure
- User management: First user becomes OWNER, subsequent users register via invite token as MEMBER, admins can promote/demote roles, deactivate users (cannot deactivate self), regenerate invite token

#### Interfaces
- POST /api/posts - Create post: { title?, content: JSON, liveUrl?, hideFromHome: boolean, projectIds: string[], attachments: Attachment[] } → { postId: string }
- GET /api/posts - List posts: { cursor?, projectId?, limit: number } → { posts: Post[], nextCursor?: string }
- GET /api/posts/[id] - Get post detail → { post: Post, author: User, attachments: Attachment[], projects: Project[], comments: Comment[], reactions: Reaction[] }
- PATCH /api/posts/[id] - Update post: { title?, content: JSON, liveUrl?, hideFromHome: boolean, projectIds: string[], attachments: Attachment[] } → { success: boolean }
- DELETE /api/posts/[id] - Delete post → { success: boolean }
- POST /api/comments - Create comment: { content: JSON, postId: string, parentId?: string, attachmentId?: string, coordinates?: { x: number, y: number } } → { commentId: string }
- PATCH /api/comments/[id] - Update comment: { content: JSON } → { success: boolean }
- DELETE /api/comments/[id] - Delete comment → { success: boolean }
- POST /api/reactions - Add/remove reaction: { postId?: string, commentId?: string, emoji: string, emojiId?: string } → { success: boolean }
- GET /api/projects - List projects → { projects: Project[] }

### Data + Database Design
#### Data Models (Priority Set)
- User: { id: cuid, email: unique string, passwordHash: string, displayName: string, avatarUrl?: string, role: enum(MEMBER,ADMIN,OWNER), deactivated: boolean, createdAt: DateTime, updatedAt: DateTime }
- Post: { id: cuid, title?: string, content: JSON, liveUrl?: string, hideFromHome: boolean default false, authorId: string, author: User, createdAt: DateTime, updatedAt: DateTime, attachments: Attachment[], projects: Project[], comments: Comment[], reactions: Reaction[] }
- Attachment: { id: cuid, postId: string, post: Post, type: enum(IMAGE,VIDEO,FILE,FIGMA,LOOM), url: string, filename: string, mimeType: string, size: int, width?: int, height?: int, thumbnailUrl?: string, metadata?: JSON, order: int, createdAt: DateTime }
- Project: { id: cuid, name: string, description?: JSON, coverUrl?: string, createdById: string, createdBy: User, createdAt: DateTime, updatedAt: DateTime, members: ProjectMember[], urls: ProjectUrl[], posts: Post[] }
- ProjectMember: { id: cuid, projectId: string, project: Project, userId: string, user: User, role: string default 'MEMBER', createdAt: DateTime }
- ProjectUrl: { id: cuid, projectId: string, project: Project, title: string, url: string }
- Comment: { id: cuid, content: JSON, authorId: string, author: User, postId: string, post: Post, parentId?: string, parent?: Comment, replies: Comment[], attachmentId?: string, attachment?: Attachment, coordinates?: JSON, createdAt: DateTime, updatedAt: DateTime, reactions: Reaction[] }
- Reaction: { id: cuid, userId: string, user: User, postId?: string, post?: Post, commentId?: string, comment?: Comment, emojiId?: string, customEmoji?: CustomEmoji, emoji: string, createdAt: DateTime } - Unique constraint: [userId, postId, commentId]

#### Database design
- Create Prisma schema with datasource postgresql and generator client
- Add cuid() default for all id fields
- Add indexes: User.email unique, Reaction unique [userId, postId, commentId], PasswordResetToken.token unique, SiteSettings.id fixed as 'default'
- Add indexes for performance: Post.createdAt desc, Post.authorId, Comment.postId, Comment.parentId, Notification.userId + createdAt desc, ProjectMember.projectId + userId
- Add cascade deletes: Post delete → cascade Attachment/Comment/Reaction/Notification, Comment delete → cascade child Comments/Reactions/Notifications, Project delete → cascade ProjectMember/ProjectUrl/PostProject
- Add onDelete: SetNull for optional foreign keys like Comment.parentId, Comment.attachmentId, Reaction.emojiId
- Add @updatedAt directive to Post, Project, User, SiteSettings for automatic timestamp updates
- Create initial migration with schema.prisma as source
- Seed script: create SiteSettings record with id='default', generate random inviteToken, set default siteName
- Add fulltext search index on Post.title and Post.content if using PostgreSQL FTS

### Design System (Detailed, Implementable)
#### Visual Direction
- Technical workspace with high information density, strong hierarchy, restrained accents, and explicit state feedback. Layered surfaces with crisp borders and subtle shadows for depth. Disciplined spacing and alignment. Utility-driven composition with Tailwind CSS.

#### Color Tokens (Use Exact Hex)
- Background: `#0F0E0D`
- Surface: `#1A1918` | Surface Alt: `#262422`
- Text: `#F3F4F6` | Muted Text: `#9CA3AF`
- Border: `#374151`
- Primary: `#3B82F6` | Primary Hover: `#2563EB`
- Accent: `#14B8A6`
- Semantic: success `#22C55E`, warning `#F59E0B`, danger `#EF4444`

#### Typography + Radius
- Primary UI font: system font stack (ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
- Monospace font: ui-monospace, 'SF Mono', 'Consolas', monospace for technical metadata and code
- Heading scale: h1 (2.25rem/600), h2 (1.875rem/600), h3 (1.5rem/600), h4 (1.25rem/600), h5 (1.125rem/600), h6 (1rem/600)
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
- Fast: 150ms for hover states, button presses, small UI transitions
- Standard: 250ms for modal/sheet entry, dropdown open, page transitions
- Slow: 350ms for large surface animations, page-level state changes
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
- Cloudflare R2 bucket configured with appropriate CORS settings for direct uploads
- PostgreSQL database supports JSON column type for Lexical content storage
- NextAuth session tokens stored in JWT format with server-side secret
- Prisma connection pooling handles concurrent user requests efficiently
- R2 presigned URLs expire after reasonable timeframe (implementation dependent)
- Webhook endpoints (Discord/Slack) accept JSON payloads with post metadata

### Risks and Edge Cases
- Unknown to validate: Maximum file size limits for attachment uploads
- Unknown to validate: R2 presigned URL expiration duration configuration
- Unknown to validate: Rate limiting implementation for API endpoints
- Unknown to validate: Webhook retry logic on failure
- Unknown to validate: Image compression or optimization pipeline before R2 upload
- Unknown to validate: Video thumbnail generation method (client-side, R2 transform, external service)
- Scope boundary: Real-time collaborative editing of posts (use auto-save drafts instead)
- Scope boundary: Video transcoding or thumbnail generation (store original files only)

## Phase 4: Final Plan
### Recommended Approach
- Implement the plan as a single coherent approach (no parallel competing implementations).
- Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes.

### Implementation Steps
1. 1. Initialize Next.js project with TypeScript, Tailwind CSS, ESLint: npx create-next-app@latest --typescript --tailwind --eslint
2. 2. Install dependencies: npm install prisma @prisma/client next-auth bcryptjs @lexical/react lexical @aws-sdk/client-s3 @aws-sdk/s3-request-presigner zod react-hook-form
3. 3. Install dev dependencies: npm install -D @types/bcryptjs @types/node tsx
4. 4. Initialize Prisma: npx prisma init --datasource-provider postgresql
5. 5. Define Prisma schema in prisma/schema.prisma with all models (User, Post, Attachment, Project, ProjectMember, ProjectUrl, Comment, Reaction, Notification, CustomEmoji, SiteSettings, Draft, PasswordResetToken) and relations
6. 6. Create initial migration: npx prisma migrate dev --name init
7. 7. Create lib/prisma.ts with PrismaClient singleton for connection pooling
8. 8. Configure NextAuth in app/api/auth/[...nextauth]/route.ts with credentials provider, JWT session, password verification with bcrypt
9. 9. Create lib/auth.ts with getServerSession helper and role check utilities
10. 10. Configure Cloudflare R2 client in lib/r2.ts with S3Client and presigned URL generation
11. 11. Create seed script prisma/seed.ts to initialize SiteSettings record with id='default', generate random inviteToken
12. 12. Run seed: npx prisma db seed
13. 13. Install shadcn/ui CLI: npx shadcn-ui@latest init, configure with Tailwind and component path
14. 14. Add shadcn components: npx shadcn-ui@latest add button input card avatar badge dialog sheet dropdown-menu toast
15. 15. Create design system tokens in tailwind.config.ts extending theme with custom colors (primary #1A1918, secondary #F5F4F2), radius scale (xs 2px, sm 4px, md 6px, lg 8px, xl 12px), font families
16. 16. Build Lexical editor component in components/lexical/LexicalEditor.tsx with RichTextPlugin, AutoFocusPlugin, MentionPlugin, MarkdownShortcutPlugin, DragDropPastePlugin
17. 17. Build Lexical renderer in components/lexical/LexicalRenderer.tsx to convert JSON state to HTML
18. 18. Create API route app/api/posts/route.ts for GET (list with pagination) and POST (create with transaction)
19. 19. Create API route app/api/posts/[id]/route.ts for GET (detail), PATCH (update), DELETE (with author check)
20. 20. Create API route app/api/comments/route.ts for POST (create with notification logic)
21. 21. Create API route app/api/comments/[id]/route.ts for PATCH (update), DELETE (with author check)
22. 22. Create API route app/api/reactions/route.ts for POST (upsert with unique constraint, notification)
23. 23. Create API route app/api/projects/route.ts for GET (list), POST (create with transaction)
24. 24. Create API route app/api/projects/[id]/route.ts for GET (detail), PATCH (update with sync logic), DELETE
25. 25. Create API route app/api/notifications/route.ts for GET (list with pagination), PATCH (mark read)
26. 26. Create API route app/api/users/route.ts for GET (admin only, all users), PATCH (update user with role/deactivation checks)
27. 27. Create API route app/api/admin/settings/route.ts for GET/PATCH (admin only, SiteSettings)
28. 28. Create API route app/api/admin/invite-token/route.ts for POST (regenerate token)
29. 29. Create API route app/api/upload/presigned-url/route.ts for POST (generate R2 presigned URL with validation)
30. 30. Create API route app/api/webhooks/notify/route.ts for POST (send Discord/Slack webhook with post data)
31. 31. Create lib/notifications.ts with helper functions to create COMMENT, COMMENT_REPLY, REACTION_POST, REACTION_COMMENT, MENTION notifications with exclusion logic
32. 32. Create lib/mentions.ts with function to extract @mentions from Lexical JSON state and validate against User table
33. 33. Create lib/webhooks.ts with functions to format and send Discord/Slack webhook payloads
34. 34. Create lib/validations.ts with Zod schemas for API request validation
35. 35. Build home page app/page.tsx with feed, view toggle (list/grid), infinite scroll using IntersectionObserver
36. 36. Build compose page app/compose/page.tsx with LexicalEditor, attachment upload zone, project multi-select, hideFromHome checkbox, auto-save draft logic
37. 37. Build post detail page app/post/[id]/page.tsx with content render, attachment carousel, comment thread, reaction bar
38. 38. Build post edit page app/post/[id]/edit/page.tsx with same editor as compose, pre-populated with existing data
39. 39. Build projects list page app/projects/page.tsx with grid layout, project cards with cover/name/stats
40. 40. Build new project page app/projects/new/page.tsx with form for name/description/cover/members/URLs
41. 41. Build project detail page app/projects/[id]/page.tsx with tabs (Posts, Members, URLs), filtered feed for Posts tab
42. 42. Build project edit page app/projects/[id]/edit/page.tsx with same form as new, pre-populated
43. 43. Build notifications page app/notifications/page.tsx with list grouped by date, mark read on view
44. 44. Build settings page app/settings/page.tsx with avatar upload, displayName input, account metadata
45. 45. Build admin users page app/admin/users/page.tsx with table, role dropdown, deactivate toggle, floating action menu with invite link dialog
46. 46. Build admin settings page app/admin/settings/page.tsx with sections for site name, webhook URLs, custom emoji upload/list
47. 47. Build invite registration page app/invite/[token]/page.tsx with form, token validation, first user becomes OWNER logic
48. 48. Build password reset page app/reset-password/[token]/page.tsx with form, token validation, password update
49. 49. Build deactivated page app/deactivated/page.tsx with static message and sign-out link
50. 50. Build root layout app/layout.tsx with NextAuthProvider, theme provider (light/dark mode), command palette wrapper
51. 51. Create components/CommandPalette.tsx with search input, results list (posts/projects/users), keyboard navigation
52. 52. Create components/PostCard.tsx with author info, content preview, attachment previews, reaction counts, click to detail
53. 53. Create components/PostGridItem.tsx with compact layout, cover image, title, hover overlay
54. 54. Create components/AttachmentCarousel.tsx with image viewer, video player, file download, navigation arrows, coordinate comment overlay
55. 55. Create components/CommentThread.tsx with nested structure (max 2 levels), reply button, edit/delete actions
56. 56. Create components/ReactionBar.tsx with emoji picker (built-in + custom), reaction counts, reactors dialog
57. 57. Create components/NotificationItem.tsx with actor avatar, action description, timestamp, target preview, unread indicator
58. 58. Create components/FloatingActionMenu.tsx with fixed bottom-right position, elevated surface, quick actions
59. 59. Create middleware.ts to check auth status, redirect deactivated users to /deactivated, protect admin routes
60. 60. Add environment variables to .env: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
61. 61. Configure next.config.js with images domains for R2 URLs, experimental features if needed
62. 62. Create public/manifest.json for PWA with name, icons, theme color, start URL
63. 63. Add service worker registration in app/layout.tsx for PWA offline support
64. 64. Write unit tests with Vitest for lib helpers (notifications, mentions, webhooks)
65. 65. Write integration tests with Testing Library for key flows (post creation, comment threading, reactions)
66. 66. Run type checking: npx tsc --noEmit
67. 67. Run linting: npm run lint
68. 68. Run tests: npm run test
69. 69. Build production bundle: npm run build
70. 70. Deploy to Vercel or similar platform with environment variables configured

### Testing
- User registration: First user receives OWNER role, subsequent users with valid invite token receive MEMBER role, invalid token shows error
- Authentication: Sign in with valid credentials succeeds, invalid credentials show error, deactivated users redirect to /deactivated
- Post creation: Valid post with content saves successfully, attachments upload to R2 and store metadata, projects assigned via junction table, webhook fires if configured, mentions send notifications
- Post editing: Only post author can edit, updates save correctly, new attachments add with incremented order, removed attachments delete from R2
- Comment threading: Top-level comments save with postId, replies save with parentId, replies to replies blocked (max 2 levels), notifications sent to parent author and mentioned users
- Reactions: Clicking reaction adds record with unique constraint, clicking again removes, notification sent to entity author, reaction counts display correctly
- Notifications: Created on comment/reply/mention/reaction, excluded if actor is entity author, marked as read when viewing, displayed in chronological order
- Projects: Created with name/description/cover/members/URLs, project feed filters posts correctly, edit syncs members and URLs, delete cascades to junction tables
- File uploads: Presigned URL generated for R2, client uploads directly, metadata saved with type/size/mime, presigned URLs for private access
- Search: Command palette opens on Cmd+K, searches posts/projects/users, navigates to result on Enter, closes on Esc
- Admin users: Role changes update correctly, cannot demote last OWNER, cannot deactivate self, deactivated users cannot access main routes
- Admin settings: Site name updates, webhook URLs validate HTTPS, custom emoji uploads to R2 and saves record
- Password reset: Token generated with 24-hour expiration, valid token allows password update, used token invalid, expired token invalid
- Drafts: Content auto-saves every 2 seconds, loads on compose page visit, clears after publish
- Feed: Posts display in reverse chronological order, infinite scroll loads next page, hideFromHome flag filters correctly
- View modes: List and grid views toggle correctly, preference persists across sessions
- Responsive: All pages render correctly on mobile/tablet/desktop, floating action menu visible on mobile, secondary rail hidden on small screens

### Rollout and Migration Notes
- Create Prisma schema with datasource postgresql and generator client
- Add cuid() default for all id fields
- Add indexes: User.email unique, Reaction unique [userId, postId, commentId], PasswordResetToken.token unique, SiteSettings.id fixed as 'default'
- Add indexes for performance: Post.createdAt desc, Post.authorId, Comment.postId, Comment.parentId, Notification.userId + createdAt desc, ProjectMember.projectId + userId
- Add cascade deletes: Post delete → cascade Attachment/Comment/Reaction/Notification, Comment delete → cascade child Comments/Reactions/Notifications, Project delete → cascade ProjectMember/ProjectUrl/PostProject
- Add onDelete: SetNull for optional foreign keys like Comment.parentId, Comment.attachmentId, Reaction.emojiId

## Implementation Prompt (LLM Ready)
```markdown
Implement hrescak/Draftboard using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
Draftboard is an internal design sharing platform built on Next.js with Prisma and NextAuth. It provides a social feed for distributed teams to post designs, ideas, and work-in-progress with rich media attachments, threaded comments, reactions, and notifications. The system uses Cloudflare R2 for file storage, supports role-based access control (OWNER/ADMIN/MEMBER), and includes admin tools for user management, site configuration, and webhook integrations.

## Route Fidelity Requirements
- /: Sticky top header with view mode toggle (list/grid), search trigger (Cmd+K), notification bell, profile menu, and 'New Post' action. Main content region with infinite scroll feed. Empty state shown when no posts exist. Loading skeleton during fetch. No sidebar. Components: StickyHeader with action cluster, FeedViewToggle (list/grid), PostCard or PostGridItem, InfiniteScrollTrigger. Logic: Fetch posts ordered by createdAt DESC with cursor pagination | Filter by project if query param present | Exclude hideFromHome=true posts unless viewing project context | Show author avatar, displayName, post title, content preview, attachments, reaction counts | Click post to navigate to /post/[id] | Infinite scroll loads next page when trigger enters viewport
- /compose: Sticky top header with 'Cancel' and 'Publish' actions, save status indicator. Full-width editor canvas with Lexical rich text, attachment upload zone below editor, project multi-select, 'Hide from home feed' checkbox. No sidebar. Bottom padding for comfortable editing. Components: StickyHeader with save status, LexicalEditor with markdown shortcuts, @mentions, slash commands, AttachmentUploadZone with drag-and-drop, AttachmentCarousel for uploaded files. Logic: Initialize Lexical editor with empty state or draft if exists | Auto-save draft to database every 2 seconds on content change | Extract @mentions from Lexical JSON and validate against users | Upload attachments to R2 via presigned URLs, store metadata in DB with order field | On publish: create Post record, create Attachment records, create PostProject junction records, trigger webhook notifications, send mention notifications | Validate title and content not empty before publish | Clear draft after successful publish
- /post/[id]: Contextual header with post metadata (author avatar, displayName, createdAt, project badges) and actions (Edit if author, Delete if author). Primary content region with full Lexical-rendered content. Attachment carousel below content with coordinate-based comment indicators. Comment thread list with 2-level nesting. Reaction bar at bottom of post with built-in + custom emoji picker. Secondary rail on desktop showing project details and related posts. Components: ContextHeader with author info and actions, LexicalRenderer for post content, AttachmentCarousel with coordinate comment markers, ReactionBar with emoji picker. Logic: Fetch post with author, attachments ordered by order field, projects, comments with nested replies (max 2 levels), reactions grouped by emoji | Render Lexical JSON into HTML preserving mentions, formatting, embeds | Show Edit/Delete actions only if current user is post author | For attachments: display based on type (IMAGE: img tag, VIDEO: video player, FILE: download link, FIGMA: embed iframe, LOOM: embed iframe) | Click attachment to open fullscreen viewer with coordinate comment overlay | Add reaction: upsert Reaction record, show optimistic UI, create REACTION_POST notification for post author | Add comment: create Comment record, send COMMENT notification to post author and mentioned users, send webhook if top-level | Reply to comment: create Comment with parentId, send COMMENT_REPLY notification to parent author and mentioned users | Exclude notifications if user is author of target entity | Mark related notifications as read when viewing post
- /post/[id]/edit: Identical to /compose layout but pre-populated with existing post data Components: StickyHeader with save status and 'Cancel'/'Save' actions, LexicalEditor initialized with existing content JSON, AttachmentUploadZone with existing attachments, ProjectMultiSelect with current selections. Logic: Fetch post with attachments and projects, verify current user is author, redirect if not | Initialize Lexical editor with post.content JSON | Display existing attachments with delete option | Allow adding new attachments, maintain order field sequence | On save: update Post record, upsert PostProject junctions, update/delete Attachment records | Extract new @mentions and send notifications | Do not trigger webhook on edit | Navigate back to /post/[id] after save
- /projects: Sticky top header with 'New Project' action. Grid of project cards (3-4 columns on desktop, 1-2 on mobile). Each card shows cover image, project name, description preview, member avatars, post count. Empty state if no projects exist. Components: StickyHeader with 'New Project' button, ProjectGrid, ProjectCard with cover, name, description, members, post count, EmptyProjectsState. Logic: Fetch all projects with member count, post count, cover URL | Click project card to navigate to /projects/[id] | Only show 'New Project' action to authenticated users
- /projects/new: Centered form card (max-width 600px) with fields stacked vertically. Header with 'Cancel' and 'Create' actions. Cover image upload at top, name input, Lexical description editor, team member multi-select, URL list with add/remove. Components: FormCard with header actions, CoverImageUpload with drag-and-drop, NameInput (required), LexicalEditor for description. Logic: Upload cover image to R2, get presigned URL | Validate name is not empty | On create: insert Project record with createdById, create ProjectMember records for selected users with role='MEMBER', create ProjectUrl records for each URL | Navigate to /projects/[id] after creation
- /projects/[id]: Hero header with cover image, project name, description, edit action (if creator or member). Tab navigation for 'Posts', 'Members', 'URLs'. Posts tab shows filtered feed (same as home but filtered to this project). Members tab shows avatar list with role badges. URLs tab shows clickable link list. Secondary rail on desktop with quick stats. Components: ProjectHero with cover, name, description, edit button, TabNavigation, PostFeed filtered by project, MemberList with avatars and roles. Logic: Fetch project with posts, members, URLs | Show edit action if current user is project creator or member | Posts tab: fetch posts where PostProject.projectId matches, apply same feed logic as home | Members tab: display ProjectMember records with user info | URLs tab: render ProjectUrl records as links | Click edit to navigate to /projects/[id]/edit
- /projects/[id]/edit: Same form layout as /projects/new but pre-populated with existing data Components: FormCard with 'Cancel'/'Save' actions, CoverImageUpload with current cover, NameInput with current name, LexicalEditor with current description. Logic: Fetch project, verify current user is creator or member, redirect if not | Pre-populate all fields with existing data | On save: update Project record, sync ProjectMember records (add/remove), sync ProjectUrl records (add/remove/update) | Navigate back to /projects/[id] after save
- /notifications: Full-width list with sticky top header. Each notification item shows actor avatar, action description, timestamp, target post/comment preview. Unread notifications have accent border. Empty state if no notifications. Mark as read on view. Components: StickyHeader with 'Mark all read' action, NotificationList, NotificationItem with avatar, description, timestamp, preview, EmptyNotificationsState. Logic: Fetch notifications for current user ordered by createdAt DESC | Group by date (Today, Yesterday, This Week, Older) | Show actor displayName, action type (commented on, replied to, mentioned you in, reacted to), target post title or comment preview | Mark notification as read when viewed (update read=true) | Click notification to navigate to target post or comment | Polling or real-time updates to show new notifications without refresh
- /settings: Centered card (max-width 600px) with sections stacked vertically. Avatar upload with current avatar preview. Display name input. Email (read-only). Account created date (read-only). Save button at bottom. Components: SettingsCard, AvatarUpload with preview, DisplayNameInput, ReadOnlyEmailField. Logic: Fetch current user data | Upload avatar to R2, get presigned URL | Validate displayName not empty | On save: update User record (displayName, avatarUrl) | Show success toast after save

## Non-negotiable Rules
- First user self-registers and becomes OWNER, all subsequent registrations require valid invite token and create MEMBER role
- Admin routes (/admin/*) require role ADMIN or OWNER, redirect to / if unauthorized
- Deactivated users redirected to /deactivated on any protected route access
- Users cannot deactivate themselves, only admins can deactivate other users
- At least one OWNER or ADMIN must exist in system at all times (prevent demoting last OWNER)
- Post edit and delete actions only visible to post author
- Comment edit and delete actions only visible to comment author
- Project edit action only visible to project creator and members
- Comment threading limited to 2 levels: can reply to top-level comment but not to reply
- Notifications not sent if actor is the target entity author (e.g., user cannot notify themselves by commenting on own post)

## Build Order
1. 1. Initialize Next.js project with TypeScript, Tailwind CSS, ESLint: npx create-next-app@latest --typescript --tailwind --eslint
2. 2. Install dependencies: npm install prisma @prisma/client next-auth bcryptjs @lexical/react lexical @aws-sdk/client-s3 @aws-sdk/s3-request-presigner zod react-hook-form
3. 3. Install dev dependencies: npm install -D @types/bcryptjs @types/node tsx
4. 4. Initialize Prisma: npx prisma init --datasource-provider postgresql
5. 5. Define Prisma schema in prisma/schema.prisma with all models (User, Post, Attachment, Project, ProjectMember, ProjectUrl, Comment, Reaction, Notification, CustomEmoji, SiteSettings, Draft, PasswordResetToken) and relations
6. 6. Create initial migration: npx prisma migrate dev --name init
7. 7. Create lib/prisma.ts with PrismaClient singleton for connection pooling
8. 8. Configure NextAuth in app/api/auth/[...nextauth]/route.ts with credentials provider, JWT session, password verification with bcrypt
9. 9. Create lib/auth.ts with getServerSession helper and role check utilities
10. 10. Configure Cloudflare R2 client in lib/r2.ts with S3Client and presigned URL generation
11. 11. Create seed script prisma/seed.ts to initialize SiteSettings record with id='default', generate random inviteToken
12. 12. Run seed: npx prisma db seed
13. 13. Install shadcn/ui CLI: npx shadcn-ui@latest init, configure with Tailwind and component path
14. 14. Add shadcn components: npx shadcn-ui@latest add button input card avatar badge dialog sheet dropdown-menu toast
15. 15. Create design system tokens in tailwind.config.ts extending theme with custom colors (primary #1A1918, secondary #F5F4F2), radius scale (xs 2px, sm 4px, md 6px, lg 8px, xl 12px), font families
16. 16. Build Lexical editor component in components/lexical/LexicalEditor.tsx with RichTextPlugin, AutoFocusPlugin, MentionPlugin, MarkdownShortcutPlugin, DragDropPastePlugin
17. 17. Build Lexical renderer in components/lexical/LexicalRenderer.tsx to convert JSON state to HTML
18. 18. Create API route app/api/posts/route.ts for GET (list with pagination) and POST (create with transaction)
19. 19. Create API route app/api/posts/[id]/route.ts for GET (detail), PATCH (update), DELETE (with author check)
20. 20. Create API route app/api/comments/route.ts for POST (create with notification logic)
21. 21. Create API route app/api/comments/[id]/route.ts for PATCH (update), DELETE (with author check)
22. 22. Create API route app/api/reactions/route.ts for POST (upsert with unique constraint, notification)
23. 23. Create API route app/api/projects/route.ts for GET (list), POST (create with transaction)
24. 24. Create API route app/api/projects/[id]/route.ts for GET (detail), PATCH (update with sync logic), DELETE
25. 25. Create API route app/api/notifications/route.ts for GET (list with pagination), PATCH (mark read)
26. 26. Create API route app/api/users/route.ts for GET (admin only, all users), PATCH (update user with role/deactivation checks)
27. 27. Create API route app/api/admin/settings/route.ts for GET/PATCH (admin only, SiteSettings)
28. 28. Create API route app/api/admin/invite-token/route.ts for POST (regenerate token)
29. 29. Create API route app/api/upload/presigned-url/route.ts for POST (generate R2 presigned URL with validation)
30. 30. Create API route app/api/webhooks/notify/route.ts for POST (send Discord/Slack webhook with post data)
31. 31. Create lib/notifications.ts with helper functions to create COMMENT, COMMENT_REPLY, REACTION_POST, REACTION_COMMENT, MENTION notifications with exclusion logic
32. 32. Create lib/mentions.ts with function to extract @mentions from Lexical JSON state and validate against User table
33. 33. Create lib/webhooks.ts with functions to format and send Discord/Slack webhook payloads
34. 34. Create lib/validations.ts with Zod schemas for API request validation
35. 35. Build home page app/page.tsx with feed, view toggle (list/grid), infinite scroll using IntersectionObserver
36. 36. Build compose page app/compose/page.tsx with LexicalEditor, attachment upload zone, project multi-select, hideFromHome checkbox, auto-save draft logic
37. 37. Build post detail page app/post/[id]/page.tsx with content render, attachment carousel, comment thread, reaction bar
38. 38. Build post edit page app/post/[id]/edit/page.tsx with same editor as compose, pre-populated with existing data
39. 39. Build projects list page app/projects/page.tsx with grid layout, project cards with cover/name/stats
40. 40. Build new project page app/projects/new/page.tsx with form for name/description/cover/members/URLs
41. 41. Build project detail page app/projects/[id]/page.tsx with tabs (Posts, Members, URLs), filtered feed for Posts tab
42. 42. Build project edit page app/projects/[id]/edit/page.tsx with same form as new, pre-populated
43. 43. Build notifications page app/notifications/page.tsx with list grouped by date, mark read on view
44. 44. Build settings page app/settings/page.tsx with avatar upload, displayName input, account metadata
45. 45. Build admin users page app/admin/users/page.tsx with table, role dropdown, deactivate toggle, floating action menu with invite link dialog
46. 46. Build admin settings page app/admin/settings/page.tsx with sections for site name, webhook URLs, custom emoji upload/list
47. 47. Build invite registration page app/invite/[token]/page.tsx with form, token validation, first user becomes OWNER logic
48. 48. Build password reset page app/reset-password/[token]/page.tsx with form, token validation, password update
49. 49. Build deactivated page app/deactivated/page.tsx with static message and sign-out link
50. 50. Build root layout app/layout.tsx with NextAuthProvider, theme provider (light/dark mode), command palette wrapper
51. 51. Create components/CommandPalette.tsx with search input, results list (posts/projects/users), keyboard navigation
52. 52. Create components/PostCard.tsx with author info, content preview, attachment previews, reaction counts, click to detail
53. 53. Create components/PostGridItem.tsx with compact layout, cover image, title, hover overlay
54. 54. Create components/AttachmentCarousel.tsx with image viewer, video player, file download, navigation arrows, coordinate comment overlay
55. 55. Create components/CommentThread.tsx with nested structure (max 2 levels), reply button, edit/delete actions
56. 56. Create components/ReactionBar.tsx with emoji picker (built-in + custom), reaction counts, reactors dialog
57. 57. Create components/NotificationItem.tsx with actor avatar, action description, timestamp, target preview, unread indicator
58. 58. Create components/FloatingActionMenu.tsx with fixed bottom-right position, elevated surface, quick actions
59. 59. Create middleware.ts to check auth status, redirect deactivated users to /deactivated, protect admin routes
60. 60. Add environment variables to .env: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
61. 61. Configure next.config.js with images domains for R2 URLs, experimental features if needed
62. 62. Create public/manifest.json for PWA with name, icons, theme color, start URL
63. 63. Add service worker registration in app/layout.tsx for PWA offline support
64. 64. Write unit tests with Vitest for lib helpers (notifications, mentions, webhooks)
65. 65. Write integration tests with Testing Library for key flows (post creation, comment threading, reactions)
66. 66. Run type checking: npx tsc --noEmit
67. 67. Run linting: npm run lint
68. 68. Run tests: npm run test
69. 69. Build production bundle: npm run build
70. 70. Deploy to Vercel or similar platform with environment variables configured

## Test Gates
- User registration: First user receives OWNER role, subsequent users with valid invite token receive MEMBER role, invalid token shows error
- Authentication: Sign in with valid credentials succeeds, invalid credentials show error, deactivated users redirect to /deactivated
- Post creation: Valid post with content saves successfully, attachments upload to R2 and store metadata, projects assigned via junction table, webhook fires if configured, mentions send notifications
- Post editing: Only post author can edit, updates save correctly, new attachments add with incremented order, removed attachments delete from R2
- Comment threading: Top-level comments save with postId, replies save with parentId, replies to replies blocked (max 2 levels), notifications sent to parent author and mentioned users
- Reactions: Clicking reaction adds record with unique constraint, clicking again removes, notification sent to entity author, reaction counts display correctly
- Notifications: Created on comment/reply/mention/reaction, excluded if actor is entity author, marked as read when viewing, displayed in chronological order
- Projects: Created with name/description/cover/members/URLs, project feed filters posts correctly, edit syncs members and URLs, delete cascades to junction tables
- File uploads: Presigned URL generated for R2, client uploads directly, metadata saved with type/size/mime, presigned URLs for private access
- Search: Command palette opens on Cmd+K, searches posts/projects/users, navigates to result on Enter, closes on Esc
- Admin users: Role changes update correctly, cannot demote last OWNER, cannot deactivate self, deactivated users cannot access main routes
- Admin settings: Site name updates, webhook URLs validate HTTPS, custom emoji uploads to R2 and saves record
- Password reset: Token generated with 24-hour expiration, valid token allows password update, used token invalid, expired token invalid
- Drafts: Content auto-saves every 2 seconds, loads on compose page visit, clears after publish
- Feed: Posts display in reverse chronological order, infinite scroll loads next page, hideFromHome flag filters correctly
- View modes: List and grid views toggle correctly, preference persists across sessions
- Responsive: All pages render correctly on mobile/tablet/desktop, floating action menu visible on mobile, secondary rail hidden on small screens
```